import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_LIMIT = 20;
const SCREENSHOT_TTL_MS = 7 * 24 * 60 * 60_000;

/**
 * Keep only the newest screenshots within the retention window: they show
 * Epic pages and may carry an account's display name, so they expire.
 */
export function pruneScreenshots(errorsDir) {
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
