import { OPERATIONS } from './operations.js';

/**
 * The plugin's HTTP API for the settings page: driven by the canonical
 * `OPERATIONS` table. Every route — GET included — requires the plugin's own
 * header plus a verified loopback `Host` and `Origin`, so no other local
 * process can read the status document and no cross-site page or DNS-rebound
 * domain (`127.evil.example`) can trigger an action.
 */

const IPV4_LOOPBACK = /^127(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function isLoopbackHost(value) {
  if (!value) return false;
  try {
    const { hostname } = new URL(String(value).startsWith('http') ? String(value) : `http://${value}`);
    // WHATWG serializes IPv6 hostnames with brackets — strip them
    const bare = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return bare === 'localhost' || bare === '::1' || IPV4_LOOPBACK.test(bare);
  } catch {
    return false;
  }
}

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

  const guardAndRun = (req, res, expectedMethod, fn) => {
    if (req.method !== expectedMethod) {
      send(res, 405, { error: 'method-not-allowed' });
      return;
    }
    if (!allowRequest(req.headers)) {
      send(res, 403, { error: 'forbidden' });
      return;
    }
    try {
      send(res, 200, fn());
    } catch (error) {
      if (error instanceof URIError) {
        send(res, 400, { error: 'bad-request' });
        return;
      }
      send(res, 500, { error: 'internal-error' });
    }
  };

  const exactCommands = [
    OPERATIONS.status,
    OPERATIONS.login,
    OPERATIONS.check,
    OPERATIONS.recheck,
    OPERATIONS.hideSidebar,
    OPERATIONS.showSidebar,
  ];

  for (const cmd of exactCommands) {
    scope.effect(() => webServer.register({
      kind: 'exact',
      path: cmd.httpPath,
      handler: (req, res) => {
        guardAndRun(req, res, cmd.httpMethod, () => cmd.execute(controller));
      },
    }), `epicgames-autoclaim: ${cmd.httpPath} route`);
  }

  // Sign-out targets one account: POST /epicgames-autoclaim/api/logout/<profileKey>
  // ('all' signs out every account). A prefix route carries the key.
  const logoutCmd = OPERATIONS.logout;
  scope.effect(() => webServer.register({
    kind: 'prefix',
    path: logoutCmd.httpPrefix,
    handler: (req, res) => {
      guardAndRun(req, res, logoutCmd.httpMethod, () => {
        const rawSegment = String(req.url ?? '')
          .slice(logoutCmd.httpPrefix.length)
          .replace(/^\//, '')
          .split('?')[0];
        const target = decodeURIComponent(rawSegment);
        return logoutCmd.execute(controller, { target: target || 'all' });
      });
    },
  }), 'epicgames-autoclaim: logout route');
}
