/**
 * Scheduling policy, pure and unit-tested: when should the next check run?
 *
 * Three rules compose by taking the earliest moment:
 * - the regular interval;
 * - shortly after the current batch's end (that moment IS the next rotation,
 *   when new free games appear);
 * - a failure backoff (1h doubling to a 4h cap) that resets on success.
 */

const RETRY_BASE_MS = 60 * 60_000;
const RETRY_CAP_MS = 4 * 60 * 60_000;
const ROTATION_BUFFER_MS = 20 * 60_000;

/** @returns {number} epoch ms for the next scheduled check */
export function nextRunAt({ now = Date.now(), intervalHours, rotationAt = null, consecutiveFailures = 0 }) {
  let next = now + Math.max(1, intervalHours) * 3_600_000;
  if (Number.isFinite(rotationAt) && rotationAt !== null) {
    next = Math.min(next, rotationAt + ROTATION_BUFFER_MS);
  }
  if (consecutiveFailures > 0) {
    const backoff = Math.min(RETRY_BASE_MS * 2 ** (consecutiveFailures - 1), RETRY_CAP_MS);
    next = Math.min(next, now + backoff);
  }
  return next;
}

/** Derive the user-visible phase from the running operation and durable state. */
export function derivePhase(operation, data) {
  if (operation?.kind === 'login') return 'login-waiting';
  if (data.sessionOk === false) return 'need-login';
  return data.phase;
}
