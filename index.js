/**
 * Epic Games Store weekly free games — DeepSeek Harness plugin (Host half).
 *
 * Sign in once through a real browser window; afterwards this plugin
 * discovers the weekly free games on a schedule and claims them into your
 * Epic library automatically.
 *
 * This file is the composition root: it wires config, storage, state,
 * browser, and the operation controller, then mounts the projections of the
 * same operations (HTTP API, slash command, agent service). All behavior
 * lives in lib/ modules.
 */
import Schema from '@deepseek-ai/schemastery';
import { createState } from './lib/state.js';
import { createBrowserManager } from './lib/browser.js';
import { createController } from './lib/controller.js';
import { registerHttpApi } from './lib/http-api.js';
import { registerCommand } from './lib/command.js';
import { createUserLocale } from './lib/i18n.js';
import { createServiceFacade } from './lib/operations.js';
import { migrateLegacySingleAccountProfile, resolveDataPaths } from './lib/storage.js';

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
      en: 'Run one check 90s after the Host starts.',
      zh: 'Host 启动 90 秒后自动执行一次检查。',
    }),
  hideSidebar: Schema.boolean()
    .default(false)
    .i18n({
      en: 'Hide the shortcut icon in the left sidebar. The plugin page remains available in Settings → Epic free games.',
      zh: '在左侧边栏隐藏快捷图标（隐藏后仍可在“设置 → Epic 免费游戏”中打开）。',
    }),
  extraOrderSelectors: Schema.array(Schema.string())
    .default([])
    .i18n({
      en: 'Optional extra Playwright/CSS selectors for the checkout order button.',
      zh: '可选的额外结算下单按钮选择器（插件内置多语言选择器）。',
    }),
});

export function apply(ctx, config) {
  const { dataDir, errorsDir, stateFile } = resolveDataPaths();
  const state = createState(stateFile);
  const browser = createBrowserManager({ dataDir, logger: ctx.logger });

  migrateLegacySingleAccountProfile({ dataDir, state, browser });

  const controller = createController({ ctx, config, state, browser, errorsDir });
  const facade = createServiceFacade(controller);

  // ---- projections of the same operations ----------------------------------
  ctx.inject(['webServer'], scope => {
    registerHttpApi(scope, scope.webServer ?? scope.get('webServer'), controller);
  });

  ctx.inject(['commands'], scope => {
    registerCommand(scope, controller, createUserLocale(ctx));
  });

  // Service consumed by the agent-plane entry (./tool) and any other plugin.
  ctx.provide('epicGames', facade);
}
