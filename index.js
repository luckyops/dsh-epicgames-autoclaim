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

export const Config = Schema.object({
  intervalHours: Schema.number()
    .role('slide')
    .min(1).max(168).step(1).default(12)
    .description('Hours between automatic checks (the giveaway rotation is weekly). 两次自动检查的间隔小时数。'),
  country: Schema.string()
    .pattern(/^[A-Za-z]{2}$/)
    .default('US')
    .description('Store country code for discovery, e.g. US, CN, DE. 发现用的商店国家代码。'),
  locale: Schema.string()
    .pattern(/^[A-Za-z]{2}-[A-Za-z]{2,4}$/)
    .default('en-US')
    .description('Store locale for discovery and claim pages, e.g. en-US, zh-CN. 商店与领取页面语言。'),
  loginLang: Schema.string()
    .pattern(/^([A-Za-z]{2}(-[A-Za-z]{2,4})?)?$/)
    .default('')
    .description('Login window language (the human verification follows it); empty follows `locale`. 登录窗口语言，留空跟随商店语言。'),
  claimHeadless: Schema.boolean()
    .default(false)
    .description('Claim without a visible browser window; off (default) is most reliable against bot checks. 领取时是否隐藏浏览器窗口。'),
  executablePath: Schema.string()
    .default('')
    .description('Optional full path to a Chromium-based browser executable; empty uses system Chrome. 可选浏览器路径。'),
  runOnStartup: Schema.boolean()
    .default(true)
    .description('Run one check shortly after the Host starts. Host 启动后不久先检查一次。'),
});

export function apply(ctx, config) {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
  const dataDir = path.join(home, 'data', 'epicgames-auto');
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
  const controller = createController({ ctx, config, state, browser, errorsDir });

  // ---- projections of the same operations ----------------------------------
  ctx.inject(['webServer'], scope => {
    registerHttpApi(scope, scope.webServer ?? scope.get('webServer'), controller);
  });

  ctx.inject(['commands'], scope => {
    registerCommand(scope, controller);
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
