import fs from 'node:fs';
import path from 'node:path';

/**
 * Durable state persistence seam (Repository pattern).
 *
 * Separates serialization, atomic file replacement, permission hardening,
 * corrupt-file preservation, and schema migrations from the in-memory domain
 * model in `lib/state.js`. Two concrete adapters satisfy the same `{ load,
 * save }` interface:
 * - `createJsonFileStore(file)` for production (`0600` atomic temp + rename)
 * - `createMemoryStore(initial)` for fast, isolated unit/integration tests
 */

export const SCHEMA_VERSION = 4;

export const DEFAULTS = Object.freeze({
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
  lastFailureKind: null,
  hideSidebar: false,
  configHideSidebar: null,
  current: [],
  claimed: [],
  log: [],
  /** Multi-account registry: profileKey → account record. */
  accounts: {},
});

/** Deep-copy mutable containers so state instances never share references. */
export function freshData(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const accounts = {};
  if (source.accounts && typeof source.accounts === 'object' && !Array.isArray(source.accounts)) {
    for (const [key, value] of Object.entries(source.accounts)) {
      if (value && typeof value === 'object') {
        accounts[key] = { ...value, key: value.key ?? key };
      }
    }
  }
  return {
    ...DEFAULTS,
    ...source,
    claimed: Array.isArray(source.claimed) ? source.claimed.map(item => ({ ...item })) : [],
    current: Array.isArray(source.current) ? source.current.map(item => ({ ...item })) : [],
    log: Array.isArray(source.log) ? source.log.map(item => ({ ...item })) : [],
    accounts,
  };
}

/**
 * Schema migration pipeline (Chain of migration steps from v1 to current).
 * Pure function: takes any parsed JSON value and returns a valid v4 document.
 */
export function migrateStateDocument(parsed) {
  const source = parsed && typeof parsed === 'object' ? parsed : {};
  const data = freshData(parsed);
  const from = typeof source.schemaVersion === 'number' ? source.schemaVersion : 1;

  if (from < 2) {
    data.consecutiveFailures = 0;
  }
  if (from < 3) {
    data.accounts = {};
  }
  if (from < 4) {
    // v4: transient execution phases are never persisted at rest; claim
    // entries gain `accountName` alongside `account` so raw account IDs are
    // never rendered in the UI.
    if (data.phase === 'discovery' || data.phase === 'claiming' || data.phase === 'login-waiting') {
      data.phase = 'idle';
    }
    data.lastFailureKind = data.lastFailureKind ?? null;
    const byOwner = new Map();
    for (const account of Object.values(data.accounts)) {
      if (account.id) byOwner.set(account.id, account);
      if (account.name) byOwner.set(account.name, account);
      if (account.key) byOwner.set(account.key, account);
    }
    data.claimed = data.claimed.map(entry => {
      const matched = entry.account ? byOwner.get(entry.account) : null;
      return {
        ...entry,
        accountKey: entry.accountKey ?? matched?.key ?? null,
        accountName: entry.accountName ?? matched?.name ?? null,
      };
    });
  }

  data.hideSidebar = typeof data.hideSidebar === 'boolean' ? data.hideSidebar : false;
  data.configHideSidebar = typeof data.configHideSidebar === 'boolean' ? data.configHideSidebar : null;
  data.schemaVersion = SCHEMA_VERSION;
  return data;
}

/**
 * Atomically write JSON with owner-only (`0600`) permissions from birth.
 * A unique temp path prevents concurrent write collisions and cleans up if
 * `renameSync` fails.
 */
export function atomicWriteJson(file, value) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(temp, 0o600);
    fs.renameSync(temp, file);
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      // ignore cleanup error
    }
    throw error;
  }
}

/**
 * Production file-backed Repository adapter.
 * Preserves any corrupted state file as `<file>.corrupt-<ts>.bak` before
 * falling back to defaults so a damaged file is recoverable.
 */
export function createJsonFileStore(file) {
  return {
    load() {
      let raw;
      try {
        raw = fs.readFileSync(file, 'utf8');
      } catch {
        return freshData(null);
      }
      // Self-heal permissions on documents written by older versions
      try {
        fs.chmodSync(file, 0o600);
      } catch {
        // ignore if chmod is unsupported
      }
      try {
        return migrateStateDocument(JSON.parse(raw));
      } catch {
        try {
          const bak = `${file}.corrupt-${Date.now()}.bak`;
          fs.copyFileSync(file, bak);
          fs.chmodSync(bak, 0o600);
          const dir = path.dirname(file);
          const prefix = `${path.basename(file)}.corrupt-`;
          const backups = fs.readdirSync(dir)
            .filter(name => name.startsWith(prefix) && name.endsWith('.bak'))
            .sort()
            .reverse();
          for (const stale of backups.slice(3)) {
            fs.rmSync(path.join(dir, stale), { force: true });
          }
        } catch {
          // best-effort backup and pruning of torn/corrupted file
        }
        return freshData(null);
      }
    },
    save(data) {
      try {
        atomicWriteJson(file, data);
      } catch {
        // state persistence is best-effort; the in-memory model keeps working
      }
    },
  };
}

/** In-memory Repository adapter for unit and integration tests. */
export function createMemoryStore(initial = null) {
  let snapshot = initial ? migrateStateDocument(initial) : freshData(null);
  return {
    load() {
      return freshData(snapshot);
    },
    save(data) {
      snapshot = freshData(data);
    },
    peek() {
      return snapshot;
    },
  };
}
