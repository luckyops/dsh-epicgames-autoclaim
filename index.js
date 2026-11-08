/**
 * Epic Games Store weekly free games — DeepSeek Harness plugin (Host half).
 *
 * Sign in once through a real browser window; afterwards this plugin
 * discovers the weekly free games on a schedule and claims them into your
 * Epic library automatically.
 *
 * This file is the composition root: it wires config, state, browser, and
 * the operation controller, then mounts the four projections of the same
 * operations (HTTP API, slash command, agent service). All behavior lives
 * in lib/ modules.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Schema from '@deepseek-ai/schemastery';
import { createState } from './lib/state.js';
import { createBrowserManager } from './lib/browser.js';
import { createController } from './lib/controller.js';
import { registerHttpApi } from './lib/http-api.js';
import { registerCommand } from './lib/command.js';
import { createUserLocale } from './lib/i18n.js';

export const Config = Schema.object({
  intervalHours: Schema.number()
    .role('slide')
    .min(1).max(168).step(1).default(12)
    .i18n({
      en: 'Hours between automatic checks (the giveaway rotation is weekly).',
      zh: '两次自动检查的间隔小时数（周免每周轮换）。',
    }),
  country: Schema.string()
    .pattern(/^[A-Za-z]{2}$/)
    .default('US')
    .i18n({
      en: 'Store country code for discovery, e.g. US, CN, DE.',
      zh: '发现免费游戏用的商店国家代码，如 US、CN、DE。',
    }),
  locale: Schema.string()
    .pattern(/^[A-Za-z]{2}-[A-Za-z]{2,4}$/)
    .default('en-US')
    .i18n({
      en: 'Store locale for discovery and claim pages, e.g. en-US, zh-CN.',
      zh: '商店与领取页面语言，如 en-US、zh-CN。',
    }),
  loginLang: Schema.string()
    .pattern(/^([A-Za-z]{2}(-[A-Za-z]{2,4})?)?$/)
    .default('')
    .i18n({
      en: 'Login window language (the human verification follows it); empty follows `locale`.',
      zh: '登录窗口语言（人机验证跟随该语言）；留空跟随商店语言。',
    }),
  claimHeadless: Schema.boolean()
    .default(false)
    .i18n({
      en: 'Claim without a visible browser window; off (default) is most reliable against bot checks.',
      zh: '领取时是否隐藏浏览器窗口；关闭（默认）对反机器人检测最稳。',
    }),
  executablePath: Schema.string()
    .default('')
    .i18n({
      en: 'Optional full path to a Chromium-based browser executable; empty uses system Chrome.',
      zh: '可选的 Chromium 内核浏览器完整路径；留空使用系统 Chrome。',
    }),
  runOnStartup: Schema.boolean()
    .default(true)
    .i18n({
      en: 'Run one check shortly after the Host starts.',
      zh: 'Host 启动后不久先检查一次。',
    }),
});

export function apply(ctx, config) {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const dataDir = path.join(home, 'data', 'epic-autoclaim');
  // One-time migration from the pre-rename data directory (<= 1.3.x, package
  // dsh-plugin-epicgames-auto): move it into place so the Epic sessions,
  // claim history, and diagnostic screenshots survive the rename.
  const legacyDataDir = path.join(home, 'data', 'epicgames-auto');
  if (!fs.existsSync(dataDir) && fs.existsSync(legacyDataDir)) {
    try {
      fs.renameSync(legacyDataDir, dataDir);
    } catch {
      // best-effort: on failure a fresh directory is created below and the
      // legacy data simply stays behind (sign in again to re-establish)
    }
  }
  const errorsDir = path.join(dataDir, 'errors');
  // owner-only: the data directory holds the browser profile (session
  // cookies), the state file (account id, display name, game history), and
  // diagnostic screenshots
  fs.mkdirSync(errorsDir, { recursive: true, mode: 0o700 });
  for (const dir of [dataDir, errorsDir]) {
    try {
      fs.chmodSync(dir, 0o700);
    } catch {
      // best-effort hardening of existing directories
    }
  }

  const state = createState(path.join(dataDir, 'state.json'));
  const browser = createBrowserManager({ dataDir, logger: ctx.logger });

  // One-time upgrade of a pre-multi-account install: the old shared profile
  // becomes the "legacy" account's own profile, so the existing Epic session
  // survives the transition intact.
  if (Object.keys(state.data.accounts).length === 0) {
    const legacyDir = path.join(dataDir, 'browser-profile');
    if (fs.existsSync(legacyDir)) {
      try {
        fs.renameSync(legacyDir, browser.dirOf('legacy'));
      } catch {
        // if the rename fails the legacy profile is simply re-adopted on login
      }
      state.upsertAccount({
        key: 'legacy',
        id: state.data.accountId ?? null,
        name: state.data.accountName ?? null,
        loggedInAt: state.data.loggedInAt,
        sessionOk: state.data.sessionOk ?? null,
      });
    }
  }

  const controller = createController({ ctx, config, state, browser, errorsDir });

  // ---- projections of the same operations ----------------------------------
  ctx.inject(['webServer'], scope => {
    registerHttpApi(scope, scope.webServer ?? scope.get('webServer'), controller);
  });

  ctx.inject(['commands'], scope => {
    registerCommand(scope, controller, createUserLocale(ctx));
  });

  // Service consumed by the agent-plane entry (./tool) and any other plugin.
  ctx.provide('epicGames', {
    status: controller.status,
    startLogin: controller.startLogin,
    runCheck: controller.runCheck,
    recheck: controller.recheck,
  });

  // The agent tool lives behind the `./tool` subpath entry so a preset can
  // mount it for its agents (root-mounted tools never enter agent toolsets).
}
