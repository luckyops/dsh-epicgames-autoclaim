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
    description: 'Epic weekly free games: /epicgames status | login | check | recheck · 每周免费游戏',
    input: { hint: '<status|login|check|recheck>' },
    handler: async ({ rawInput }) => {
      const action = String(rawInput ?? '').trim().toLowerCase() || 'status';
      try {
        if (action === 'login') {
          const outcome = controller.startLogin();
          return outcome.started
            ? {
              kind: 'success',
              text: '已打开 Epic 登录窗口，完成登录后窗口自动关闭。Sign-in window opened; it closes itself once logged in.',
            }
            : { kind: 'error', text: `有任务正在运行，请稍后再试。Another operation is running (${outcome.reason}).` };
        }
        if (action === 'check') {
          const outcome = controller.runCheck(true);
          return outcome.started
            ? { kind: 'success', text: '已开始检查并领取。Check started; see /epicgames status.' }
            : { kind: 'error', text: '有任务正在运行，请稍后再试。Another operation is running.' };
        }
        if (action === 'recheck') {
          const outcome = controller.recheck();
          return outcome.started
            ? {
              kind: 'success',
              text: '已清除记录并按当前账号全量核对。Full re-audit started for the signed-in account.',
            }
            : { kind: 'error', text: '有任务正在运行，请稍后再试。Another operation is running.' };
        }

        const view = controller.status();
        const lines = [
          `Sign-in 登录: ${view.signedIn ? `yes ✓ (${view.accountName ?? 'unknown account'})` : 'no — /epicgames login'}`,
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
  }), 'epicgames-auto: command');
}
