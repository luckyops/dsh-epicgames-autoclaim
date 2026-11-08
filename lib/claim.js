import fs from 'node:fs';
import path from 'node:path';
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

const SCREENSHOT_LIMIT = 20;
const SCREENSHOT_TTL_MS = 7 * 24 * 60 * 60_000;

const errMsg = error => (error instanceof Error ? error.message : String(error));

/**
 * Keep only the newest screenshots within the retention window: they show
 * Epic pages and may carry the account's display name, so they expire.
 */
function pruneScreenshots(errorsDir) {
  try {
    const now = Date.now();
    const files = fs.readdirSync(errorsDir)
      .filter(name => name.endsWith('.png'))
      .map(name => ({ name, mtime: fs.statSync(path.join(errorsDir, name)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    const keep = new Set(
      files
        .filter(entry => now - entry.mtime <= SCREENSHOT_TTL_MS)
        .slice(0, SCREENSHOT_LIMIT)
        .map(entry => entry.name),
    );
    for (const entry of files) {
      if (!keep.has(entry.name)) {
        fs.rmSync(path.join(errorsDir, entry.name), { force: true });
      }
    }
  } catch {
    // pruning is best-effort
  }
}

async function readSession(context) {
  return context.cookies(['https://www.epicgames.com', 'https://store.epicgames.com']);
}

/**
 * Record which account the browser profile is signed in as. A different
 * account invalidates every prior claim record (they described another
 * library), so the next check re-audits the whole rotation.
 */
function noteAccount(state, { accountId, displayName }) {
  const nextId = accountId ?? null;
  const nextName = displayName ?? null;
  if (nextName && nextName !== state.data.accountName) state.data.accountName = nextName;
  if (nextId && nextId !== state.data.accountId) {
    const hadRecords = state.data.claimed.length > 0;
    state.data.accountId = nextId;
    if (hadRecords) state.clearClaimed('account.changed');
    else state.save();
    return;
  }
  state.save();
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

/**
 * Claim every candidate that is not owned yet, using one browser session for
 * all offers. Ownership errors and stale API fingerprints are surfaced as
 * `error` outcomes (never folded into business conclusions), so the
 * controller can schedule a retry and the user sees a diagnostic.
 */
export async function runClaimRun({ browser, config, state, candidates, errorsDir }) {
  let context;
  try {
    context = await browser.acquire({
      headless: config.claimHeadless !== false,
      executablePath: config.executablePath || undefined,
      locale: config.locale,
    });
  } catch (error) {
    state.event('browser.launch-error', { message: errMsg(error) }, 'error');
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
      state.event('challenge.blocked', {}, 'error');
      return { status: 'challenge', results: [] };
    }

    const session = epicSessionFromCookies(await readSession(context));
    state.data.sessionOk = session.loggedIn;
    if (!session.loggedIn) {
      state.data.loggedInAt = null;
      state.save();
      await browser.release();
      state.event('session.expired', {}, 'warn');
      return { status: 'need-login', results: [] };
    }
    noteAccount(state, { accountId: session.accountId, displayName: session.displayName });
    const accountKey = state.data.accountId ?? state.data.accountName ?? null;

    for (const candidate of candidates) {
      const base = {
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
          notify: code => state.event(code, { title: candidate.title }, 'warn'),
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
          state.event('claim.claimed', { title: candidate.title });
          results.push({ ...base, outcome: 'claimed' });
        } else {
          state.event('claim.failed', { title: candidate.title, reason: purchase.reason }, 'warn');
          results.push({ ...base, outcome: 'failed', reason: purchase.reason });
        }
      } catch (error) {
        reportFingerprint(error instanceof EpicApiError && error.fingerprintStale);
        await shot(page, errorsDir, `claim-${Date.now()}.png`);
        state.event('claim.error', { title: candidate.title, message: errMsg(error) }, 'error');
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
 * Open a visible browser window on the Epic sign-in page and wait (up to
 * ten minutes) until the profile carries a usable session cookie.
 */
export async function runLoginFlow({ browser, config, state, errorsDir }) {
  state.event('login.opening');
  const context = await browser.acquire({
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
      state.data.sessionOk = false;
      state.save();
      state.event('login.timeout', {}, 'warn');
      await browser.release();
      return { ok: false, error: 'login-timeout' };
    }

    await sleep(2000);
    // Visit the store so it mints the EPIC_EG1 web-session cookie from the
    // account session (best effort — detection already accepts the SSO cookies).
    await page.goto(STORE_CART, { waitUntil: 'domcontentloaded', timeout: 45_000 }).catch(() => {});
    await sleep(2000);
    const minted = epicSessionFromCookies(await readSession(context).catch(() => []));
    noteAccount(state, { accountId: minted.accountId, displayName: minted.displayName });
    state.data.sessionOk = true;
    state.data.loggedInAt = new Date().toISOString();
    state.event('login.success', { name: state.data.accountName ? `: ${state.data.accountName}` : '' });
    state.save();
    await browser.release();
    return { ok: true, accountName: state.data.accountName };
  } catch (error) {
    await shot(page, errorsDir, `login-${Date.now()}.png`);
    await browser.release();
    throw error;
  }
}
