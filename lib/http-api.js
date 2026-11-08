/**
 * The plugin's HTTP API for the settings page: a route table (one line per
 * endpoint) driven by one registration loop. Every route — GET included —
 * requires the plugin's own header plus a loopback origin, so no other local
 * process can read the status document and no cross-site page can trigger
 * an action.
 */

const isLoopbackHost = value => {
  if (!value) return false;
  try {
    const { hostname } = new URL(String(value).startsWith('http') ? String(value) : `http://${value}`);
    // WHATWG serializes IPv6 hostnames with brackets — strip them
    const bare = hostname.replace(/^\[|\]$/g, '');
    return bare === 'localhost' || bare === '::1' || bare.startsWith('127.');
  } catch {
    return false;
  }
};

/** @returns true when the request may reach the API (tested). */
export function allowRequest(headers = {}) {
  if (headers['x-ega-plugin'] !== '1') return false;
  const origin = headers.origin;
  if (origin !== undefined && !isLoopbackHost(origin)) return false;
  return isLoopbackHost(headers.host);
}

export function registerHttpApi(scope, webServer, controller) {
  const send = (res, code, payload) => {
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify(payload));
  };

  const routes = [
    { path: '/epicgames-auto/api/status', method: 'GET', action: () => controller.status() },
    { path: '/epicgames-auto/api/login', method: 'POST', action: () => controller.startLogin() },
    { path: '/epicgames-auto/api/check', method: 'POST', action: () => controller.runCheck(true) },
    { path: '/epicgames-auto/api/recheck', method: 'POST', action: () => controller.recheck() },
  ];

  for (const route of routes) {
    scope.effect(() => webServer.register({
      kind: 'exact',
      path: route.path,
      handler: (req, res) => {
        if (req.method !== route.method) {
          send(res, 405, { error: 'method-not-allowed' });
          return;
        }
        if (!allowRequest(req.headers)) {
          send(res, 403, { error: 'forbidden' });
          return;
        }
        send(res, 200, route.action());
      },
    }), `epicgames-auto: ${route.path} route`);
  }
}
