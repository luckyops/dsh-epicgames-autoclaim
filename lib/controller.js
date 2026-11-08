import { maskAccountId } from './state.js';
import { derivePhase, nextRunAt } from './scheduler.js';
import { discoverWeeklyFreeGames } from './epic.js';
import { runClaimRun, runLoginFlow } from './claim.js';

const STARTUP_DELAY_MS = 90_000;
const TICK_MS = 60_000;

const errMsg = error => (error instanceof Error ? error.message : String(error));

/**
 * The single operation coordinator: login/check/recheck/logout run one at a
 * time, the scheduler reads its clock, and every projection (HTTP, command,
 * tool, status) renders the same state through `status()`. A check claims
 * for EVERY registered account, each with its own browser profile and its
 * own per-account claim records.
 */
export function createController({ ctx, config, state, browser, errorsDir }) {
  let operation = null; // { kind, startedAt }

  const busy = () => operation !== null;

  function status() {
    const accounts = state.accountList();
    const claimedByKey = new Map();
    for (const entry of state.data.claimed) {
      claimedByKey.set(entry.account, (claimedByKey.get(entry.account) ?? 0) + 1);
    }
    return {
      plugin: 'dsh-epicgames-autoclaim',
      contract: 3,
      phase: derivePhase(operation, state.data),
      running: busy(),
      signedIn: accounts.some(account => account.sessionOk !== false),
      accountCount: accounts.length,
      accounts: accounts.map(account => ({
        key: account.key,
        id: maskAccountId(account.id),
        name: account.name,
        loggedInAt: account.loggedInAt,
        sessionOk: account.sessionOk ?? null,
        claimedCount: claimedByKey.get(account.id ?? account.name ?? null) ?? 0,
      })),
      accountId: maskAccountId(state.data.accountId),
      accountName: state.data.accountName,
      loggedInAt: state.data.loggedInAt,
      lastCheckAt: state.data.lastCheckAt,
      nextRunAt: state.data.nextRunAt,
      intervalHours: config.intervalHours,
      current: state.data.current,
      claimed: [...state.data.claimed].slice(-30).reverse(),
      log: state.data.log.slice(0, 25),
      lastError: state.data.lastError,
    };
  }

  function startLogin() {
    if (busy()) return { started: false, reason: 'busy' };
    operation = { kind: 'login', startedAt: Date.now() };
    state.data.phase = 'login-waiting';
    state.save();
    runLoginFlow({ browser, config, state, errorsDir })
      .catch(error => {
        state.event('login.crash', { message: errMsg(error) }, 'error');
      })
      .finally(() => {
        operation = null;
        state.data.phase = state.data.sessionOk ? 'idle' : 'need-login';
        state.save();
      });
    return { started: true };
  }

  /** Sign one account out (destroy its profile/session), or all of them. */
  function logout(key) {
    if (busy()) return { started: false, reason: 'busy' };
    const accounts = state.accountList();
    const targets = key === 'all'
      ? accounts
      : accounts.filter(account => account.key === key || account.name === key);
    if (targets.length === 0) return { started: false, reason: 'unknown-account' };
    operation = { kind: 'logout', startedAt: Date.now() };
    void (async () => {
      try {
        for (const account of targets) {
          await browser.deleteProfile(account.key);
          state.removeAccount(account.key);
          state.event('account.removed', { name: account.name ?? account.id ?? account.key });
        }
      } catch (error) {
        state.event('logout.error', { message: errMsg(error) }, 'error');
      } finally {
        state.data.sessionOk = Object.keys(state.data.accounts).length > 0 ? state.data.sessionOk : false;
        state.save();
        operation = null;
      }
    })();
    return { started: true, count: targets.length };
  }

  function runCheck(manual) {
    if (busy()) return { started: false, reason: 'busy' };
    operation = { kind: 'check', startedAt: Date.now() };
    state.data.phase = 'discovery';
    state.save();
    const schedule = { rotationAt: null, failed: false };

    void (async () => {
      try {
        const candidates = await discoverWeeklyFreeGames({
          country: config.country,
          locale: config.locale,
        });
        state.data.current = candidates;
        state.data.lastCheckAt = new Date().toISOString();
        state.save();

        // The current batch's end time is the next rotation: check again
        // shortly after it so new free games are claimed within minutes.
        const upcoming = candidates
          .map(candidate => Date.parse(candidate.endsAt ?? ''))
          .filter(when => Number.isFinite(when) && when > Date.now());
        if (upcoming.length > 0) schedule.rotationAt = Math.min(...upcoming);

        const accounts = state.accountList();
        let results = [];
        let runStatus = 'ok';
        for (const account of accounts) {
          const accountKey = account.id ?? account.name ?? null;
          const todo = candidates.filter(candidate => !state.hasClaimed(candidate, accountKey));
          if (todo.length === 0) continue;
          const outcome = await runClaimRun({
            browser,
            config,
            state,
            candidates: todo,
            errorsDir,
            account,
          });
          results = results.concat(outcome.results);
          if (outcome.status !== 'ok') runStatus = outcome.status;
          if (outcome.status === 'need-login' || outcome.status === 'challenge' || outcome.status === 'browser-error') {
            state.data.lastError = `${outcome.status}:${account.name ?? account.key}`;
            schedule.failed = true;
          }
        }
        if (results.some(entry => entry.outcome === 'failed' || entry.outcome === 'error')) {
          schedule.failed = true;
        }

        const claimedNow = results.filter(entry => entry.outcome === 'claimed').length;
        state.data.phase = 'idle';
        state.data.lastResult = {
          at: new Date().toISOString(),
          status: runStatus,
          found: candidates.length,
          claimed: claimedNow,
          results,
        };
        if (runStatus === 'ok' && !schedule.failed) state.data.lastError = null;
        state.data.consecutiveFailures = schedule.failed
          ? (state.data.consecutiveFailures ?? 0) + 1
          : 0;
        state.event(`check.summary.${manual ? 'manual' : 'auto'}`, {
          accounts: accounts.length,
          found: candidates.length,
          claimed: claimedNow,
        });
        state.save();
      } catch (error) {
        state.data.lastError = errMsg(error);
        state.data.phase = 'idle';
        state.data.consecutiveFailures = (state.data.consecutiveFailures ?? 0) + 1;
        state.event('check.failed', { message: errMsg(error) }, 'error');
        state.save();
        schedule.failed = true;
      } finally {
        state.data.nextRunAt = nextRunAt({
          intervalHours: config.intervalHours,
          rotationAt: schedule.rotationAt,
          consecutiveFailures: schedule.failed ? (state.data.consecutiveFailures ?? 0) : 0,
        });
        state.save();
        operation = null;
      }
    })();
    return { started: true };
  }

  /** Clear the per-account claim records and re-audit the whole rotation. */
  function recheck() {
    if (busy()) return { started: false, reason: 'busy' };
    state.clearClaimed();
    return runCheck(true);
  }

  // ---- scheduler -----------------------------------------------------------
  if (state.data.nextRunAt == null) {
    state.data.nextRunAt = Date.now()
      + (config.runOnStartup ? STARTUP_DELAY_MS : config.intervalHours * 3_600_000);
    state.save();
  }
  const timer = setInterval(() => {
    if (busy()) return;
    if (Date.now() >= (state.data.nextRunAt ?? 0)) runCheck(false);
  }, TICK_MS);
  ctx.effect(() => () => {
    clearInterval(timer);
  }, 'epicgames-autoclaim: scheduler');

  // awaited on unload so the browser really closes before the Host exits
  ctx.effect(() => () => browser.release(), 'epicgames-autoclaim: browser shutdown');

  return { status, startLogin, runCheck, recheck, logout, isBusy: busy };
}
