import {
  STORE_CART,
  epicSessionFromCookies,
  loginUrl,
  purchaseUrl,
} from './epic.js';
import {
  EpicApiError,
  queryOfferFree,
  queryOwnership,
  resolveOffer,
  sleep,
} from './epic-api.js';
import {
  acceptAgreements,
  clickOrderButton,
  hasCaptchaFrame,
  isChallengePage,
  shot,
} from './page-driver.js';
import { pruneScreenshots } from './diagnostics.js';
import { profileKeyFor } from './state.js';

const LOGIN_PROFILE_KEY = 'login';

const errMsg = error => (error instanceof Error ? error.message : String(error));

async function readSession(context) {
  return context.cookies(['https://www.epicgames.com', 'https://store.epicgames.com']);
}

/** The value claim records key on: the account id, falling back to its name. */
const accountKeyOf = account => account.id ?? account.name ?? null;

/**
 * Complete the $0 order for one offer: open the purchase interstitial,
 * accept agreement gates, click the order button ("Add to library" on
 * today's free checkout), then confirm success by polling the account's
 * entitlements until the offer shows as owned. Epic sometimes gates the
 * checkout with an hCaptcha: when one is detected the browser window stays
 * open and the user is asked to solve it while this poll keeps waiting.
 */
async function purchaseOffer(page, offer, { errorsDir, notify, onOwnershipError }) {
  await page.goto(purchaseUrl(offer.namespace, offer.offerId), {
    waitUntil: 'domcontentloaded',
    timeout: 60_000,
  });
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {});
  await sleep(1500);

  await acceptAgreements(page);
  const click = await clickOrderButton(page);
  if (click !== 'clicked') {
    await shot(page, errorsDir, `order-${Date.now()}.png`);
    return { ok: false, reason: click === 'not-found' ? 'order-button-not-found' : 'order-click-failed' };
  }

  const deadline = Date.now() + 300_000; // long enough for a user-solved captcha
  let captchaNotified = false;
  let ownershipErrors = 0;
  while (Date.now() < deadline) {
    const ownership = await queryOwnership(page, offer);
    if (ownership.kind === 'ok') {
      if (ownership.owned) return { ok: true };
    } else {
      ownershipErrors += 1;
      onOwnershipError?.(ownership);
      if (ownershipErrors >= 3) break; // Epic unreachable — stop polling
    }
    if (!captchaNotified && hasCaptchaFrame(page)) {
      captchaNotified = true;
      notify?.('captcha.assist');
    }
    await sleep(3000);
  }
  await shot(page, errorsDir, `confirm-${Date.now()}.png`);
  return { ok: false, reason: captchaNotified ? 'captcha-timeout' : 'confirm-timeout' };
}

/** Surface a stale persisted-query fingerprint exactly once per run. */
function fingerprintGuard(state) {
  let reported = false;
  return stale => {
    if (stale && !reported) {
      reported = true;
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
export async function runClaimRun({ browser, config, state, candidates, errorsDir, account }) {
  const accountKey = accountKeyOf(account);
  const accountLabel = account.name ?? account.id ?? account.key;
  let context;
  try {
    context = await browser.acquire(account.key, {
      headless: config.claimHeadless !== false,
      executablePath: config.executablePath || undefined,
      locale: config.locale,
    });
  } catch (error) {
    state.event('browser.launch-error', { account: accountLabel, message: errMsg(error) }, 'error');
    return { status: 'browser-error', results: [] };
  }

  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(45_000);
  const results = [];
  const reportFingerprint = fingerprintGuard(state);

  try {
    await page.goto(STORE_CART, { waitUntil: 'domcontentloaded', timeout: 60_000 }).catch(() => {});
    await sleep(2500);

    if (await isChallengePage(page)) {
      await browser.release();
      state.event('challenge.blocked', { account: accountLabel }, 'error');
      return { status: 'challenge', results: [] };
    }

    const session = epicSessionFromCookies(await readSession(context));
    state.upsertAccount({
      key: account.key,
      id: session.accountId ?? account.id,
      name: session.displayName ?? account.name,
      sessionOk: session.loggedIn,
    });
    if (!session.loggedIn) {
      await browser.release();
      state.event('session.expired', { account: accountLabel }, 'warn');
      return { status: 'need-login', results: [] };
    }

    for (const candidate of candidates) {
      const base = {
        account: accountLabel,
        title: candidate.title,
        pageSlug: candidate.pageSlug,
        url: candidate.url,
        image: candidate.image ?? null,
      };
      try {
        const offer = await resolveOffer(page, candidate, config);
        if (!offer) {
          results.push({ ...base, outcome: 'skipped', reason: 'offer-not-found' });
          continue;
        }

        const ownership = await queryOwnership(page, offer);
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
            account: accountKey,
          });
          results.push({ ...base, outcome: 'already-owned' });
          continue;
        }
        if (ownership.blocked) {
          results.push({ ...base, outcome: 'skipped', reason: 'not-purchasable' });
          continue;
        }

        const free = await queryOfferFree(page, offer, config);
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
            account: accountKey,
          });
          state.event('claim.claimed', { account: accountLabel, title: candidate.title });
          results.push({ ...base, outcome: 'claimed' });
        } else {
          state.event('claim.failed', { account: accountLabel, title: candidate.title, reason: purchase.reason }, 'warn');
          results.push({ ...base, outcome: 'failed', reason: purchase.reason });
        }
      } catch (error) {
        reportFingerprint(error instanceof EpicApiError && error.fingerprintStale);
        await shot(page, errorsDir, `claim-${Date.now()}.png`);
        state.event('claim.error', { account: accountLabel, title: candidate.title, message: errMsg(error) }, 'error');
        results.push({ ...base, outcome: 'error', reason: errMsg(error) });
      }
    }

    pruneScreenshots(errorsDir);
    await browser.release();
    return { status: 'ok', results };
  } catch (error) {
    await shot(page, errorsDir, `run-${Date.now()}.png`);
    await browser.release();
    throw error;
  }
}

/**
 * Open a visible browser window on Epic's sign-in page using a SCRATCH
 * profile (existing accounts keep their own sessions), wait up to ten
 * minutes for a session, then adopt the scratch profile under the signed-in
 * account's key and register the account. Signing in as an already-known
 * account simply refreshes it.
 */
export async function runLoginFlow({ browser, config, state, errorsDir }) {
  state.event('login.opening');
  const context = await browser.acquire(LOGIN_PROFILE_KEY, {
    headless: false,
    executablePath: config.executablePath || undefined,
    locale: config.loginLang || config.locale,
  });
  const page = context.pages()[0] ?? await context.newPage();
  page.setDefaultTimeout(60_000);

  try {
    await page.goto(loginUrl(config.locale, config.loginLang || null), {
      waitUntil: 'domcontentloaded',
      timeout: 60_000,
    });

    const deadline = Date.now() + 10 * 60_000;
    let session = { loggedIn: false };
    let pollFailures = 0;
    while (Date.now() < deadline) {
      try {
        session = epicSessionFromCookies(await readSession(context));
        pollFailures = 0;
      } catch {
        // the browser window was closed or crashed mid-wait
        pollFailures += 1;
        if (pollFailures >= 3) {
          state.data.sessionOk = false;
          state.save();
          state.event('login.closed', {}, 'warn');
          await browser.release();
          return { ok: false, error: 'browser-closed' };
        }
        await sleep(1000);
        continue;
      }
      if (session.loggedIn) break;
      await sleep(2000);
    }

    if (!session.loggedIn) {
      state.event('login.timeout', {}, 'warn');
      await browser.release();
      return { ok: false, error: 'login-timeout' };
    }

    await sleep(2000);
    // Visit the store so it mints the EPIC_EG1 web-session cookie (carries
    // the account identity) from the account session — best effort.
    await page.goto(STORE_CART, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
    await sleep(2000);
    const minted = epicSessionFromCookies(await readSession(context).catch(() => []));
    await browser.release();

    const id = minted.accountId ?? null;
    const name = minted.displayName ?? null;
    const key = profileKeyFor(id, name);
    const adopted = await browser.adoptProfile(LOGIN_PROFILE_KEY, key);
    const existed = state.data.accounts[key] !== undefined;
    const record = state.upsertAccount({ key, id, name, loggedInAt: new Date().toISOString(), sessionOk: true });
    state.data.sessionOk = true;
    state.data.loggedInAt = record.loggedInAt;
    state.event(existed ? 'login.success' : 'account.added', {
      name: name ? `: ${name}` : '',
    });
    state.save();
    return { ok: adopted || true, account: record };
  } catch (error) {
    await shot(page, errorsDir, `login-${Date.now()}.png`);
    await browser.release();
    throw error;
  }
}
