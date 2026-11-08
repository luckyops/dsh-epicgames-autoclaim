/**
 * Agent-plane entry (`dsh-epicgames-autoclaim/tool`): exposes the
 * `epicgames_free_games` tool to agents. Mount this row inside an agent preset
 * (Settings → agent preset editor) to give sessions the tool; the host-plane row
 * alone never enters agent toolsets. Operations run through the `epicGames`
 * service provided by the host half, so every caller shares one implementation.
 */
import Schema from '@deepseek-ai/schemastery';

export const inject = ['tools'];

export function apply(ctx) {
  ctx.inject(['epicGames'], scope => {
    const controller = scope.epicGames ?? scope.get('epicGames');
    if (!controller) return;

    scope.effect(() => scope.tools.register({
      name: 'epicgames_free_games',
      description:
        'Epic Games Store weekly free games (multi-account). `status` reports accounts, current free '
        + 'games, and recent claims. `check` starts a background discovery-and-claim run for every '
        + 'registered account. `login` opens a browser window to add an account or refresh its session '
        + '(the plugin never handles credentials). `logout` signs an account out (target: profile key, '
        + 'account name, or "all"). `recheck` re-audits every free game for every account.',
      parameters: Schema.object({
        action: Schema.string()
          .enum(['status', 'check', 'recheck', 'login', 'logout'])
          .default('status')
          .description('Operation to run: status | check | recheck | login | logout.'),
        target: Schema.string()
          .description('For logout: the account name, its profile key, or "all" (default).'),
      }),
      async execute(args) {
        if (args.action === 'login') {
          return withNote(controller.startLogin(), 'login window opened; poll with action=status');
        }
        if (args.action === 'logout') {
          const outcome = controller.logout(args.target || 'all');
          return outcome.started
            ? { ...outcome, note: `signed out ${outcome.count} account(s)` }
            : { ...outcome, note: outcome.reason === 'busy' ? 'another operation is running' : 'unknown account' };
        }
        if (args.action === 'recheck') {
          return withNote(controller.recheck(), 'full re-audit started; poll with action=status');
        }
        if (args.action === 'check') {
          return withNote(controller.runCheck(true), 'background run started; poll with action=status');
        }
        return controller.status();
      },
    }), 'epicgames-autoclaim: agent tool');
  });
}

function withNote(outcome, note) {
  return outcome.started
    ? { ...outcome, note }
    : { ...outcome, note: 'another operation is running; retry later' };
}
