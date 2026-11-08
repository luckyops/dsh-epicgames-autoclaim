import fs from 'node:fs';
import path from 'node:path';
// patchright is a stealth-patched Playwright build (API-identical): Epic's
// bot wall (Talon/hCaptcha) rejects vanilla automation browsers, and this
// fork passes those checks.
import { chromium } from 'patchright';

const SINGLETON_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];

const sameOptions = (a, b) => a.headless === b.headless
  && a.executablePath === b.executablePath
  && a.locale === b.locale;

/**
 * One persistent Chromium profile dedicated to this plugin, keeping the Epic
 * login cookies across runs. The acquire contract is honest: if the live
 * instance does not match the requested options, it is closed and relaunched
 * with them (operations are serialized by the controller, so a restart is
 * always safe) — callers never receive a context built with different
 * options than they asked for.
 */
export function createBrowserManager({ dataDir, logger }) {
  const profileDir = path.join(dataDir, 'browser-profile');
  let active = null; // Promise<BrowserContext>
  let activeOptions = null;

  function normalize({ headless = true, executablePath = '', locale = '' } = {}) {
    return {
      headless: headless === true,
      executablePath: executablePath || '',
      locale: locale || '',
    };
  }

  async function launch(options) {
    // owner-only: the profile persists Epic session cookies
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
        return await chromium.launchPersistentContext(profileDir, {
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
      `无法启动 Chromium 浏览器（unable to launch a Chromium browser）：${
        lastError instanceof Error ? lastError.message : String(lastError)
      }。请安装 Google Chrome，或在插件配置 executablePath 里指定浏览器路径。`,
    );
  }

  return {
    profileDir,
    isRunning: () => active !== null,
    async acquire(rawOptions = {}) {
      const options = normalize(rawOptions);
      if (active && activeOptions && sameOptions(activeOptions, options)) {
        return active;
      }
      if (active) await this.release(); // options differ — restart honestly
      activeOptions = options;
      active = launch(options);
      try {
        return await active;
      } catch (error) {
        active = null;
        activeOptions = null;
        throw error;
      }
    },
    async release() {
      const pending = active;
      active = null;
      activeOptions = null;
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
  };
}
