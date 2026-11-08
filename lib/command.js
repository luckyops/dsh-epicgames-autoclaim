/**
 * The `/epicgames` human command: one projection of the same operations the
 * settings page and the agent tool expose. Replies localize through the
 * Host-side user-language reader: they follow the language the user picked
 * in the GUI (Settings → General → Language) and fall back to bilingual
 * one-liners when no explicit choice exists; the settings page carries the
 * fully localized detail.
 */
import { makeT } from './i18n.js';
import { dispatchOperation } from './operations.js';

const errMsg = error => (error instanceof Error ? error.message : String(error));

/** Bilingual reply table; values may be functions of the listed params. */
export const COMMAND_MESSAGES = {
  loginOpened: {
    zh: '已打开登录窗口（新账号请直接登录，老账号可刷新会话）。',
    en: 'Sign-in window opened; new accounts are added automatically.',
  },
  busy: {
    zh: reason => `有任务正在运行，请稍后再试（${reason}）。`,
    en: reason => `Another operation is running (${reason}).`,
  },
  signedOut: {
    zh: count => `已退出 ${count} 个账号（会话已清除）。`,
    en: count => `Signed out ${count} account(s).`,
  },
  logoutFailed: {
    zh: reason => `未找到该账号或任务运行中（${reason}）。`,
    en: reason => `Unknown account, or another operation is running (${reason}).`,
  },
  checkStarted: {
    zh: '已开始检查并领取（逐账号进行）。',
    en: 'Check started for every account.',
  },
  recheckStarted: {
    zh: '已清除记录并按各账号全量核对。',
    en: 'Full re-audit started for all accounts.',
  },
  sidebarHidden: {
    zh: '已在左侧边栏隐藏图标（仍可在“设置 → Epic 免费游戏”中打开）。',
    en: 'Left-sidebar icon hidden (still available in Settings → Epic free games).',
  },
  sidebarShown: {
    zh: '已在左侧边栏恢复显示图标。',
    en: 'Left-sidebar icon restored.',
  },
  busyPlain: {
    zh: '有任务正在运行，请稍后再试。',
    en: 'Another operation is running.',
  },
  accountsLabel: { zh: '账号', en: 'Accounts' },
  freeNowLabel: { zh: '当前免费', en: 'Free now' },
  recentClaimsLabel: { zh: '最近领取', en: 'Recent claims' },
  nextCheckLabel: { zh: '下次检查', en: 'Next check' },
  lastErrorLabel: { zh: '最近错误', en: 'Last error' },
  none: { zh: '无', en: 'none' },
  unscheduled: { zh: '未排期', en: 'unscheduled' },
};

/** Execute one parsed `/epicgames` command and format its localized reply. */
export function executeCommandInput(controller, rawInput, locale = null) {
  const t = makeT(locale);
  const [action, ...rest] = String(rawInput ?? '').trim().split(/\s+/);
  const target = rest.join(' ');
  try {
    if (action === 'login') {
      const outcome = dispatchOperation(controller, 'login');
      return outcome.started
        ? { kind: 'success', text: t(COMMAND_MESSAGES, 'loginOpened') }
        : { kind: 'error', text: t(COMMAND_MESSAGES, 'busy', outcome.reason) };
    }
    if (action === 'logout') {
      const outcome = dispatchOperation(controller, 'logout', { target: target || 'all' });
      return outcome.started
        ? { kind: 'success', text: t(COMMAND_MESSAGES, 'signedOut', outcome.count) }
        : { kind: 'error', text: t(COMMAND_MESSAGES, 'logoutFailed', outcome.reason) };
    }
    if (action === 'check') {
      const outcome = dispatchOperation(controller, 'check');
      return outcome.started
        ? { kind: 'success', text: t(COMMAND_MESSAGES, 'checkStarted') }
        : { kind: 'error', text: t(COMMAND_MESSAGES, 'busyPlain') };
    }
    if (action === 'recheck') {
      const outcome = dispatchOperation(controller, 'recheck');
      return outcome.started
        ? { kind: 'success', text: t(COMMAND_MESSAGES, 'recheckStarted') }
        : { kind: 'error', text: t(COMMAND_MESSAGES, 'busyPlain') };
    }
    if (action === 'hide-sidebar' || (action === 'sidebar' && target.toLowerCase() === 'hide')) {
      dispatchOperation(controller, 'hide-sidebar');
      return { kind: 'success', text: t(COMMAND_MESSAGES, 'sidebarHidden') };
    }
    if (action === 'show-sidebar' || (action === 'sidebar' && target.toLowerCase() === 'show')) {
      dispatchOperation(controller, 'show-sidebar');
      return { kind: 'success', text: t(COMMAND_MESSAGES, 'sidebarShown') };
    }

    const view = dispatchOperation(controller, 'status');
    const join = items => items.join(' · ') || t(COMMAND_MESSAGES, 'none');
    const lines = [
      `${t(COMMAND_MESSAGES, 'accountsLabel')}: ${
        join(view.accounts.map(account =>
          `${account.name ?? account.id ?? account.key}${account.sessionOk === false ? '(!)' : ''}`))
      }`,
      `${t(COMMAND_MESSAGES, 'freeNowLabel')}: ${join((view.current ?? []).map(game => game.title))}`,
      `${t(COMMAND_MESSAGES, 'recentClaimsLabel')}: ${join((view.claimed ?? []).slice(0, 5).map(entry => entry.title))}`,
      `${t(COMMAND_MESSAGES, 'nextCheckLabel')}: ${
        view.nextRunAt ? new Date(view.nextRunAt).toLocaleString() : t(COMMAND_MESSAGES, 'unscheduled')
      }`,
    ];
    if (view.lastError) lines.push(`${t(COMMAND_MESSAGES, 'lastErrorLabel')}: ${view.lastError}`);
    return { kind: 'success', text: lines.join('\n') };
  } catch (error) {
    return { kind: 'error', text: errMsg(error) };
  }
}

export function registerCommand(scope, controller, userLocale) {
  const commands = scope.commands ?? scope.get('commands');
  const readLocale = userLocale ?? (() => null);

  scope.effect(() => commands.register({
    name: 'epicgames',
    // The command registry accepts a plain string only, so the palette line
    // stays bilingual; the replies above switch by the user's language.
    description: 'Epic weekly free games: /epicgames status | login | check | recheck | logout [name|all] · 每周免费游戏（多账号）',
    input: { hint: '<status|login|check|recheck|logout [name|all]>' },
    handler: async ({ rawInput }) => executeCommandInput(controller, rawInput, readLocale()),
  }), 'epicgames-autoclaim: command');
}
