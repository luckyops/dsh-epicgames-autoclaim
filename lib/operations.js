/**
 * Unified Command Registry (GoF Command pattern).
 *
 * Defines the plugin's five application operations (`status`, `login`,
 * `logout`, `check`, `recheck`) in one canonical table so the four outer
 * projections (Host service `epicGames`, HTTP API, `/epicgames` slash
 * command, and `epicgames_free_games` agent tool) can never drift out of
 * sync.
 */

export const ACTION_NAMES = Object.freeze(['status', 'check', 'recheck', 'login', 'logout']);

export const OPERATIONS = Object.freeze({
  status: {
    name: 'status',
    httpMethod: 'GET',
    httpPath: '/epicgames-autoclaim/api/status',
    execute: controller => controller.status(),
  },
  login: {
    name: 'login',
    httpMethod: 'POST',
    httpPath: '/epicgames-autoclaim/api/login',
    execute: controller => controller.startLogin(),
  },
  check: {
    name: 'check',
    httpMethod: 'POST',
    httpPath: '/epicgames-autoclaim/api/check',
    execute: controller => controller.runCheck(true),
  },
  recheck: {
    name: 'recheck',
    httpMethod: 'POST',
    httpPath: '/epicgames-autoclaim/api/recheck',
    execute: controller => controller.recheck(),
  },
  logout: {
    name: 'logout',
    httpMethod: 'POST',
    httpPrefix: '/epicgames-autoclaim/api/logout',
    execute: (controller, { target = 'all' } = {}) => controller.logout(target || 'all'),
  },
});

/** Dispatch an operation by action name against a controller instance. */
export function dispatchOperation(controller, action = 'status', params = {}) {
  const command = OPERATIONS[action] ?? OPERATIONS.status;
  return command.execute(controller, params);
}

/**
 * Construct the Host-plane `epicGames` service facade from a controller.
 * Keeps every method (`status`, `startLogin`, `runCheck`, `recheck`,
 * `logout`, `isBusy`, `dispatch`) present and bound.
 */
export function createServiceFacade(controller) {
  return Object.freeze({
    status: () => controller.status(),
    startLogin: () => controller.startLogin(),
    runCheck: (manual = true) => controller.runCheck(manual),
    recheck: () => controller.recheck(),
    logout: (target = 'all') => controller.logout(target),
    isBusy: () => controller.isBusy(),
    dispatch: (action, params) => dispatchOperation(controller, action, params),
  });
}
