/**
 * The `/epicgames` human command: one projection of the same operations the
 * settings page and the agent tool expose. Replies localize through the
 * Host-side user-language reader: they follow the language the user picked
 * in the GUI (Settings → General → Language) and fall back to bilingual
 * one-liners when no explicit choice exists; the settings page carries the
 * fully localized detail.
 */
import { makeT } from './i18n.js';

const errMsg = error => (error instanceof Error ? error.message : String(error));

/** Bilingual reply table; values may be functions of the listed params. */
const M = {
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

export function registerCommand(scope, controller, userLocale) {
  const commands = scope.commands ?? scope.get('commands');
  const readLocale = userLocale ?? (() => null);

  scope.effect(() => commands.register({
    name: 'epicgames',
    // The command registry accepts a plain string only, so the palette line
    // stays bilingual; the replies above switch by the user's language.
    description: 'Epic weekly free games: /epicgames status | login | check | recheck | logout [name|all] · 每周免费游戏（多账号）',
    input: { hint: '<status|login|check|recheck|logout [name|all]>' },
    handler: async ({ rawInput }) => {
      const t = makeT(readLocale());
      const [action, ...rest] = String(rawInput ?? '').trim().split(/\s+/);
      const target = rest.join(' ');
      try {
        if (action === 'login') {
          const outcome = controller.startLogin();
          return outcome.started
            ? { kind: 'success', text: t(M, 'loginOpened') }
            : { kind: 'error', text: t(M, 'busy', outcome.reason) };
        }
        if (action === 'logout') {
          const outcome = controller.logout(target || 'all');
          return outcome.started
            ? { kind: 'success', text: t(M, 'signedOut', outcome.count) }
            : { kind: 'error', text: t(M, 'logoutFailed', outcome.reason) };
        }
        if (action === 'check') {
          const outcome = controller.runCheck(true);
          return outcome.started
            ? { kind: 'success', text: t(M, 'checkStarted') }
            : { kind: 'error', text: t(M, 'busyPlain') };
        }
        if (action === 'recheck') {
          const outcome = controller.recheck();
          return outcome.started
            ? { kind: 'success', text: t(M, 'recheckStarted') }
            : { kind: 'error', text: t(M, 'busyPlain') };
        }

        const view = controller.status();
        const join = items => items.join(' · ') || t(M, 'none');
        const lines = [
          `${t(M, 'accountsLabel')}: ${
            join(view.accounts.map(account =>
              `${account.name ?? account.id ?? account.key}${account.sessionOk === false ? '(!)' : ''}`))
          }`,
          `${t(M, 'freeNowLabel')}: ${join((view.current ?? []).map(game => game.title))}`,
          `${t(M, 'recentClaimsLabel')}: ${join((view.claimed ?? []).slice(0, 5).map(entry => entry.title))}`,
          `${t(M, 'nextCheckLabel')}: ${
            view.nextRunAt ? new Date(view.nextRunAt).toLocaleString() : t(M, 'unscheduled')
          }`,
        ];
        if (view.lastError) lines.push(`${t(M, 'lastErrorLabel')}: ${view.lastError}`);
        return { kind: 'success', text: lines.join('\n') };
      } catch (error) {
        return { kind: 'error', text: errMsg(error) };
      }
    },
  }), 'epic-autoclaim: command');
}
