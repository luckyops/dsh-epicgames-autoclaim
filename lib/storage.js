import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LEGACY_DATA_DIRS = ['epic-autoclaim', 'epicgames-auto'];

/**
 * Bootstrap and harden the plugin's data directory (`0700`), migrating
 * legacy single-account and pre-rename directories when present.
 */
export function resolveDataPaths(home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')) {
  const dataRoot = path.join(home, 'data');
  const dataDir = path.join(dataRoot, 'epicgames-autoclaim');

  for (const legacyName of LEGACY_DATA_DIRS) {
    const legacyDir = path.join(dataRoot, legacyName);
    if (!fs.existsSync(dataDir) && fs.existsSync(legacyDir)) {
      try {
        fs.renameSync(legacyDir, dataDir);
      } catch {
        // best-effort: fresh directory is created below if rename fails
      }
    }
  }

  const errorsDir = path.join(dataDir, 'errors');
  fs.mkdirSync(errorsDir, { recursive: true, mode: 0o700 });
  for (const dir of [dataDir, errorsDir]) {
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // best-effort hardening
    }
  }

  return { dataDir, errorsDir, stateFile: path.join(dataDir, 'state.json') };
}

/**
 * One-time upgrade of a pre-1.4 single-account install: moves the shared
 * `browser-profile/` directory into `browser-profile-legacy/` and registers
 * the `legacy` account record so the existing Epic session survives intact.
 */
export function migrateLegacySingleAccountProfile({ dataDir, state, browser }) {
  if (Object.keys(state.data.accounts).length > 0) return false;
  const legacyDir = path.join(dataDir, 'browser-profile');
  if (!fs.existsSync(legacyDir)) return false;

  try {
    fs.renameSync(legacyDir, browser.dirOf('legacy'));
  } catch {
    // if the rename fails, the legacy profile is re-adopted on next login
  }
  state.upsertAccount({
    key: 'legacy',
    id: state.data.accountId ?? null,
    name: state.data.accountName ?? null,
    loggedInAt: state.data.loggedInAt ?? null,
    sessionOk: state.data.sessionOk ?? null,
  });
  return true;
}
