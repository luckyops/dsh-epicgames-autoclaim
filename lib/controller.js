import { maskAccountId } from './state.js';
import { derivePhase, isCircuitOpen, nextRunAt } from './scheduler.js';
import { discoverWeeklyFreeGames } from './epic.js';
import { runClaimRun, runLoginFlow } from './claim.js';

const STARTUP_DELAY_MS = 90_000;
const TICK_MS = 60_000;

const errMsg = error => (error instanceof Error ? error.message : String(error));

/** Classify why a check run failed so the scheduler can apply backoff or open its circuit. */
function classifyFailure(accountStatuses, results) {
  if (accountStatuses.includes('fingerprint-stale')) return 'fingerprint';
  if (accountStatuses.includes('challenge')) return 'challenge';
  const hasGameFailures = results.some(entry => entry.outcome === 'failed' || entry.outcome === 'error');
  const nonOkStatuses = accountStatuses.filter(st => st !== 'ok');
  if (
    !hasGameFailures
    && nonOkStatuses.length > 0
    && nonOkStatuses.every(st => st === 'need-login')
  ) {
    return 'auth';
  }
  return 'transient';
}

function matchLogoutTargets(accounts, rawTarget) {
  const query = String(rawTarget ?? 'all').trim();
  if (!query || query.toLowerCase() === 'all') return accounts;
  const exact = accounts.filter(
    acc =>
      acc.key === query
      || acc.name === query
      || acc.id === query
      || maskAccountId(acc.id) === query,
  );
  if (exact.length > 0) return exact;
  const lower = query.toLowerCase();
  return accounts.filter(
    acc =>
      acc.key?.toLowerCase() === lower
      || acc.name?.toLowerCase() === lower,
  );
}

/**
 * The single operation coordinator: login/check/recheck/logout run one at a
 * time, the scheduler reads its clock, and every projection (HTTP, command,
 * tool, status) renders the same state through `status()`. A check claims
 * for EVERY registered account, each with its own browser profile and its
 * own per-account claim records.
 */
export function createController({
  ctx,
  config,
  state,
  browser,
  errorsDir,
  discover = discoverWeeklyFreeGames,
  claimRunner = runClaimRun,
  loginRunner = runLoginFlow,
  now = Date.now,
}) {
  let operation = null; // { kind, phase?, startedAt, promise }
  const lifecycle = new AbortController();

  const busy = () => operation !== null;

  function status() {
    const accounts = state.accountList();
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
        claimedCount: state.countClaimsFor(account),
      })),
      accountId: maskAccountId(state.data.accountId),
      accountName: state.data.accountName,
      loggedInAt: state.data.loggedInAt,
      lastCheckAt: state.data.lastCheckAt,
      nextRunAt: state.data.nextRunAt,
      intervalHours: config.intervalHours,
      circuitOpen: isCircuitOpen({
        consecutiveFailures: state.data.consecutiveFailures ?? 0,
        failureKind: state.data.lastFailureKind ?? 'transient',
      }),
      current: state.data.current,
      claimed: state.recentClaimedView(30),
      log: state.data.log.slice(0, 25),
      lastError: state.data.lastError,
    };
  }

  function startLogin() {
    if (busy()) return { started: false, reason: 'busy' };
    const op = { kind: 'login', phase: 'login-waiting', startedAt: now(), promise: null };
    operation = op;
    op.promise = Promise.resolve()
      .then(() => loginRunner({ browser, config, state, errorsDir, signal: lifecycle.signal }))
      .catch(error => {
        if (!lifecycle.signal.aborted) {
          state.event('login.crash', { message: errMsg(error) }, 'error');
        }
      })
      .finally(() => {
        state.syncSummaryFromAccounts();
        state.data.phase = 'idle';
        state.save();
        if (operation === op) operation = null;
      });
    return { started: true };
  }

  /** Sign one account out (destroy its profile/session), or all of them. */
  function logout(key) {
    if (busy()) return { started: false, reason: 'busy' };
    const accounts = state.accountList();
    const targets = matchLogoutTargets(accounts, key);
    if (targets.length === 0) return { started: false, reason: 'unknown-account' };

    const op = { kind: 'logout', phase: 'idle', startedAt: now(), promise: null };
    operation = op;
    op.promise = (async () => {
      try {
        for (const account of targets) {
          await browser.deleteProfile(account.key);
          state.removeAccount(account.key);
          state.event('account.removed', { name: account.name ?? maskAccountId(account.id) ?? account.key });
        }
      } catch (error) {
        if (!lifecycle.signal.aborted) {
          state.event('logout.error', { message: errMsg(error) }, 'error');
        }
      } finally {
        state.syncSummaryFromAccounts();
        state.save();
        if (operation === op) operation = null;
      }
    })();
    return { started: true, count: targets.length };
  }

  function runCheck(manual) {
    if (busy()) return { started: false, reason: 'busy' };
    const op = { kind: 'check', phase: 'discovery', startedAt: now(), promise: null };
    operation = op;
    const schedule = { rotationAt: null, failed: false, failureKind: 'transient' };

    op.promise = (async () => {
      try {
        const candidates = await discover({
          country: config.country,
          locale: config.locale,
          signal: lifecycle.signal,
          now: now(),
        });
        if (lifecycle.signal.aborted) return;
        state.recordDiscovery(candidates, new Date(now()).toISOString());

        // The current batch's end time is the next rotation: check again
        // shortly after it so new free games are claimed within minutes.
        const currentNow = now();
        const upcoming = candidates
          .map(candidate => Date.parse(candidate.endsAt ?? ''))
          .filter(when => Number.isFinite(when) && when > currentNow);
        if (upcoming.length > 0) schedule.rotationAt = Math.min(...upcoming);

        const accounts = state.accountList();
        let results = [];
        let runStatus = 'ok';
        const accountStatuses = [];
        let lastError = undefined;

        for (const account of accounts) {
          if (lifecycle.signal.aborted) return;
          const todo = candidates.filter(candidate => !state.hasClaimed(candidate, account));
          if (todo.length === 0) continue;

          op.phase = 'claiming';
          const outcome = await claimRunner({
            browser,
            config,
            state,
            candidates: todo,
            errorsDir,
            account,
            signal: lifecycle.signal,
          });
          results = results.concat(outcome.results);
          accountStatuses.push(outcome.status);
          if (outcome.status !== 'ok') runStatus = outcome.status;
          if (
            outcome.status === 'need-login'
            || outcome.status === 'challenge'
            || outcome.status === 'browser-error'
            || outcome.status === 'fingerprint-stale'
          ) {
            lastError = `${outcome.status}:${account.name ?? account.key}`;
            schedule.failed = true;
          }
        }
        if (results.some(entry => entry.outcome === 'failed' || entry.outcome === 'error')) {
          schedule.failed = true;
        }
        if (schedule.failed) {
          schedule.failureKind = classifyFailure(accountStatuses, results);
        }

        const claimedNow = results.filter(entry => entry.outcome === 'claimed').length;
        const nextFailures = schedule.failed ? (state.data.consecutiveFailures ?? 0) + 1 : 0;
        const computedNextRun = nextRunAt({
          now: now(),
          intervalHours: config.intervalHours,
          rotationAt: schedule.rotationAt,
          consecutiveFailures: nextFailures,
          failureKind: schedule.failureKind,
        });

        state.recordCheckSuccess({
          status: runStatus,
          found: candidates.length,
          claimed: claimedNow,
          results,
          failed: schedule.failed,
          failureKind: schedule.failureKind,
          lastError,
          manual,
          accountCount: accounts.length,
          nextRun: computedNextRun,
        });
      } catch (error) {
        if (lifecycle.signal.aborted) return;
        schedule.failed = true;
        schedule.failureKind = 'transient';
        const nextFailures = (state.data.consecutiveFailures ?? 0) + 1;
        const computedNextRun = nextRunAt({
          now: now(),
          intervalHours: config.intervalHours,
          rotationAt: schedule.rotationAt,
          consecutiveFailures: nextFailures,
          failureKind: schedule.failureKind,
        });
        state.recordCheckFailure({
          message: errMsg(error),
          failureKind: schedule.failureKind,
          nextRun: computedNextRun,
        });
      } finally {
        if (operation === op) operation = null;
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

  /** Wait for any currently running operation to settle (used by tests and shutdown). */
  async function whenIdle() {
    while (operation?.promise) {
      await operation.promise;
    }
  }

  // ---- scheduler -----------------------------------------------------------
  if (state.data.nextRunAt == null) {
    state.scheduleNextRun(
      now() + (config.runOnStartup ? STARTUP_DELAY_MS : config.intervalHours * 3_600_000),
    );
  }
  const timer = setInterval(() => {
    if (busy() || lifecycle.signal.aborted) return;
    if (now() >= (state.data.nextRunAt ?? 0)) runCheck(false);
  }, TICK_MS);
  timer.unref?.();

  ctx?.effect?.(() => () => {
    clearInterval(timer);
    lifecycle.abort();
  }, 'epicgames-autoclaim: scheduler');

  // awaited on unload so the browser really closes before the Host exits
  ctx?.effect?.(() => async () => {
    lifecycle.abort();
    await browser.release();
  }, 'epicgames-autoclaim: browser shutdown');

  return { status, startLogin, runCheck, recheck, logout, isBusy: busy, whenIdle };
}
