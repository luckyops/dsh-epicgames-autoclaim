import {
  epicSessionFromCookies,
  loginUrl,
  purchaseUrl,
  storeCartUrl,
} from './epic.js';
import {
  EpicApiError,
  queryOfferFree,
  queryOwnership,
  resolveOffer,
  sleep,
} from './epic-api.js';
import { createPageDriver } from './page-driver.js';
import { pruneScreenshots } from './diagnostics.js';
import {
  accountDisplayLabel,
  accountOwnerKey,
} from './state.js';

export const LOGIN_PROFILE_KEY = 'login';

const errMsg = error => (error instanceof Error ? error.message : String(error));

const defaultApi = {
  resolveOffer,
  queryOwnership,
  queryOfferFree,
  sleep,
};

async function readSession(context) {
  return context.cookies(['https://www.epicgames.com', 'https://store.epicgames.com']);
}

function firstOpenPage(context) {
  const pages = typeof context.pages === 'function' ? context.pages() : [];
  return pages.find(p => typeof p.isClosed !== 'function' || !p.isClosed()) ?? null;
}

function hasAnyOpenPage(context, primaryPage) {
  const pages = typeof context.pages === 'function' ? context.pages() : [];
  if (pages.length > 0) {
    return pages.some(p => typeof p.isClosed !== 'function' || !p.isClosed());
  }
  if (primaryPage && typeof primaryPage.isClosed === 'function') {
    return !primaryPage.isClosed();
  }
  return false;
}

/**
 * Complete the $0 order for one offer: open the purchase interstitial,
 * accept agreement gates, click the order button ("Add to library" on
 * today's free checkout), then confirm success by polling the account's
 * entitlements until the offer shows as owned. Epic sometimes gates the
 * checkout with an hCaptcha: when one is detected the browser window stays
 * open and the user is asked to solve it while this poll keeps waiting.
 */
async function purchaseOffer(
  page,
  offer,
  { errorsDir, notify, onOwnershipError, api = defaultApi, driver, signal, pollTimeoutMs = 300_000, pollIntervalMs = 3000 },
) {
  await page.goto(purchaseUrl(offer.namespace, offer.offerId), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForLoadState?.('networkidle', { timeout: 20_000 })?.catch?.(() => {});
  await api.sleep(1500, signal);

  await driver.acceptAgreements(page);
  const click = await driver.clickOrderButton(page);
  if (click !== 'clicked') {
    await driver.shot(page, errorsDir, `order-${Date.now()}.png`);
    return { ok: false, reason: click === 'not-found' ? 'order-button-not-found' : 'order-click-failed' };
  }

  const deadline = Date.now() + pollTimeoutMs; // long enough for a user-solved captcha
  let captchaNotified = false;
  let ownershipErrors = 0;
  while (Date.now() < deadline && !signal?.aborted) {
    const ownership = await api.queryOwnership(page, offer);
    if (ownership.kind === 'ok') {
      if (ownership.owned) return { ok: true };
    } else {
      ownershipErrors += 1;
      onOwnershipError?.(ownership);
      if (ownershipErrors >= 3) break; // Epic unreachable — stop polling
    }
    if (!captchaNotified && driver.hasCaptchaFrame(page)) {
      captchaNotified = true;
      notify?.('captcha.assist');
    }
    await api.sleep(pollIntervalMs, signal);
  }
  await driver.shot(page, errorsDir, `confirm-${Date.now()}.png`);
  return { ok: false, reason: captchaNotified ? 'captcha-timeout' : 'confirm-timeout' };
}

/** Surface a stale persisted-query fingerprint exactly once per run. */
function fingerprintGuard(state, onStale) {
  let reported = false;
  return stale => {
    if (stale && !reported) {
      reported = true;
      onStale?.();
      state.event('api.fingerprint', {}, 'error');
    }
  };
}

/**
 * Claim every not-yet-handled candidate for ONE account, using that
 * account's own browser profile. Ownership errors and stale API
 * fingerprints surface as `error` outcomes (never folded into business
 * conclusions), so the controller can schedule a retry.
 */
export async function runClaimRun({
  browser,
  config = {},
  state,
  candidates,
  errorsDir,
  account,
  api = defaultApi,
  driver = createPageDriver({ extraOrderSelectors: config.extraOrderSelectors }),
  signal,
}) {
  let activeAccount = account;
  let accountLabel = accountDisplayLabel(activeAccount) ?? activeAccount.key;
  let context;
  try {
    context = await browser.acquire(activeAccount.key, {
      headless: config.claimHeadless !== false,
      executablePath: config.executablePath || undefined,
      locale: config.locale,
    });
  } catch (error) {
    state.event('browser.launch-error', { account: accountLabel, message: errMsg(error) }, 'error');
    return { status: 'browser-error', results: [] };
  }

  const page = firstOpenPage(context) ?? await context.newPage();
  page.setDefaultTimeout?.(45_000);
  const results = [];
  let fingerprintStale = false;
  const reportFingerprint = fingerprintGuard(state, () => {
    fingerprintStale = true;
  });

  try {
    await page.goto(storeCartUrl(config.locale), { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await api.sleep(2500, signal);

    if (await driver.isChallengePage(page)) {
      await browser.release();
      state.event('challenge.blocked', { account: accountLabel }, 'error');
      return { status: 'challenge', results: [] };
    }

    const session = epicSessionFromCookies(await readSession(context));
    activeAccount = state.upsertAccount({
      key: activeAccount.key,
      id: session.accountId ?? activeAccount.id,
      name: session.displayName ?? activeAccount.name,
      sessionOk: session.loggedIn,
    });
    const ownerKey = accountOwnerKey(activeAccount);
    accountLabel = accountDisplayLabel(activeAccount) ?? activeAccount.key;

    if (!session.loggedIn) {
      await browser.release();
      state.event('session.expired', { account: accountLabel }, 'warn');
      return { status: 'need-login', results: [] };
    }

    for (const candidate of candidates) {
      if (signal?.aborted) break;
      // Re-check deduplication after session enrichment in case `session.accountId`
      // matched an already-recorded claim for this account.
      if (state.hasClaimed(candidate, activeAccount)) {
        continue;
      }

      const base = {
        account: accountLabel,
        title: candidate.title,
        pageSlug: candidate.pageSlug,
        url: candidate.url,
        image: candidate.image ?? null,
      };
      try {
        const offer = await api.resolveOffer(page, candidate, config, {
          onFingerprintStale: reportFingerprint,
        });
        if (!offer) {
          results.push({ ...base, outcome: 'skipped', reason: 'offer-not-found' });
          continue;
        }

        const ownership = await api.queryOwnership(page, offer);
        if (ownership.kind === 'error') {
          reportFingerprint(ownership.fingerprintStale === true);
          results.push({ ...base, outcome: 'error', reason: ownership.message });
          continue;
        }
        if (ownership.owned) {
          state.addClaimed({
            ...base,
            offerId: offer.offerId,
            namespace: offer.namespace,
            claimedAt: new Date().toISOString(),
            outcome: 'already-owned',
            account: ownerKey,
            accountKey: activeAccount.key,
            accountName: accountLabel,
          });
          results.push({ ...base, outcome: 'already-owned' });
          continue;
        }
        if (ownership.blocked) {
          results.push({ ...base, outcome: 'skipped', reason: 'not-purchasable' });
          continue;
        }

        const free = await api.queryOfferFree(page, offer, config);
        if (free.kind === 'error') {
          reportFingerprint(free.fingerprintStale === true);
          results.push({ ...base, outcome: 'error', reason: free.message });
          continue;
        }
        if (!free.free) {
          results.push({ ...base, outcome: 'skipped', reason: 'not-free' });
          continue;
        }

        const purchase = await purchaseOffer(page, offer, {
          errorsDir,
          api,
          driver,
          signal,
          notify: code => state.event(code, { account: accountLabel, title: candidate.title }, 'warn'),
          onOwnershipError: outcome => reportFingerprint(outcome.fingerprintStale === true),
        });
        if (purchase.ok) {
          state.addClaimed({
            ...base,
            offerId: offer.offerId,
            namespace: offer.namespace,
            claimedAt: new Date().toISOString(),
            outcome: 'claimed',
            account: ownerKey,
            accountKey: activeAccount.key,
            accountName: accountLabel,
          });
          state.event('claim.claimed', { account: accountLabel, title: candidate.title });
          results.push({ ...base, outcome: 'claimed' });
        } else {
          state.event('claim.failed', { account: accountLabel, title: candidate.title, reason: purchase.reason }, 'warn');
          results.push({ ...base, outcome: 'failed', reason: purchase.reason });
        }
      } catch (error) {
        reportFingerprint(error instanceof EpicApiError && error.fingerprintStale);
        await driver.shot(page, errorsDir, `claim-${Date.now()}.png`);
        state.event('claim.error', { account: accountLabel, title: candidate.title, message: errMsg(error) }, 'error');
        results.push({ ...base, outcome: 'error', reason: errMsg(error) });
      }
    }

    if (errorsDir) pruneScreenshots(errorsDir);
    await browser.release();
    for (const staleKey of state.drainSupersededProfileKeys?.() ?? []) {
      if (staleKey !== activeAccount.key) {
        await browser.deleteProfile(staleKey);
      }
    }
    return { status: fingerprintStale ? 'fingerprint-stale' : 'ok', results };
  } catch (error) {
    await driver.shot(page, errorsDir, `run-${Date.now()}.png`);
    await browser.release();
    throw error;
  }
}

/**
 * Open a visible browser window on Epic's sign-in page using a clean SCRATCH
 * profile (existing accounts keep their own sessions untouched), wait up to
 * ten minutes for a session, mint the `EPIC_EG1` store identity cookie, then
 * adopt the scratch profile under the signed-in account's resolved key.
 * Signing in as an already-known account refreshes its session without
 * creating a duplicate entry.
 */
export async function runLoginFlow({
  browser,
  config = {},
  state,
  errorsDir,
  api = defaultApi,
  driver = createPageDriver({ extraOrderSelectors: config.extraOrderSelectors }),
  signal,
  timeoutMs = 10 * 60_000,
  pollIntervalMs = 2000,
  mintTimeoutMs = 15_000,
}) {
  state.event('login.opening');

  // Always start from an empty scratch profile so cookies from an earlier
  // aborted login never pollute or auto-complete a new account's sign-in.
  await browser.deleteProfile(LOGIN_PROFILE_KEY);

  const context = await browser.acquire(LOGIN_PROFILE_KEY, {
    headless: false,
    executablePath: config.executablePath || undefined,
    locale: config.loginLang || config.locale,
  });
  const page = firstOpenPage(context) ?? await context.newPage();
  page.setDefaultTimeout?.(60_000);

  try {
    await page.goto(loginUrl(config.locale, config.loginLang || null), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const deadline = Date.now() + timeoutMs;
    let session = { loggedIn: false, accountId: null, displayName: null };
    let pollFailures = 0;

    while (Date.now() < deadline && !signal?.aborted) {
      try {
        session = epicSessionFromCookies(await readSession(context));
        pollFailures = 0;
      } catch {
        // the browser window was closed or crashed mid-wait
        pollFailures += 1;
        if (pollFailures >= 3) {
          await browser.deleteProfile(LOGIN_PROFILE_KEY);
          state.syncSummaryFromAccounts();
          state.event('login.closed', {}, 'warn');
          return { ok: false, error: 'browser-closed' };
        }
        await api.sleep(Math.min(1000, pollIntervalMs), signal);
        continue;
      }

      if (session.loggedIn) break;

      // On macOS, closing the Chrome window closes the page while keeping the
      // background browser process alive (`context.cookies()` keeps returning `[]`).
      // Detect window closure immediately instead of hanging for 10 minutes.
      if (!hasAnyOpenPage(context, page)) {
        await browser.deleteProfile(LOGIN_PROFILE_KEY);
        state.syncSummaryFromAccounts();
        state.event('login.closed', {}, 'warn');
        return { ok: false, error: 'browser-closed' };
      }

      await api.sleep(pollIntervalMs, signal);
    }

    if (signal?.aborted) {
      await browser.deleteProfile(LOGIN_PROFILE_KEY);
      return { ok: false, error: 'aborted' };
    }

    if (!session.loggedIn) {
      await browser.deleteProfile(LOGIN_PROFILE_KEY);
      state.syncSummaryFromAccounts();
      state.event('login.timeout', {}, 'warn');
      return { ok: false, error: 'login-timeout' };
    }

    // Mint EPIC_EG1 (carries `acct` = accountId and `dn` = displayName) by
    // visiting the store and polling until the storefront sets the cookie.
    let minted = session;
    if (!minted.accountId || !minted.displayName) {
      const activePage = firstOpenPage(context);
      if (activePage) {
        const currentUrl = typeof activePage.url === 'function' ? activePage.url() : '';
        if (!currentUrl.startsWith('https://store.epicgames.com/')) {
          await activePage.goto(storeCartUrl(config.locale), {
            waitUntil: 'domcontentloaded',
            timeout: 45_000,
          }).catch(() => {});
        }
        const mintDeadline = Date.now() + mintTimeoutMs;
        const mintStep = Math.min(1000, pollIntervalMs);
        while (Date.now() < mintDeadline && !signal?.aborted) {
          const latest = epicSessionFromCookies(await readSession(context).catch(() => []));
          if (latest.loggedIn) {
            minted = {
              loggedIn: true,
              expiresAt: latest.expiresAt ?? minted.expiresAt,
              accountId: latest.accountId ?? minted.accountId,
              displayName: latest.displayName ?? minted.displayName,
            };
          }
          if (minted.accountId) break;
          if (!hasAnyOpenPage(context, activePage)) break;
          await api.sleep(mintStep, signal);
        }
      }
    }

    await browser.release();

    const id = minted.accountId ?? session.accountId ?? null;
    const name = minted.displayName ?? session.displayName ?? null;
    const key = state.resolveAccountKey(id, name);
    const existed = state.data.accounts[key] !== undefined;

    const adopted = await browser.adoptProfile(LOGIN_PROFILE_KEY, key);
    if (!adopted) {
      await browser.deleteProfile(LOGIN_PROFILE_KEY);
      state.syncSummaryFromAccounts();
      state.event('login.crash', { message: 'failed to adopt sign-in browser profile' }, 'error');
      return { ok: false, error: 'adopt-failed' };
    }

    const record = state.upsertAccount({
      key,
      id,
      name,
      loggedInAt: new Date().toISOString(),
      sessionOk: true,
    });
    for (const staleKey of state.drainSupersededProfileKeys?.() ?? []) {
      if (staleKey !== key) {
        await browser.deleteProfile(staleKey);
      }
    }
    state.resetFailureStreak();
    state.event(existed ? 'login.success' : 'account.added', {
      name: name ? `: ${name}` : '',
    });
    return { ok: true, account: record };
  } catch (error) {
    await driver.shot(page, errorsDir, `login-${Date.now()}.png`);
    await browser.deleteProfile(LOGIN_PROFILE_KEY);
    throw error;
  }
}
