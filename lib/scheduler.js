/**
 * Scheduling policy, circuit breaker, and phase state machine — pure and unit-tested.
 *
 * Three scheduling rules compose by taking the earliest future moment:
 * 1. Regular interval (`intervalHours`);
 * 2. Rotation wake-up (`rotationAt + 20min`, when still in the future);
 * 3. Exponential failure backoff (`1h → 2h → 4h` cap) for transient errors,
 *    guarded by a Circuit Breaker: non-recoverable failures (`auth`,
 *    `fingerprint`) and repeated bot-wall challenges (`challenge` ≥ 3) open
 *    the circuit and defer to the regular interval instead of hammering Epic.
 */

const RETRY_BASE_MS = 60 * 60_000;
const RETRY_CAP_MS = 4 * 60 * 60_000;
const ROTATION_BUFFER_MS = 20 * 60_000;

export const CHALLENGE_CIRCUIT_THRESHOLD = 3;

/** Whether the retry circuit breaker is open (suppresses aggressive backoff). */
export function isCircuitOpen({ consecutiveFailures = 0, failureKind = 'transient' } = {}) {
  if (consecutiveFailures <= 0) return false;
  if (failureKind === 'auth' || failureKind === 'fingerprint') return true;
  if (failureKind === 'challenge' && consecutiveFailures >= CHALLENGE_CIRCUIT_THRESHOLD) return true;
  return false;
}

/** @returns {number} epoch ms for the next scheduled check */
export function nextRunAt({
  now = Date.now(),
  intervalHours,
  rotationAt = null,
  consecutiveFailures = 0,
  failureKind = 'transient',
}) {
  let next = now + Math.max(1, Number(intervalHours) || 12) * 3_600_000;
  if (Number.isFinite(rotationAt) && rotationAt !== null) {
    const postRotation = rotationAt + ROTATION_BUFFER_MS;
    if (postRotation > now) {
      next = Math.min(next, postRotation);
    }
  }
  if (consecutiveFailures > 0 && !isCircuitOpen({ consecutiveFailures, failureKind })) {
    const backoff = Math.min(RETRY_BASE_MS * 2 ** (consecutiveFailures - 1), RETRY_CAP_MS);
    next = Math.min(next, now + backoff);
  }
  return next;
}

/**
 * Derive the user-visible phase from the active operation and durable state
 * (GoF State projection).
 */
export function derivePhase(operation, data = {}) {
  if (operation?.kind === 'login') return 'login-waiting';
  if (operation?.kind === 'check' && operation.phase) return operation.phase;
  if (operation?.kind === 'logout') return 'idle';

  const accountEntries = data.accounts && typeof data.accounts === 'object'
    ? Object.values(data.accounts)
    : [];
  if (accountEntries.length > 0) {
    if (accountEntries.every(acc => acc?.sessionOk === false)) {
      return 'need-login';
    }
    return data.phase ?? 'idle';
  }

  if (data.sessionOk === false) return 'need-login';
  return data.phase ?? 'idle';
}
