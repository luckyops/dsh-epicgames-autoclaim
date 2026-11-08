/**
 * The `/epicgames` human command: one projection of the same operations the
 * settings page and the agent tool expose. Replies are bilingual one-liners
 * so they read for any user; the settings page carries the localized detail.
 */

const errMsg = error => (error instanceof Error ? error.message : String(error));

export function registerCommand(scope, controller) {
  const commands = scope.commands ?? scope.get('commands');

  scope.effect(() => commands.register({
    name: 'epicgames',
    description: 'Epic weekly free games: /epicgames status | login | check | recheck | logout [name|all] · 每周免费游戏（多账号）',
    input: { hint: '<status|login|check|recheck|logout [name|all]>' },
    handler: async ({ rawInput }) => {
      const [action, ...rest] = String(rawInput ?? '').trim().split(/\s+/);
      const target = rest.join(' ');
      try {
        if (action === 'login') {
          const outcome = controller.startLogin();
          return outcome.started
            ? {
              kind: 'success',
              text: '已打开登录窗口（新账号请直接登录，老账号可刷新会话）。Sign-in window opened; new accounts are added automatically.',
            }
            : { kind: 'error', text: `有任务正在运行，请稍后再试。Another operation is running (${outcome.reason}).` };
        }
        if (action === 'logout') {
          const outcome = controller.logout(target || 'all');
          return outcome.started
            ? {
              kind: 'success',
              text: `已退出 ${outcome.count} 个账号（会话已清除）。Signed out ${outcome.count} account(s).`,
            }
            : {
              kind: 'error',
              text: `未找到该账号或任务运行中（${outcome.reason}）。Unknown account, or another operation is running.`,
            };
        }
        if (action === 'check') {
          const outcome = controller.runCheck(true);
          return outcome.started
            ? { kind: 'success', text: '已开始检查并领取（逐账号进行）。Check started for every account.' }
            : { kind: 'error', text: '有任务正在运行，请稍后再试。Another operation is running.' };
        }
        if (action === 'recheck') {
          const outcome = controller.recheck();
          return outcome.started
            ? { kind: 'success', text: '已清除记录并按各账号全量核对。Full re-audit started for all accounts.' }
            : { kind: 'error', text: '有任务正在运行，请稍后再试。Another operation is running.' };
        }

        const view = controller.status();
        const lines = [
          `Accounts 账号: ${view.accounts.map(account => `${account.name ?? account.id ?? account.key}${account.sessionOk === false ? '(!)' : ''}`).join(' · ') || 'none 未登录'}`,
          `Free now 当前免费: ${(view.current ?? []).map(game => game.title).join(' · ') || 'none 无'}`,
          `Recent claims 最近领取: ${(view.claimed ?? []).slice(0, 5).map(entry => entry.title).join(' · ') || 'none 无'}`,
          `Next check 下次检查: ${view.nextRunAt ? new Date(view.nextRunAt).toLocaleString() : 'unscheduled 未排期'}`,
        ];
        if (view.lastError) lines.push(`Last error 最近错误: ${view.lastError}`);
        return { kind: 'success', text: lines.join('\n') };
      } catch (error) {
        return { kind: 'error', text: errMsg(error) };
      }
    },
  }), 'epic-autoclaim: command');
}
