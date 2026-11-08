import fs from 'node:fs';
import path from 'node:path';

/**
 * Plugin-owned durable state: a plain domain object plus a small store.
 * Domain logic (account registry, per-account claim records) stays pure;
 * persistence is an explicit `save()` that writes atomically (temp file +
 * rename) under a schema version so future migrations have a path.
 */

export const SCHEMA_VERSION = 3;

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
  /** Multi-account registry: profileKey → account record. */
  accounts: {},
};

/** Deep-copy the mutable containers so instances never share references. */
function freshData(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  return {
    ...DEFAULTS,
    ...source,
    claimed: [...(Array.isArray(source.claimed) ? source.claimed : [])],
    current: [...(Array.isArray(source.current) ? source.current : [])],
    log: [...(Array.isArray(source.log) ? source.log : [])],
    accounts: { ...(source.accounts && typeof source.accounts === 'object' ? source.accounts : {}) },
  };
}

/** Migrate a parsed document from any known schema version to the current one. */
function migrate(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const data = freshData(parsed);
  const from = typeof source.schemaVersion === 'number' ? source.schemaVersion : 1;
  if (from < 2) {
    data.consecutiveFailures = 0;
  }
  if (from < 3) {
    data.accounts = {};
  }
  data.schemaVersion = SCHEMA_VERSION;
  return data;
}

/** Atomically write JSON (a crash between writes can never leave a torn
 * file), with owner-only permissions: the file names accounts and their
 * game libraries, so no other local user may read it. */
function atomicWriteJson(file, value) {
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.chmodSync(temp, 0o600);
  fs.renameSync(temp, file);
}

export function createState(file) {
  let data;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    data = migrate(parsed);
  } catch {
    // first run or unreadable state — start from defaults
    data = freshData(null);
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

  // ---- account registry ----------------------------------------------------

  /** Ordered account list, most recently used first. */
  function accountList() {
    return Object.values(data.accounts)
      .sort((a, b) => (b.loggedInAt ?? '').localeCompare(a.loggedInAt ?? ''));
  }

  /** Register or refresh an account; `profileKey` owns its browser profile. */
  function upsertAccount({ key, id = null, name = null, loggedInAt = null, sessionOk = null }) {
    const existing = data.accounts[key] ?? { key, id, name, loggedInAt, sessionOk };
    data.accounts[key] = {
      ...existing,
      id: id ?? existing.id,
      name: name ?? existing.name,
      loggedInAt: loggedInAt ?? existing.loggedInAt,
      sessionOk: sessionOk ?? existing.sessionOk ?? null,
    };
    // the single-account display fields mirror the most recent account
    data.accountId = data.accounts[key].id;
    data.accountName = data.accounts[key].name;
    save();
    return data.accounts[key];
  }

  function removeAccount(key) {
    const removed = data.accounts[key];
    if (removed) {
      delete data.accounts[key];
      save();
    }
    return removed ?? null;
  }

  // ---- claim records -------------------------------------------------------

  /**
   * Whether a candidate is already handled for ONE account (`key` is the
   * record's `account` value: the account id, falling back to its name).
   * Records of other accounts never block, so every library is audited
   * independently; legacy records without an account are treated as the
   * current account's.
   */
  function hasClaimed(candidate, accountKey) {
    return data.claimed.some(entry => {
      const ownedBy = entry.account ?? null;
      if (ownedBy !== null && accountKey !== null && ownedBy !== accountKey) return false;
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

  return {
    data,
    save,
    event,
    accountList,
    upsertAccount,
    removeAccount,
    hasClaimed,
    addClaimed,
    clearClaimed,
  };
}

// ---------------------------------------------------------------------------
// pure helpers (exported for tests)

/** Mask an account id for display: never expose the full identifier. */
export function maskAccountId(id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/** Filesystem-safe profile key for an account id or display name. */
export function profileKeyFor(id, name) {
  const raw = id ?? (name ? `named-${name}` : null);
  const key = String(raw ?? `anonymous-${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '');
  return key === '' ? `anonymous-${Date.now()}` : key;
}
