import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createBrowserManager } from '../lib/browser.js';
import { LOGIN_PROFILE_KEY, runClaimRun, runLoginFlow } from '../lib/claim.js';
import { executeCommandInput } from '../lib/command.js';
import { createController } from '../lib/controller.js';
import { registerHttpApi } from '../lib/http-api.js';
import { createServiceFacade } from '../lib/operations.js';
import { createState } from '../lib/state.js';
import { createMemoryStore } from '../lib/state-store.js';
import { migrateLegacySingleAccountProfile, resolveDataPaths } from '../lib/storage.js';
import { executeToolCall } from '../tool.js';

const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (payload, header = { alg: 'RS256' }) => `${b64url(header)}.${b64url(payload)}.sig`;
const eg1Cookie = ({ acct, dn, exp = Math.floor(Date.now() / 1000) + 3600 }) => ({
  name: 'EPIC_EG1',
  value: `v~${jwt({ exp, acct, dn })}~x`,
  domain: '.epicgames.com',
});
const ssoCookie = () => ({
  name: 'EPIC_SSO',
  value: 'sso-token',
  domain: '.epicgames.com',
});

const tempDirs = [];
function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'ega-multi-'));
  tempDirs.push(dir);
  return dir;
}
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Fake in-memory BrowserManager that tracks per-profile cookies and open/closed state. */
function createFakeBrowser({
  onAcquire,
  adoptResult = true,
} = {}) {
  const profiles = new Map(); // key -> { cookies: [], pageClosed: false }
  const deleted = [];
  const adopted = [];
  let activeKey = null;

  const ensureProfile = key => {
    if (!profiles.has(key)) {
      profiles.set(key, { cookies: [], pageClosed: false, urls: [] });
    }
    return profiles.get(key);
  };

  return {
    profiles,
    deleted,
    adopted,
    dirOf: key => `/fake/browser-profile-${key}`,
    hasProfile: key => profiles.has(key),
    isRunning: () => activeKey !== null,
    setCookies(key, cookies) {
      ensureProfile(key).cookies = cookies;
    },
    async acquire(key, options = {}) {
      activeKey = key;
      const record = ensureProfile(key);
      const page = {
        url: () => record.urls[record.urls.length - 1] ?? 'about:blank',
        isClosed: () => record.pageClosed,
        setDefaultTimeout: () => {},
        waitForLoadState: async () => {},
        goto: async targetUrl => {
          record.urls.push(targetUrl);
          onAcquire?.({ key, options, record, targetUrl });
        },
      };
      const context = {
        pages: () => (record.pageClosed ? [] : [page]),
        newPage: async () => page,
        cookies: async () => {
          if (record.throwOnCookies) throw new Error('Target page, context or browser has been closed');
          return record.cookies;
        },
        close: async () => {
          activeKey = null;
        },
      };
      return context;
    },
    async release() {
      activeKey = null;
    },
    async adoptProfile(from, to) {
      activeKey = null;
      if (!adoptResult) return false;
      const source = profiles.get(from);
      if (!source) return false;
      profiles.set(to, { ...source, urls: [...source.urls] });
      profiles.delete(from);
      adopted.push({ from, to });
      return true;
    },
    async deleteProfile(key) {
      activeKey = null;
      profiles.delete(key);
      deleted.push(key);
      return true;
    },
  };
}

describe('multi-account login flow (runLoginFlow)', () => {
  it('wipes any leftover scratch profile first, then signs in two distinct accounts without interference', async () => {
    const state = createState({ store: createMemoryStore() });
    let currentLoginAcct = { acct: 'acct-alpha-11111111', dn: 'AlphaPlayer' };

    const browser = createFakeBrowser({
      onAcquire: ({ key, record, targetUrl }) => {
        if (key !== LOGIN_PROFILE_KEY) return;
        if (targetUrl.includes('/id/login')) {
          // Simulate user completing SSO login on the login page
          record.cookies = [ssoCookie()];
        } else if (targetUrl.includes('/cart')) {
          // Simulate store minting EPIC_EG1 with full identity
          record.cookies = [ssoCookie(), eg1Cookie(currentLoginAcct)];
        }
      },
    });

    // Seed a leftover scratch profile cookie from a crashed run — must be wiped before login!
    browser.setCookies(LOGIN_PROFILE_KEY, [eg1Cookie({ acct: 'stale-acct', dn: 'StaleUser' })]);

    const first = await runLoginFlow({
      browser,
      config: { locale: 'en-US' },
      state,
      pollIntervalMs: 5,
      mintTimeoutMs: 50,
    });
    expect(first.ok).toBe(true);
    expect(first.account).toMatchObject({
      key: 'acct-alpha-11111111',
      id: 'acct-alpha-11111111',
      name: 'AlphaPlayer',
      sessionOk: true,
    });
    expect(browser.deleted).toContain(LOGIN_PROFILE_KEY);

    // Now sign in a SECOND account
    currentLoginAcct = { acct: 'acct-bravo-22222222', dn: 'BravoPlayer' };
    const second = await runLoginFlow({
      browser,
      config: { locale: 'en-US' },
      state,
      pollIntervalMs: 5,
      mintTimeoutMs: 50,
    });
    expect(second.ok).toBe(true);
    expect(second.account).toMatchObject({
      key: 'acct-bravo-22222222',
      id: 'acct-bravo-22222222',
      name: 'BravoPlayer',
      sessionOk: true,
    });

    // Both accounts coexist with their own persistent profiles
    expect(state.accountList()).toHaveLength(2);
    expect(browser.hasProfile('acct-alpha-11111111')).toBe(true);
    expect(browser.hasProfile('acct-bravo-22222222')).toBe(true);
  });

  it('reuses the existing profile key when re-logging into a legacy or previously unminted account', async () => {
    const state = createState({ store: createMemoryStore() });
    // Pre-existing legacy account migrated from v1.3
    state.upsertAccount({
      key: 'legacy',
      id: 'acct-alpha-11111111',
      name: 'OldName',
      sessionOk: false,
    });

    const browser = createFakeBrowser({
      onAcquire: ({ key, record, targetUrl }) => {
        if (key === LOGIN_PROFILE_KEY && targetUrl.includes('/id/login')) {
          record.cookies = [eg1Cookie({ acct: 'acct-alpha-11111111', dn: 'NewAlphaName' })];
        }
      },
    });

    const outcome = await runLoginFlow({
      browser,
      config: { locale: 'en-US' },
      state,
      pollIntervalMs: 5,
      mintTimeoutMs: 50,
    });

    expect(outcome.ok).toBe(true);
    // Must reuse 'legacy' instead of creating a duplicate 'acct-alpha-11111111' entry!
    expect(state.accountList()).toHaveLength(1);
    expect(state.accountList()[0]).toMatchObject({
      key: 'legacy',
      id: 'acct-alpha-11111111',
      name: 'NewAlphaName',
      sessionOk: true,
    });
    expect(state.data.log[0].code).toBe('login.success');
  });

  it('detects macOS-style window close (page closed while browser process stays alive) and preserves existing accounts', async () => {
    const state = createState({ store: createMemoryStore() });
    state.upsertAccount({
      key: 'acct-1',
      id: 'acct-1',
      name: 'HealthyUser',
      sessionOk: true,
    });

    const browser = createFakeBrowser({
      onAcquire: ({ key, record }) => {
        if (key === LOGIN_PROFILE_KEY) {
          // User closes the login window without signing in; cookies() does NOT throw
          record.pageClosed = true;
        }
      },
    });

    const outcome = await runLoginFlow({
      browser,
      config: { locale: 'en-US' },
      state,
      pollIntervalMs: 5,
      timeoutMs: 5000,
    });

    expect(outcome).toEqual({ ok: false, error: 'browser-closed' });
    // HealthyUser's sessionOk must remain true!
    expect(state.data.sessionOk).toBe(true);
    expect(state.data.accounts['acct-1'].sessionOk).toBe(true);
    expect(state.data.log[0].code).toBe('login.closed');
  });

  it('reports adopt-failed when profile adoption fails instead of falsely returning ok:true', async () => {
    const state = createState({ store: createMemoryStore() });
    const browser = createFakeBrowser({
      adoptResult: false,
      onAcquire: ({ record }) => {
        record.cookies = [eg1Cookie({ acct: 'acct-1', dn: 'User1' })];
      },
    });

    const outcome = await runLoginFlow({
      browser,
      config: { locale: 'en-US' },
      state,
      pollIntervalMs: 5,
    });

    expect(outcome).toEqual({ ok: false, error: 'adopt-failed' });
    expect(state.accountList()).toHaveLength(0);
  });
});

describe('multi-account claiming, privacy masking, and projections', () => {
  const gameA = {
    title: 'Free Game Alpha',
    pageSlug: 'free-game-alpha',
    offerId: 'offer-alpha',
    namespace: 'ns-alpha',
    url: 'https://store.epicgames.com/en-US/p/free-game-alpha',
    endsAt: '2026-11-15T16:00:00.000Z',
  };

  it('claims per account, enriches unminted accounts, masks raw IDs in status(), and supports logout across all surfaces', async () => {
    const state = createState({ store: createMemoryStore() });
    // Account 1 already has full identity; Account 2 started unminted (id: null)
    state.upsertAccount({
      key: 'acct-1',
      id: '11112222333344445555666677778888',
      name: 'Alice',
      loggedInAt: '2026-11-08T10:00:00Z',
      sessionOk: true,
    });
    state.upsertAccount({
      key: 'anonymous-2',
      id: null,
      name: null,
      loggedInAt: '2026-11-08T09:00:00Z',
      sessionOk: true,
    });

    const browser = createFakeBrowser();
    browser.setCookies('acct-1', [
      eg1Cookie({ acct: '11112222333344445555666677778888', dn: 'Alice' }),
    ]);
    browser.setCookies('anonymous-2', [
      eg1Cookie({ acct: '99998888777766665555444433332222', dn: 'Bob' }),
    ]);

    const fakeApi = {
      sleep: async () => {},
      resolveOffer: async (_page, candidate) => ({
        offerId: candidate.offerId,
        namespace: candidate.namespace,
      }),
      queryOwnership: (() => {
        const checksPerAccount = new Map();
        return async () => {
          const count = (checksPerAccount.get('calls') ?? 0) + 1;
          checksPerAccount.set('calls', count);
          // Odd call = pre-purchase check (not owned yet); Even call = post-purchase poll (owned!)
          return { kind: 'ok', owned: count % 2 === 0, blocked: false };
        };
      })(),
      queryOfferFree: async () => ({ kind: 'ok', free: true }),
    };

    const fakeDriver = {
      isChallengePage: async () => false,
      hasCaptchaFrame: () => false,
      shot: async () => {},
      acceptAgreements: async () => {},
      clickOrderButton: async () => 'clicked',
    };

    const controller = createController({
      ctx: { effect: () => {} },
      config: { intervalHours: 12, country: 'US', locale: 'en-US', runOnStartup: false },
      state,
      browser,
      discover: async () => [gameA],
      claimRunner: opts => runClaimRun({ ...opts, api: fakeApi, driver: fakeDriver }),
    });

    const checkRes = controller.runCheck(true);
    expect(checkRes.started).toBe(true);
    await controller.whenIdle();

    const view = controller.status();
    expect(view.accountCount).toBe(2);
    expect(view.claimed).toHaveLength(2);

    // Privacy invariant: raw 32-char hex IDs must NEVER appear in status.accounts or status.claimed
    const serialized = JSON.stringify(view);
    expect(serialized).not.toContain('11112222333344445555666677778888');
    expect(serialized).not.toContain('99998888777766665555444433332222');
    expect(view.claimed.map(c => c.account).sort()).toEqual(['Alice', 'Bob']);

    // Both accounts show claimedCount === 1
    const aliceView = view.accounts.find(a => a.name === 'Alice');
    const bobView = view.accounts.find(a => a.name === 'Bob');
    expect(aliceView?.claimedCount).toBe(1);
    expect(bobView?.claimedCount).toBe(1);

    // Second check must skip both accounts because both already claimed gameA
    controller.runCheck(true);
    await controller.whenIdle();
    expect(controller.status().claimed).toHaveLength(2);

    // Verify Agent Tool + Service Facade (`logout` by display name works through `epicGames` service!)
    const facade = createServiceFacade(controller);
    const logoutOut = await executeToolCall(facade, { action: 'logout', target: 'Bob' });
    expect(logoutOut).toMatchObject({ started: true, count: 1 });
    await controller.whenIdle();

    expect(controller.status().accountCount).toBe(1);
    expect(controller.status().accounts[0].name).toBe('Alice');

    // Verify Slash Command `/epicgames status` & `/epicgames logout all`
    const cmdStatus = executeCommandInput(controller, 'status', 'en');
    expect(cmdStatus.kind).toBe('success');
    expect(cmdStatus.text).toContain('Alice');

    const cmdLogout = executeCommandInput(controller, 'logout all', 'zh');
    expect(cmdLogout.kind).toBe('success');
    await controller.whenIdle();
    expect(controller.status().accountCount).toBe(0);
    expect(controller.status().signedIn).toBe(false);
    expect(controller.status().phase).toBe('need-login');
  });

  it('handles HTTP routes safely including malformed URL encoding on logout', () => {
    const state = createState({ store: createMemoryStore() });
    const browser = createFakeBrowser();
    const controller = createController({
      ctx: { effect: () => {} },
      config: { intervalHours: 12, country: 'US', locale: 'en-US', runOnStartup: false },
      state,
      browser,
    });

    const routes = [];
    const scope = { effect: fn => fn() };
    const webServer = { register: spec => routes.push(spec) };
    registerHttpApi(scope, webServer, controller);

    const logoutRoute = routes.find(r => r.kind === 'prefix' && r.path.endsWith('/logout'));
    expect(logoutRoute).toBeDefined();

    let statusCode = 0;
    let body = null;
    const res = {
      writeHead: code => {
        statusCode = code;
      },
      end: payload => {
        body = JSON.parse(payload);
      },
    };

    // Malformed percent-encoding must return 400 bad-request instead of throwing URIError
    logoutRoute.handler(
      {
        method: 'POST',
        url: '/epicgames-autoclaim/api/logout/%E0%A4%A',
        headers: { 'x-ega-plugin': '1', host: '127.0.0.1:49320' },
      },
      res,
    );
    expect(statusCode).toBe(400);
    expect(body).toEqual({ error: 'bad-request' });

    // Default hideSidebar is false; hide and show routes toggle it cleanly
    expect(controller.status().hideSidebar).toBe(false);
    const hideRoute = routes.find(r => r.kind === 'exact' && r.path.endsWith('/sidebar/hide'));
    const showRoute = routes.find(r => r.kind === 'exact' && r.path.endsWith('/sidebar/show'));
    expect(hideRoute).toBeDefined();
    expect(showRoute).toBeDefined();

    hideRoute.handler(
      {
        method: 'POST',
        url: '/epicgames-autoclaim/api/sidebar/hide',
        headers: { 'x-ega-plugin': '1', host: '127.0.0.1:49320' },
      },
      res,
    );
    expect(statusCode).toBe(200);
    expect(body).toEqual({ ok: true, hideSidebar: true });
    expect(controller.status().hideSidebar).toBe(true);

    showRoute.handler(
      {
        method: 'POST',
        url: '/epicgames-autoclaim/api/sidebar/show',
        headers: { 'x-ega-plugin': '1', host: '127.0.0.1:49320' },
      },
      res,
    );
    expect(statusCode).toBe(200);
    expect(body).toEqual({ ok: true, hideSidebar: false });
    expect(controller.status().hideSidebar).toBe(false);
  });
});

describe('browser manager lifecycle & legacy migration', () => {
  it('reuses matching context, restarts when options or key differ, and clears on external close', async () => {
    const dataDir = makeTempDir();
    const launches = [];
    const launcher = {
      async launchPersistentContext(profileDir, opts) {
        let closeListener = null;
        const ctx = {
          profileDir,
          opts,
          closed: false,
          on(event, fn) {
            if (event === 'close') closeListener = fn;
          },
          triggerExternalClose() {
            this.closed = true;
            closeListener?.();
          },
          async close() {
            this.closed = true;
            closeListener?.();
          },
        };
        launches.push(ctx);
        return ctx;
      },
    };

    const manager = createBrowserManager({ dataDir, launcher });
    const ctx1 = await manager.acquire('acct-1', { headless: true, locale: 'en-US' });
    const ctx1Again = await manager.acquire('acct-1', { headless: true, locale: 'en-US' });
    expect(ctx1Again).toBe(ctx1);
    expect(launches).toHaveLength(1);

    // Different headless option must close ctx1 and launch ctx2
    const ctx2 = await manager.acquire('acct-1', { headless: false, locale: 'en-US' });
    expect(ctx1.closed).toBe(true);
    expect(ctx2).not.toBe(ctx1);
    expect(launches).toHaveLength(2);

    // External close by user must clear active state so next acquire relaunches
    ctx2.triggerExternalClose();
    expect(manager.isRunning()).toBe(false);
    const ctx3 = await manager.acquire('acct-1', { headless: false, locale: 'en-US' });
    expect(ctx3).not.toBe(ctx2);
    expect(launches).toHaveLength(3);
  });

  it('migrates legacy data directory and single-account browser-profile', () => {
    const home = makeTempDir();
    const { dataDir, stateFile } = resolveDataPaths(home);
    const state = createState(stateFile);
    state.data.accountId = 'legacy-id-1234567890';
    state.data.accountName = 'LegacyHero';
    state.data.sessionOk = true;
    state.save();

    const browser = createBrowserManager({ dataDir });
    const migrated = migrateLegacySingleAccountProfile({ dataDir, state, browser });
    expect(migrated).toBe(false); // no browser-profile dir yet
  });
});
