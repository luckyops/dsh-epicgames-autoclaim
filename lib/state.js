import {
  SCHEMA_VERSION,
  createJsonFileStore,
} from './state-store.js';

/**
 * Plugin-owned domain model (Aggregate Root).
 *
 * Keeps account registry invariants, per-account claim deduplication, and
 * structured activity logging pure in memory, delegating durable IO to a
 * `{ load, save }` store adapter (`lib/state-store.js`).
 */

export { SCHEMA_VERSION };

const LOG_LIMIT = 60;
const CLAIM_LIMIT = 400;

/** Canonical deduplication key for an account record (never null for registered accounts). */
export function accountOwnerKey(account) {
  if (!account) return null;
  if (typeof account === 'string') return account;
  return account.id ?? account.name ?? account.key ?? null;
}

/** Mask an account id for display: never expose the full identifier. */
export function maskAccountId(id) {
  if (typeof id !== 'string' || id.length === 0) return null;
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

/** Human-safe display label for an account: display name → masked id → profile key. */
export function accountDisplayLabel(account) {
  if (!account) return null;
  if (typeof account === 'string') return maskAccountId(account);
  return account.name ?? maskAccountId(account.id) ?? account.key ?? null;
}

/** Filesystem-safe profile key for an account id or display name. */
export function profileKeyFor(id, name) {
  const raw = id ?? (name ? `named-${name}` : null);
  const key = String(raw ?? `anonymous-${Date.now()}`)
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/^-+|-+$/g, '');
  return key === '' ? `anonymous-${Date.now()}` : key;
}

/**
 * Create the domain state model.
 * @param {string | { store: { load: () => object, save: (data: object) => void } }} fileOrOptions
 */
export function createState(fileOrOptions) {
  const store = typeof fileOrOptions === 'string'
    ? createJsonFileStore(fileOrOptions)
    : fileOrOptions?.store;
  if (!store || typeof store.load !== 'function' || typeof store.save !== 'function') {
    throw new TypeError('createState requires a file path or a { store } adapter');
  }

  const data = store.load();

  function save() {
    store.save(data);
  }

  /** Ordered account list, most recently used first. */
  function accountList() {
    return Object.values(data.accounts)
      .sort((a, b) => (b.loggedInAt ?? '').localeCompare(a.loggedInAt ?? ''));
  }

  /**
   * Recompute top-level single-account summary fields (`sessionOk`,
   * `accountId`, `accountName`, `loggedInAt`) from the `accounts` registry so
   * multi-account mutations never leave summary fields out of sync.
   */
  function syncSummaryFromAccounts() {
    const list = accountList();
    if (list.length === 0) {
      data.accountId = null;
      data.accountName = null;
      data.loggedInAt = null;
      data.sessionOk = false;
      return;
    }
    const primary = list[0];
    data.accountId = primary.id ?? null;
    data.accountName = primary.name ?? null;
    data.loggedInAt = primary.loggedInAt ?? data.loggedInAt ?? null;
    if (list.some(acc => acc.sessionOk === true)) {
      data.sessionOk = true;
    } else if (list.every(acc => acc.sessionOk === false)) {
      data.sessionOk = false;
    } else {
      data.sessionOk = null;
    }
  }

  /**
   * Append a structured, localizable event. `code` names the event and
   * `params` carries interpolation values; the client renders it through its
   * locale dictionaries.
   */
  function pushEvent(code, params = {}, level = 'info') {
    data.log.unshift({ at: new Date().toISOString(), level, code, params });
    if (data.log.length > LOG_LIMIT) data.log.length = LOG_LIMIT;
  }

  function event(code, params = {}, level = 'info') {
    pushEvent(code, params, level);
    save();
  }

  // ---- account registry ----------------------------------------------------

  /**
   * Resolve the profile key for a newly signed-in `(id, name)` pair.
   *
   * Reuses an existing account's `key` when:
   * 1. An account with the same `id` is already registered (e.g. under `'legacy'`
   *    or `'anonymous-...'`), preventing duplicate entries for one Epic account;
   * 2. `id` is not yet known, and an account with `id === null` and the same
   *    `name` already exists;
   * 3. A single unidentified `'legacy'` record (`id === null && name === null`)
   *    exists from a pre-1.4 upgrade.
   */
  function resolveAccountKey(id = null, name = null) {
    const accounts = Object.values(data.accounts);
    if (id) {
      const byId = accounts.find(acc => acc.id === id);
      if (byId) return byId.key;
    }
    if (name) {
      const byName = accounts.find(acc => acc.name === name && (!acc.id || !id));
      if (byName) return byName.key;
    }
    if (
      accounts.length === 1
      && data.accounts.legacy
      && data.accounts.legacy.id === null
      && data.accounts.legacy.name === null
    ) {
      return 'legacy';
    }
    return profileKeyFor(id, name);
  }

  /**
   * Register or refresh an account; `key` owns its browser profile.
   * If an initially unminted account (`id: null`) later acquires a verified
   * `id` or `name`, existing claim entries recorded under its `key` are
   * upgraded in-place so claim counts and deduplication stay continuous.
   * Also consolidates any duplicate record that already carries the same `id`.
   */
  function upsertAccount({ key, id = null, name = null, loggedInAt = null, sessionOk = null }) {
    const existing = data.accounts[key] ?? { key, id: null, name: null, loggedInAt: null, sessionOk: null };
    let mergedId = id ?? existing.id ?? null;
    let mergedName = name ?? existing.name ?? null;
    let mergedLoggedInAt = loggedInAt ?? existing.loggedInAt ?? null;

    // If another entry already had the same non-null `id`, fold its metadata into `key`
    if (mergedId) {
      for (const [otherKey, other] of Object.entries(data.accounts)) {
        if (otherKey !== key && other.id === mergedId) {
          mergedName = mergedName ?? other.name ?? null;
          if (!mergedLoggedInAt || (other.loggedInAt && other.loggedInAt > mergedLoggedInAt)) {
            mergedLoggedInAt = other.loggedInAt;
          }
          delete data.accounts[otherKey];
          for (const entry of data.claimed) {
            if (entry.accountKey === otherKey || entry.account === otherKey) {
              entry.accountKey = key;
            }
          }
        }
      }
    }

    const updated = {
      ...existing,
      key,
      id: mergedId,
      name: mergedName,
      loggedInAt: mergedLoggedInAt,
      sessionOk: sessionOk ?? existing.sessionOk ?? null,
    };
    data.accounts[key] = updated;

    const canonical = accountOwnerKey(updated);
    const label = accountDisplayLabel(updated);
    for (const entry of data.claimed) {
      if (
        entry.accountKey === key
        || (existing.key && entry.account === existing.key)
        || (existing.name && entry.account === existing.name)
      ) {
        entry.account = canonical;
        entry.accountKey = key;
        if (updated.name) entry.accountName = updated.name;
        else if (!entry.accountName && label) entry.accountName = label;
      }
    }

    // Mirror the just-upserted account into top-level summary fields
    data.accountId = updated.id;
    data.accountName = updated.name;
    if (updated.loggedInAt) data.loggedInAt = updated.loggedInAt;
    const list = accountList();
    if (list.some(acc => acc.sessionOk === true)) {
      data.sessionOk = true;
    } else if (list.every(acc => acc.sessionOk === false)) {
      data.sessionOk = false;
    } else {
      data.sessionOk = updated.sessionOk;
    }

    save();
    return updated;
  }

  function removeAccount(key) {
    const removed = data.accounts[key];
    if (!removed) return null;
    delete data.accounts[key];
    syncSummaryFromAccounts();
    save();
    return removed;
  }

  // ---- claim records -------------------------------------------------------

  /**
   * Whether a candidate is already handled for ONE account.
   * Accepts either an account object `{ key, id, name }` or an owner key string.
   *
   * Invariants:
   * 1. Records owned by another account NEVER block this account.
   * 2. An account without `id` yet (`{ key: 'anonymous-1', id: null }`) matches
   *    only its own `key` — never wildcard-matching other accounts' records.
   * 3. Pre-multi-account legacy records (`account == null && accountKey == null`)
   *    match when there is at most 1 registered account or the account key is `'legacy'`.
   */
  function hasClaimed(candidate, accountOrKey) {
    const targetKeys = new Set();
    let isLegacyCompatible = Object.keys(data.accounts).length <= 1;

    if (typeof accountOrKey === 'string' && accountOrKey.length > 0) {
      targetKeys.add(accountOrKey);
      if (accountOrKey === 'legacy') isLegacyCompatible = true;
    } else if (accountOrKey && typeof accountOrKey === 'object') {
      if (accountOrKey.id) targetKeys.add(accountOrKey.id);
      if (accountOrKey.name) targetKeys.add(accountOrKey.name);
      if (accountOrKey.key) targetKeys.add(accountOrKey.key);
      if (accountOrKey.key === 'legacy') isLegacyCompatible = true;
    }

    return data.claimed.some(entry => {
      const offerMatches = Boolean(
        (candidate.offerId && entry.offerId === candidate.offerId)
        || (candidate.pageSlug && entry.pageSlug === candidate.pageSlug),
      );
      if (!offerMatches) return false;

      const ownedBy = entry.account ?? null;
      const ownedByKey = entry.accountKey ?? null;

      if (ownedBy === null && ownedByKey === null) {
        return isLegacyCompatible;
      }
      if (targetKeys.size === 0) return false;
      return (ownedBy !== null && targetKeys.has(ownedBy))
        || (ownedByKey !== null && targetKeys.has(ownedByKey));
    });
  }

  function addClaimed(entry) {
    data.claimed.push(entry);
    if (data.claimed.length > CLAIM_LIMIT) {
      data.claimed = data.claimed.slice(-CLAIM_LIMIT);
    }
    save();
  }

  function clearClaimed(code = 'recheck.cleared') {
    data.claimed = [];
    event(code);
  }

  /** Count recorded claims belonging to a given account record. */
  function countClaimsFor(account) {
    const keys = new Set([account.id, account.name, account.key].filter(Boolean));
    const singleOrLegacy = Object.keys(data.accounts).length <= 1 || account.key === 'legacy';
    let count = 0;
    for (const entry of data.claimed) {
      const ownedBy = entry.account ?? null;
      const ownedByKey = entry.accountKey ?? null;
      if (ownedBy === null && ownedByKey === null) {
        if (singleOrLegacy) count += 1;
      } else if ((ownedBy && keys.has(ownedBy)) || (ownedByKey && keys.has(ownedByKey))) {
        count += 1;
      }
    }
    return count;
  }

  /** Project recent claim records with privacy-masked account labels for external views. */
  function recentClaimedView(limit = 30) {
    const byOwner = new Map();
    for (const acc of Object.values(data.accounts)) {
      const label = accountDisplayLabel(acc);
      if (acc.id) byOwner.set(acc.id, label);
      if (acc.name) byOwner.set(acc.name, label);
      if (acc.key) byOwner.set(acc.key, label);
    }
    return data.claimed
      .slice(-limit)
      .reverse()
      .map(entry => {
        const safeLabel = entry.accountName
          ?? (entry.account ? byOwner.get(entry.account) : null)
          ?? (entry.accountKey ? byOwner.get(entry.accountKey) : null)
          ?? maskAccountId(entry.account);
        return {
          title: entry.title,
          pageSlug: entry.pageSlug,
          offerId: entry.offerId ?? null,
          namespace: entry.namespace ?? null,
          url: entry.url ?? null,
          image: entry.image ?? null,
          claimedAt: entry.claimedAt,
          outcome: entry.outcome,
          account: safeLabel ?? null,
        };
      });
  }

  // ---- check & schedule mutations (batched single-save units of work) ------

  function recordDiscovery(candidates, checkedAtIso = new Date().toISOString()) {
    data.current = candidates;
    data.lastCheckAt = checkedAtIso;
    save();
  }

  function recordCheckSuccess({
    status,
    found,
    claimed,
    results,
    failed,
    failureKind = null,
    lastError = undefined,
    manual,
    accountCount,
    nextRun,
  }) {
    data.phase = 'idle';
    data.lastResult = {
      at: new Date().toISOString(),
      status,
      found,
      claimed,
      results,
    };
    if (lastError !== undefined) {
      data.lastError = lastError;
    } else if (status === 'ok' && !failed) {
      data.lastError = null;
    }
    data.consecutiveFailures = failed ? (data.consecutiveFailures ?? 0) + 1 : 0;
    data.lastFailureKind = failed ? failureKind : null;
    if (nextRun !== undefined) data.nextRunAt = nextRun;
    pushEvent(`check.summary.${manual ? 'manual' : 'auto'}`, {
      accounts: accountCount,
      found,
      claimed,
    });
    save();
  }

  function recordCheckFailure({ message, failureKind = 'transient', nextRun }) {
    data.lastError = message;
    data.phase = 'idle';
    data.consecutiveFailures = (data.consecutiveFailures ?? 0) + 1;
    data.lastFailureKind = failureKind;
    if (nextRun !== undefined) data.nextRunAt = nextRun;
    pushEvent('check.failed', { message }, 'error');
    save();
  }

  function resetFailureStreak() {
    let dirty = false;
    if (data.consecutiveFailures !== 0 || data.lastFailureKind !== null) {
      data.consecutiveFailures = 0;
      data.lastFailureKind = null;
      dirty = true;
    }
    if (typeof data.lastError === 'string' && data.lastError.startsWith('need-login')) {
      data.lastError = null;
      dirty = true;
    }
    if (dirty) save();
  }

  function scheduleNextRun(timestampMs) {
    data.nextRunAt = timestampMs;
    save();
  }

  return {
    data,
    save,
    event,
    accountList,
    syncSummaryFromAccounts,
    resolveAccountKey,
    upsertAccount,
    removeAccount,
    hasClaimed,
    addClaimed,
    clearClaimed,
    countClaimsFor,
    recentClaimedView,
    recordDiscovery,
    recordCheckSuccess,
    recordCheckFailure,
    resetFailureStreak,
    scheduleNextRun,
  };
}
