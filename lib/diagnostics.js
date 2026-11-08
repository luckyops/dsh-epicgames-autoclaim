import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_LIMIT = 20;
const SCREENSHOT_TTL_MS = 7 * 24 * 60 * 60_000;

/**
 * Diagnostic pruner with robust error handling and file permission respect.
 */
export function pruneScreenshots(errorsDir) {
  if (!fs.existsSync(errorsDir)) return;
  try {
    const now = Date.now();
    const files = fs.readdirSync(errorsDir)
      .filter(name => name.endsWith('.png'))
      .map(name => {
        const full = path.join(errorsDir, name);
        try {
          return { name, mtime: fs.statSync(full).mtimeMs };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.mtime - a.mtime);

    const keep = new Set(
      files
        .filter(entry => now - entry.mtime <= SCREENSHOT_TTL_MS)
        .slice(0, SCREENSHOT_LIMIT)
        .map(entry => entry.name),
    );

    for (const entry of files) {
      if (!keep.has(entry.name)) {
        try {
          fs.rmSync(path.join(errorsDir, entry.name), { force: true });
        } catch {
          // Best-effort pruning
        }
      }
    }
  } catch {
    // Pruning is background maintenance; silent failure
  }
}
