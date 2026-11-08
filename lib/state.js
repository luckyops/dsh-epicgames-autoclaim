import fs from 'node:fs';
import path from 'node:path';

/**
 * Plugin-owned durable state: a plain domain object plus a small store.
 * Domain logic (account-scoped claim records) stays pure; persistence is an
 * explicit `save()` that writes atomically (temp file + rename) under a
 * schema version so future migrations have a path.
 */

export const SCHEMA_VERSION = 2;

const LOG_LIMIT = 60;
const CLAIM_LIMIT = 400;

const DEFAULTS = {
  schemaVersion: SCHEMA_VERSION,
  loggedInAt: null,
  accountId: null,
  accountName: null,
  sessionOk: null,
  phase: 'idle',
  lastCheckAt: null,
  nextRunAt: null,
  lastResult: null,
  lastError: null,
  consecutiveFailures: 0,
  current: [],
  claimed: [],
  log: [],
};

/** Migrate a parsed document from any known schema version to the current one. */
function migrate(parsed) {
  const data = { ...DEFAULTS, ...parsed };
  const from = typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 1;
  if (from < 2) {
    data.schemaVersion = 2;
    data.consecutiveFailures = 0;
  }
  return data;
}

/**
 * Atomically write JSON (a crash between writes can never leave a torn
 * file), with owner-only permissions: the file names an account and its
 * game library, so no other local user may read it.
 */
function atomicWriteJson(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

export function createState(file) {
  let data = { ...DEFAULTS };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed && typeof parsed === 'object') data = migrate(parsed);
  } catch {
    // first run or unreadable state — start from defaults
  }
  // self-heal permissions on documents written by older versions
  try {
    fs.chmodSync(file, 0o600);
  } catch {
    // the file may not exist yet
  }

  /** Explicit persistence point; callers own when a change becomes durable. */
  function save() {
    try {
      atomicWriteJson(file, data);
    } catch {
      // state persistence is best-effort; the in-memory copy keeps working
    }
  }

  /**
   * Append a structured, localizable event. `code` names the event and
   * `params` carries its interpolation values; the client renders it through
   * its locale dictionaries. Raw `text` is accepted for internal errors.
   */
  function event(code, params = {}, level = 'info') {
    data.log.unshift({ at: new Date().toISOString(), level, code, params });
    if (data.log.length > LOG_LIMIT) data.log.length = LOG_LIMIT;
    save();
  }

  /**
   * Whether a candidate is already handled for the CURRENT account. A record
   * blocks re-checking only when it belongs to this account: after a sign-in
   * as a different account every old record stops blocking, so the next
   * check re-audits the whole rotation against the new library.
   */
  function hasClaimed(candidate) {
    const current = data.accountId ?? data.accountName ?? null;
    return data.claimed.some(entry => {
      const ownedBy = entry.account ?? null;
      if (ownedBy !== null && current !== null && ownedBy !== current) return false;
      return (candidate.offerId && entry.offerId === candidate.offerId)
        || (candidate.pageSlug && entry.pageSlug === candidate.pageSlug);
    });
  }

  function addClaimed(entry) {
    data.claimed.push(entry);
    if (data.claimed.length > CLAIM_LIMIT) data.claimed = data.claimed.slice(-CLAIM_LIMIT);
    save();
  }

  function clearClaimed(code = 'recheck.cleared') {
    data.claimed = [];
    event(code);
  }

  return { data, save, event, hasClaimed, addClaimed, clearClaimed };
}

// ---------------------------------------------------------------------------
// pure helpers (exported for tests)

/** Mask an account id for display: never expose the full identifier. */
export function maskAccountId(id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}
