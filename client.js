/**
 * Epic Games Store weekly free games — Client half.
 *
 * One page component renders in two surfaces: the left-sidebar panel (wide)
 * and the Settings entry (narrow); a `variant` prop tunes width and padding,
 * and the content grid reflows by itself. Actions call this package's Host
 * half through its own HTTP route on the same origin; when that transport is
 * unavailable (for example a Desktop file:// page), the page falls back to
 * telling the user to run the `/epicgames` slash command instead. Activity
 * entries arrive as `{code, params}` and render through the locale
 * dictionaries.
 */
window.__ModuleLoader__.load({
  id: 'dsh-epic-autoclaim',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'epicgamesAuto';

    const dictionaries = {
      zh: {
        nav: 'Epic 免费游戏',
        title: 'Epic 每周免费游戏',
        intro: '登录一次 Epic 账号后，插件会自动发现并领取每周免费游戏。领取完全在系统 Chrome 中进行，插件不接触你的密码。',
        signInOk: '已登录',
        signInNo: '未登录',
        signInUnknown: '会话待验证',
        signedInN: '已登录 {n} 个账号',
        loginBtn: '添加账号 / 登录',
        accountsTitle: '账号',
        accountClaims: '{n} 款',
        accountSessionBad: '会话失效',
        logoutBtn: '退出',
        accountsEmpty: '还没有账号：点击“添加账号 / 登录”。',
        loginWaiting: '等待登录…（在弹出的浏览器窗口中完成登录，最多等待 10 分钟）',
        checkBtn: '立即检查并领取',
        recheckBtn: '重新核对',
        recheckHint: '清除领取记录，按当前登录账号重新确认所有免费游戏的拥有状态',
        panel: 'Epic 免费游戏',
        running: '运行中',
        phaseDiscovery: '正在发现免费游戏…',
        phaseClaiming: '正在领取…',
        phaseNeedLogin: '需要登录：点击“登录 Epic”打开登录窗口',
        currentTitle: '本周免费',
        currentEmpty: '当前没有发现免费游戏',
        until: '截止',
        claimedTitle: '领取历史',
        claimedEmpty: '还没有领取记录',
        outcomeClaimed: '已领取',
        outcomeAlreadyOwned: '已在库中',
        outcomeFailed: '失败',
        outcomeError: '出错',
        outcomeSkipped: '跳过',
        logTitle: '动态',
        lastCheck: '上次检查',
        nextCheck: '下次检查',
        interval: '检查间隔',
        accountLabel: '账号',
        never: '从未',
        errorLabel: '最近错误',
        transportHint: '当前页面无法直连插件服务，请在聊天输入框使用命令：/epicgames login、/epicgames check、/epicgames status。',
        settingsHint: '检查间隔、国家/语言等参数可在 设置 → 插件 中配置。',
        'login.opening': '正在打开 Epic 登录窗口…',
        'login.closed': '登录窗口被关闭，本次登录未完成',
        'login.timeout': '等待登录超时（10 分钟），未检测到有效会话',
        'login.success': 'Epic 登录成功{name}',
        'login.crash': '登录流程异常：{message}',
        'session.expired': 'Epic 登录已失效，请重新登录（/epicgames login）',
        'account.changed': '检测到账号变更：领取记录按当前账号重新核对',
        'recheck.cleared': '重新核对：清除领取记录，按当前账号全量检查',
        'check.summary.manual': '检查（手动）：{accounts} 个账号，发现 {found} 款免费游戏，本次领取 {claimed} 款',
        'check.summary.auto': '检查（自动）：{accounts} 个账号，发现 {found} 款免费游戏，本次领取 {claimed} 款',
        'check.failed': '检查失败：{message}',
        'claim.claimed': '已领取：{title}（{account}）',
        'claim.failed': '领取失败：{title}（{account}，{reason}）',
        'claim.error': '领取异常：{title}：{message}',
        'browser.launch-error': '无法启动浏览器：{message}',
        'challenge.blocked': '商店页面被反机器人验证拦截：请在插件配置中切换 claimHeadless（有头/无头）后重试',
        'captcha.assist': '需要人机验证：请在弹出的浏览器窗口中完成验证，插件会自动继续',
        'api.fingerprint': 'Epic 接口指纹已变更（PersistedQuery 失效），请更新插件',
        'account.added': '已添加账号{name}',
        'account.removed': '已退出账号：{name}',
        'logout.error': '退出账号失败：{message}',
        'session.expired': '{account} 的登录已失效，请重新登录（/epicgames login）',
      },
      en: {
        nav: 'Epic free games',
        title: 'Epic weekly free games',
        intro: 'Sign in to Epic once; the plugin then discovers and claims the weekly free games automatically. Claims run in system Chrome — the plugin never sees your password.',
        signInOk: 'Signed in',
        signInNo: 'Not signed in',
        signInUnknown: 'Session unverified',
        signedInN: '{n} account(s) signed in',
        loginBtn: 'Add account / Sign in',
        accountsTitle: 'Accounts',
        accountClaims: '{n} claimed',
        accountSessionBad: 'session expired',
        logoutBtn: 'Sign out',
        accountsEmpty: 'No accounts yet: click "Add account / Sign in".',
        loginWaiting: 'Waiting for sign-in… (complete it in the browser window; up to 10 minutes)',
        checkBtn: 'Check and claim now',
        recheckBtn: 'Re-verify library',
        recheckHint: 'Clear claim records and re-verify ownership of every free game for the signed-in account',
        panel: 'Epic free games',
        running: 'running',
        phaseDiscovery: 'Discovering free games…',
        phaseClaiming: 'Claiming…',
        phaseNeedLogin: 'Sign-in required: click "Sign in to Epic" to open the login window',
        currentTitle: 'Free this week',
        currentEmpty: 'No free games found right now',
        until: 'until',
        claimedTitle: 'Claim history',
        claimedEmpty: 'Nothing claimed yet',
        outcomeClaimed: 'claimed',
        outcomeAlreadyOwned: 'already in library',
        outcomeFailed: 'failed',
        outcomeError: 'error',
        outcomeSkipped: 'skipped',
        logTitle: 'Activity',
        lastCheck: 'Last check',
        nextCheck: 'Next check',
        interval: 'Interval',
        accountLabel: 'Account',
        never: 'never',
        errorLabel: 'Last error',
        transportHint: 'This page cannot reach the plugin service here; use the chat commands instead: /epicgames login, /epicgames check, /epicgames status.',
        settingsHint: 'Interval, country, and locale are configurable in Settings → Plugins.',
        'login.opening': 'Opening the Epic sign-in window…',
        'login.closed': 'The sign-in window was closed before login completed',
        'login.timeout': 'Timed out waiting for sign-in (10 minutes)',
        'login.success': 'Signed in to Epic{name}',
        'login.crash': 'Login flow crashed: {message}',
        'session.expired': 'Epic session expired; sign in again (/epicgames login)',
        'account.changed': 'Account changed: claim records re-audited for the signed-in account',
        'recheck.cleared': 'Re-verify: claim records cleared for a full audit',
        'check.summary.manual': 'Check (manual): {accounts} account(s), {found} free game(s) found, {claimed} claimed',
        'check.summary.auto': 'Check (auto): {accounts} account(s), {found} free game(s) found, {claimed} claimed',
        'check.failed': 'Check failed: {message}',
        'claim.claimed': 'Claimed: {title} ({account})',
        'claim.failed': 'Claim failed: {title} ({account}, {reason})',
        'claim.error': 'Claim error: {title}: {message}',
        'browser.launch-error': 'Browser launch failed: {message}',
        'challenge.blocked': 'A bot check blocked the store page; toggle claimHeadless in the plugin config and retry',
        'captcha.assist': 'Human verification needed: solve it in the browser window; the plugin continues automatically',
        'api.fingerprint': 'Epic API fingerprint changed (stale persisted query); update the plugin',
        'account.added': 'Account added{name}',
        'account.removed': 'Signed out: {name}',
        'logout.error': 'Sign-out failed: {message}',
        'session.expired': "{account}'s session expired; sign in again (/epicgames login)",
      },
    };

    // 4pt scale: 4 / 8 / 12 / 16 / 20 / 24 / 32. Page rhythm: 16 between
    // regions, 12 inside cards, 10 between list rows, 6 between log lines.
    const CSS = `
.ega_page{display:flex;flex-direction:column;gap:16px;max-width:680px;color:var(--dsw-alias-label-primary)}
.ega_wide{max-width:1040px;padding:24px 28px 40px}
.ega_title{margin:0;font-size:18px;font-weight:600;line-height:26px;letter-spacing:-0.01em}
.ega_intro{margin:4px 0 0;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.ega_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:14px;padding:16px;display:flex;flex-direction:column;gap:12px}
.ega_cardTitle{margin:0;font-size:13px;font-weight:600;line-height:18px;display:flex;align-items:baseline;gap:8px}
.ega_count{font-size:12px;font-weight:400;color:var(--dsw-alias-label-secondary)}
.ega_grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.ega_statusRow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ega_state{display:inline-flex;align-items:center;gap:8px;font-size:14px;font-weight:500;line-height:20px}
.ega_dot{width:8px;height:8px;border-radius:50%;background:var(--dsw-alias-state-idle-primary);flex:none}
.ega_dotOk{background:var(--dsw-alias-state-success-primary)}
.ega_dotBad{background:var(--dsw-alias-state-error-primary)}
.ega_account{font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.ega_actions{margin-left:auto;display:inline-flex;gap:8px;flex-wrap:wrap}
.ega_meta{display:flex;align-items:baseline;gap:6px;flex-wrap:wrap;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ega_metaValue{color:var(--dsw-alias-label-primary)}
.ega_sep{opacity:.45}
.ega_warn{margin:0;font-size:12px;line-height:18px;white-space:pre-wrap;color:var(--dsw-alias-state-warn-primary)}
.ega_bad{color:var(--dsw-alias-state-error-primary)}
.ega_list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.ega_game{display:flex;gap:12px;align-items:center}
.ega_cover{width:88px;height:50px;border-radius:8px;object-fit:cover;background:var(--dsw-alias-bg-layer-2);flex:none;display:block}
.ega_monogram{width:88px;height:50px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:600;flex:none}
.ega_gameBody{display:flex;flex-direction:column;gap:2px;min-width:0}
.ega_gameTitle{color:var(--dsw-alias-label-primary);font-size:13px;font-weight:500;line-height:18px;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ega_gameTitle:hover{text-decoration:underline}
.ega_gameMeta{font-size:12px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.ega_claim{display:flex;gap:10px;align-items:center;min-width:0}
.ega_thumb{width:36px;height:36px;border-radius:8px;object-fit:cover;background:var(--dsw-alias-bg-layer-2);flex:none;display:block}
.ega_monogramSm{width:36px;height:36px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;flex:none}
.ega_claimBody{display:flex;flex-direction:column;gap:1px;min-width:0}
.ega_claimTime{font-size:11px;line-height:14px;color:var(--dsw-alias-label-secondary)}
.ega_tag{margin-left:auto;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:1px 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary);flex:none}
.ega_tagClaimed{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.ega_tagFailed{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.ega_log{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ega_logTime{margin-right:6px;opacity:.7}
.ega_empty{margin:0;padding:20px 4px;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.ega_foot{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ega_button{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;height:32px;padding:0 14px;font:inherit;font-size:13px;cursor:pointer}
.ega_button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.ega_button:disabled{opacity:.5;cursor:default}
.ega_button:focus-visible,.ega_gameTitle:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px;border-radius:8px}
.ega_primary{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);font-weight:500}
.ega_primary:hover:not(:disabled){background:var(--dsw-alias-bg-overlay)}
`;

    function formatTime(value, t) {
      if (!value) return t('never');
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? t('never') : date.toLocaleString();
    }

    /** Localize a `{code, params}` activity entry; legacy raw text falls through. */
    function renderEvent(t, entry) {
      const template = entry.code ? t(entry.code) : null;
      if (typeof template !== 'string' || template === entry.code) return entry.text ?? entry.code ?? '';
      return template.replace(/\{(\w+)\}/g, (_, key) => String(entry.params?.[key] ?? ''));
    }

    function Cover({ image, title, small }) {
      if (image) {
        return h('img', {
          src: image,
          alt: '',
          loading: 'lazy',
          className: small ? 'ega_thumb' : 'ega_cover',
        });
      }
      return h('span', {
        className: small ? 'ega_monogramSm' : 'ega_monogram',
        'aria-hidden': true,
      }, (title ?? '?').slice(0, 1).toUpperCase());
    }

    function StatusCard({ t, status, transportOk, busy, onLogin, onCheck, onRecheck }) {
      const accounts = status?.accounts ?? [];
      const signedIn = status?.signedIn === true;
      const phase = status?.phase ?? '';
      const phaseText = phase === 'discovery'
        ? t('phaseDiscovery')
        : phase === 'claiming'
          ? t('phaseClaiming')
          : phase === 'login-waiting'
            ? t('loginWaiting')
            : phase === 'need-login'
              ? t('phaseNeedLogin')
              : null;
      const stateText = signedIn
        ? (accounts.length > 1 ? t('signedInN').replace('{n}', String(accounts.length)) : t('signInOk'))
        : (status == null ? t('signInUnknown') : t('signInNo'));
      const meta = (label, value, key) => h('span', { key },
        h('span', null, `${label} `),
        h('span', { className: 'ega_metaValue' }, value));

      return h('div', { className: 'ega_card' },
        h('div', { className: 'ega_statusRow' },
          h('span', { className: 'ega_state' },
            h('span', { className: `ega_dot ${signedIn ? 'ega_dotOk' : 'ega_dotBad'}` }),
            stateText,
            accounts.length === 1 && accounts[0].name
              ? h('span', { className: 'ega_account' }, accounts[0].name)
              : null),
          h('span', { className: 'ega_actions' },
            h('button', {
              className: 'ega_button ega_primary',
              disabled: busy || status?.running || !transportOk,
              onClick: onLogin,
            }, t('loginBtn')),
            h('button', {
              className: 'ega_button',
              disabled: busy || status?.running || !transportOk,
              onClick: onCheck,
            }, status?.running ? `${t('checkBtn')} · ${t('running')}` : t('checkBtn')),
            h('button', {
              className: 'ega_button',
              disabled: busy || status?.running || !transportOk,
              title: t('recheckHint'),
              onClick: onRecheck,
            }, t('recheckBtn')))),
        phaseText ? h('p', { className: 'ega_warn' }, phaseText) : null,
        h('div', { className: 'ega_meta' },
          meta(t('lastCheck'), formatTime(status?.lastCheckAt, t), 'last'),
          h('span', { className: 'ega_sep', 'aria-hidden': true }, '·'),
          meta(t('nextCheck'), formatTime(status?.nextRunAt, t), 'next'),
          h('span', { className: 'ega_sep', 'aria-hidden': true }, '·'),
          meta(t('interval'), `${status?.intervalHours ?? '—'}h`, 'interval')),
        status?.lastError
          ? h('p', { className: 'ega_warn' }, `${t('errorLabel')}: ${status.lastError}`)
          : null,
        transportOk ? null : h('p', { className: 'ega_warn' }, t('transportHint')));
    }

    function Page({ t, variant }) {
      const [status, setStatus] = React.useState(null);
      const [transportOk, setTransportOk] = React.useState(true);
      const [busy, setBusy] = React.useState(false);

      const statusRef = React.useRef(null);
      statusRef.current = status;

      const fetchStatus = React.useCallback(async () => {
        try {
          const response = await fetch('/epic-autoclaim/api/status', {
            headers: { accept: 'application/json', 'x-ega-plugin': '1' },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setStatus(await response.json());
          setTransportOk(true);
          return true;
        } catch {
          setTransportOk(false);
          return false;
        }
      }, []);

      React.useEffect(() => {
        let stopped = false;
        let timer = null;
        let delay = 3000;
        const tick = async () => {
          if (stopped) return;
          if (document.visibilityState === 'hidden') {
            timer = setTimeout(tick, 10_000);
            return;
          }
          const ok = await fetchStatus();
          delay = ok
            ? (statusRef.current?.running ? 2500 : 12_000)
            : Math.min(delay * 2, 30_000);
          if (!stopped) timer = setTimeout(tick, delay);
        };
        void tick();
        const onVisible = () => {
          if (document.visibilityState === 'visible' && !stopped) {
            clearTimeout(timer);
            void tick();
          }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
          stopped = true;
          clearTimeout(timer);
          document.removeEventListener('visibilitychange', onVisible);
        };
      }, [fetchStatus]);

      const post = React.useCallback(async path => {
        setBusy(true);
        try {
          const response = await fetch(path, {
            method: 'POST',
            headers: { 'x-ega-plugin': '1' },
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setTransportOk(true);
        } catch {
          setTransportOk(false);
        } finally {
          setBusy(false);
          await fetchStatus();
        }
      }, [fetchStatus]);

      const current = status?.current ?? [];
      const claimed = status?.claimed ?? [];
      const accounts = status?.accounts ?? [];
      const log = (status?.log ?? []).slice(0, 8);

      return h('div', { className: `ega_page${variant === 'panel' ? ' ega_wide' : ''}` },
        h('style', null, CSS),
        h('header', null,
          h('h2', { className: 'ega_title' }, t('title')),
          h('p', { className: 'ega_intro' }, t('intro'))),
        h(StatusCard, {
          t,
          status,
          transportOk,
          busy,
          onLogin: () => {
            void post('/epic-autoclaim/api/login');
          },
          onCheck: () => {
            void post('/epic-autoclaim/api/check');
          },
          onRecheck: () => {
            void post('/epic-autoclaim/api/recheck');
          },
        }),
        h('div', { className: 'ega_card' },
          h('h3', { className: 'ega_cardTitle' },
            t('accountsTitle'),
            h('span', { className: 'ega_count' }, String(accounts.length))),
          accounts.length === 0
            ? h('p', { className: 'ega_empty' }, t('accountsEmpty'))
            : h('ul', { className: 'ega_list' },
              accounts.map(account => h('li', {
                key: account.key,
                className: 'ega_claim',
              },
                h('span', {
                  className: `ega_dot ${account.sessionOk === false ? 'ega_dotBad' : 'ega_dotOk'}`,
                  style: { width: 8, height: 8 },
                  title: account.sessionOk === false ? t('accountSessionBad') : undefined,
                }),
                h('div', { className: 'ega_claimBody' },
                  h('span', { className: 'ega_gameTitle' }, account.name ?? account.id ?? account.key),
                  h('span', { className: 'ega_claimTime' },
                    `${account.id ?? ''}${account.id ? ' · ' : ''}${
                      t('accountClaims').replace('{n}', String(account.claimedCount ?? 0))}`)),
                h('button', {
                  className: 'ega_button',
                  style: { height: 26, padding: '0 10px', fontSize: 12, marginLeft: 'auto' },
                  disabled: busy || status?.running || !transportOk,
                  onClick: () => {
                    void post(`/epic-autoclaim/api/logout/${encodeURIComponent(account.key)}`);
                  },
                }, t('logoutBtn')))))),
        h('div', { className: 'ega_grid' },
          h('div', { className: 'ega_card' },
            h('h3', { className: 'ega_cardTitle' },
              t('currentTitle'),
              h('span', { className: 'ega_count' }, String(current.length))),
            current.length === 0
              ? h('p', { className: 'ega_empty' }, t('currentEmpty'))
              : h('ul', { className: 'ega_list' },
                current.map(game => h('li', {
                  key: game.pageSlug ?? game.title,
                  className: 'ega_game',
                },
                  h(Cover, { image: game.image, title: game.title }),
                  h('div', { className: 'ega_gameBody' },
                    h('a', {
                      className: 'ega_gameTitle',
                      href: game.url ?? '#',
                      target: '_blank',
                      rel: 'noreferrer noopener',
                      title: game.title,
                    }, game.title),
                    game.endsAt
                      ? h('span', { className: 'ega_gameMeta' }, `${t('until')} ${formatTime(game.endsAt, t)}`)
                      : null))))),
          h('div', { className: 'ega_card' },
            h('h3', { className: 'ega_cardTitle' },
              t('claimedTitle'),
              h('span', { className: 'ega_count' }, String(claimed.length))),
            claimed.length === 0
              ? h('p', { className: 'ega_empty' }, t('claimedEmpty'))
              : h('ul', { className: 'ega_list' },
                claimed.map((entry, index) => h('li', {
                  key: `${entry.claimedAt}-${entry.pageSlug}-${index}`,
                  className: 'ega_claim',
                },
                  h(Cover, { image: entry.image, title: entry.title, small: true }),
                  h('div', { className: 'ega_claimBody' },
                    h('span', { className: 'ega_gameTitle' }, entry.title),
                    h('span', { className: 'ega_claimTime' },
                      `${entry.account ?? ''}${entry.account ? ' · ' : ''}${formatTime(entry.claimedAt, t)}`)),
                  h('span', {
                    className: entry.outcome === 'claimed' ? 'ega_tag ega_tagClaimed'
                      : (entry.outcome === 'failed' || entry.outcome === 'error') ? 'ega_tag ega_tagFailed' : 'ega_tag',
                  }, entry.outcome === 'claimed' ? t('outcomeClaimed')
                    : entry.outcome === 'already-owned' ? t('outcomeAlreadyOwned')
                      : entry.outcome === 'failed' ? t('outcomeFailed')
                        : entry.outcome === 'error' ? t('outcomeError') : t('outcomeSkipped')))))),
        h('div', { className: 'ega_card' },
          h('h3', { className: 'ega_cardTitle' }, t('logTitle')),
          h('ul', { className: 'ega_log' },
            log.map((entry, index) => h('li', {
              key: `${entry.at}-${index}`,
              className: entry.level === 'error' ? 'ega_bad' : entry.level === 'warn' ? 'ega_warn' : null,
            },
              h('span', { className: 'ega_logTime' }, formatTime(entry.at, t)),
              renderEvent(t, entry)))))),
        h('p', { className: 'ega_foot' }, t('settingsHint')));
    }

    /** Left-rail icon: gift box with a play cut, tinted by the shell. */
    function PanelIcon({ size = 24 }) {
      return h('svg', {
        viewBox: '0 0 24 24',
        width: size,
        height: size,
        'aria-hidden': true,
        style: { display: 'block' },
      },
      h('path', {
        fill: 'currentColor',
        fillRule: 'evenodd',
        d: 'M4.5 6.5h15a1 1 0 0 1 1 1V10a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V7.5a1 1 0 0 1 1-1z'
          + ' M6 12.5h12a1 1 0 0 1 1 1V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-5.5a1 1 0 0 1 1-1z'
          + ' M10.7 14.7v3.6l3.3-1.8-3.3-1.8z',
      }));
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'epic-autoclaim: locale');
        const t = ctx.locale.bind(NS);

        // Central panel behind the left-rail entry (the shell's layout
        // service selects it when the icon is clicked).
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'epicgames',
          locale: NS,
          inject: () => ({ t, variant: 'panel' }),
        }, Page));

        // The left-sidebar entry itself.
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'epicgames',
          order: 10,
          label: () => t('panel'),
          locale: NS,
        }, PanelIcon));

        // Also reachable from Settings (narrow surface).
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'epic-autoclaim',
          order: 25,
          label: () => t('nav'),
          inject: () => ({ t }),
        }, Page));
      },
    };
  },
});
