import fs from 'node:fs';
import path from 'node:path';
// patchright is a stealth-patched Playwright build (API-identical): Epic's
// bot wall (Talon/hCaptcha) rejects vanilla automation browsers, and this
// fork passes those checks.
import { chromium as defaultChromium } from 'patchright';

const SINGLETON_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

const sameLaunch = (a, b) => a.headless === b.headless
  && a.executablePath === b.executablePath
  && a.locale === b.locale;

/**
 * Persistent Chromium profiles, one per Epic account (`browser-profile-<key>`),
 * keeping each account's session cookies across runs.
 *
 * Contract (LSP):
 * - `acquire(key, options)` guarantees a LIVE `BrowserContext` matching BOTH
 *   `key` and normalized `options`. If an existing context differs or was
 *   closed externally by the user, it is cleanly released/discarded and
 *   relaunched.
 * - `adoptProfile(from, to)` moves a scratch sign-in profile to its permanent
 *   account key.
 * - `deleteProfile(key)` destroys an account's persistent cookie store.
 */
export function createBrowserManager({ dataDir, logger, launcher = defaultChromium }) {
  const dirOf = key =>
    path.join(dataDir, `browser-profile-${String(key).replace(/[^a-zA-Z0-9_-]/g, '-')}`);

  let active = null; // Promise<BrowserContext>
  let activeContext = null; // resolved BrowserContext
  let activeLaunch = null; // { key, options }

  function normalize({ headless = true, executablePath = '', locale = '' } = {}) {
    return {
      headless: headless === true,
      executablePath: executablePath || '',
      locale: locale || '',
    };
  }

  async function launch(key, options) {
    const profileDir = dirOf(key);
    // owner-only: profiles persist Epic session cookies
    fs.mkdirSync(profileDir, { recursive: true, mode: 0o700 });
    try {
      fs.chmodSync(profileDir, 0o700);
    } catch {
      // best-effort hardening
    }
    for (const name of SINGLETON_FILES) {
      try {
        fs.rmSync(path.join(profileDir, name), { force: true });
      } catch {
        // stale lock files are best-effort removed
      }
    }

    const attempts = [];
    if (options.executablePath) {
      attempts.push({ executablePath: options.executablePath });
    }
    attempts.push({ channel: 'chrome' }, { channel: 'msedge' }, { channel: 'chrome-beta' });

    let lastError;
    for (const extra of attempts) {
      try {
        return await launcher.launchPersistentContext(profileDir, {
          headless: options.headless,
          viewport: null,
          locale: options.locale || undefined,
          ignoreDefaultArgs: ['--enable-automation'],
          args: ['--disable-blink-features=AutomationControlled'],
          ...extra,
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw new Error(
      `Unable to launch a Chromium browser (无法启动 Chromium 浏览器): ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }. Install Google Chrome or set executablePath in the plugin configuration.`,
    );
  }

  return {
    dirOf,
    hasProfile(key) {
      return fs.existsSync(dirOf(key));
    },
    isRunning() {
      return active !== null;
    },
    async acquire(key, rawOptions = {}) {
      const options = normalize(rawOptions);
      if (
        active
        && activeLaunch
        && activeLaunch.key === key
        && sameLaunch(activeLaunch.options, options)
      ) {
        return active;
      }
      if (active) await this.release(); // profile or options differ — restart honestly
      const launchSpec = { key, options };
      activeLaunch = launchSpec;
      const pending = launch(key, options);
      active = pending;
      try {
        const context = await pending;
        if (active === pending) {
          activeContext = context;
          context.on?.('close', () => {
            if (activeContext === context) {
              active = null;
              activeContext = null;
              activeLaunch = null;
            }
          });
        }
        return context;
      } catch (error) {
        if (active === pending) {
          active = null;
          activeContext = null;
          activeLaunch = null;
        }
        throw error;
      }
    },
    async release() {
      const pending = active;
      active = null;
      activeContext = null;
      activeLaunch = null;
      if (!pending) return;
      try {
        const context = await pending;
        await context.close();
      } catch (error) {
        logger?.warn?.(`closing the Epic browser profile failed: ${
          error instanceof Error ? error.message : String(error)
        }`);
      }
    },
    /** Move a fresh sign-in profile (key `from`) to its permanent home (`to`). */
    async adoptProfile(from, to) {
      await this.release();
      const source = dirOf(from);
      const target = dirOf(to);
      if (!fs.existsSync(source)) return false;
      if (source === target) return true;
      try {
        fs.rmSync(target, { recursive: true, force: true });
        fs.renameSync(source, target);
        return true;
      } catch (error) {
        logger?.warn?.(`adopting the sign-in profile failed: ${
          error instanceof Error ? error.message : String(error)
        }`);
        return false;
      }
    },
    /** Destroy one account's profile — its session cookies are the sign-in. */
    async deleteProfile(key) {
      await this.release();
      try {
        fs.rmSync(dirOf(key), { recursive: true, force: true });
        return true;
      } catch (error) {
        logger?.warn?.(`deleting the browser profile failed: ${
          error instanceof Error ? error.message : String(error)
        }`);
        return false;
      }
    },
  };
}
