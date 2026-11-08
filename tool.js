/**
 * Agent-plane entry (`dsh-plugin-epicgames-auto/tool`): exposes the
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
        'Epic Games Store weekly free games. `status` reports sign-in state, current free games, and recent claims. '
        + '`check` starts a background discovery-and-claim run and returns immediately (poll status for results). '
        + '`recheck` clears the per-account claim records and re-audits every free game against the signed-in account. '
        + '`login` opens a browser window for the user to sign in themselves; the plugin never handles credentials.',
      parameters: Schema.object({
        action: Schema.string()
          .enum(['status', 'check', 'recheck', 'login'])
          .default('status')
          .description('Operation to run: status | check | recheck | login.'),
      }),
      async execute(args) {
        if (args.action === 'login') {
          return withNote(controller.startLogin(), 'login window opened; poll with action=status');
        }
        if (args.action === 'recheck') {
          return withNote(controller.recheck(), 'full re-audit started; poll with action=status');
        }
        if (args.action === 'check') {
          return withNote(controller.runCheck(true), 'background run started; poll with action=status');
        }
        return controller.status();
      },
    }), 'epicgames-auto: agent tool');
  });
}

function withNote(outcome, note) {
  return outcome.started
    ? { ...outcome, note }
    : { ...outcome, note: 'another operation is running; retry later' };
}
