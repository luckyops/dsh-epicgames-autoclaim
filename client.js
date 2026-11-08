/**
 * Epic Games Store weekly free games — Client half.
 *
 * Registers one page in the Web GUI's Settings panel: sign-in state, the
 * current free games, claim history, and the sign-in / check / re-verify
 * actions. Actions call this package's Host half through its own HTTP route
 * on the same origin; when that transport is unavailable (for example a
 * Desktop file:// page), the page falls back to telling the user to run the
 * `/epicgames` slash command instead. Activity-log entries arrive as
 * `{code, params}` and render through the locale dictionaries.
 */
window.__ModuleLoader__.load({
  id: 'dsh-plugin-epicgames-auto',
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
        loginBtn: '登录 Epic',
        loginWaiting: '等待登录…（在弹出的浏览器窗口中完成登录，最多等待 10 分钟）',
        checkBtn: '立即检查并领取',
        recheckBtn: '重新核对',
        recheckHint: '清除领取记录，按当前登录账号重新确认所有免费游戏的拥有状态',
        panel: 'Epic 免费游戏',
        running: '运行中',
        phaseDiscovery: '正在发现免费游戏…',
        phaseClaiming: '正在领取…',
        phaseNeedLogin: '需要登录：点击“登录 Epic”打开登录窗口',
        currentTitle: '本周免费游戏',
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
        'check.summary.manual': '检查（手动）：发现 {found} 款免费游戏，本次领取 {claimed} 款',
        'check.summary.auto': '检查（自动）：发现 {found} 款免费游戏，本次领取 {claimed} 款',
        'check.failed': '检查失败：{message}',
        'claim.claimed': '已领取：{title}',
        'claim.failed': '领取失败：{title}（{reason}）',
        'claim.error': '领取异常：{title}：{message}',
        'browser.launch-error': '无法启动浏览器：{message}',
        'challenge.blocked': '商店页面被反机器人验证拦截：请在插件配置中切换 claimHeadless（有头/无头）后重试',
        'captcha.assist': '需要人机验证：请在弹出的浏览器窗口中完成验证，插件会自动继续',
        'api.fingerprint': 'Epic 接口指纹已变更（PersistedQuery 失效），请更新插件',
      },
      en: {
        nav: 'Epic free games',
        title: 'Epic weekly free games',
        intro: 'Sign in to Epic once; the plugin then discovers and claims the weekly free games automatically. Claims run in system Chrome — the plugin never sees your password.',
        signInOk: 'Signed in',
        signInNo: 'Not signed in',
        signInUnknown: 'Session unverified',
        loginBtn: 'Sign in to Epic',
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
        'check.summary.manual': 'Check (manual): {found} free game(s) found, {claimed} claimed',
        'check.summary.auto': 'Check (auto): {found} free game(s) found, {claimed} claimed',
        'check.failed': 'Check failed: {message}',
        'claim.claimed': 'Claimed: {title}',
        'claim.failed': 'Claim failed: {title} ({reason})',
        'claim.error': 'Claim error: {title}: {message}',
        'browser.launch-error': 'Browser launch failed: {message}',
        'challenge.blocked': 'A bot check blocked the store page; toggle claimHeadless in the plugin config and retry',
        'captcha.assist': 'Human verification needed: solve it in the browser window; the plugin continues automatically',
        'api.fingerprint': 'Epic API fingerprint changed (stale persisted query); update the plugin',
      },
    };

    const CSS = `
.ega_section{max-width:720px;color:var(--dsw-alias-label-primary);display:flex;flex-direction:column;gap:12px}
.ega_title{margin:0;font-size:16px;font-weight:500;line-height:24px;color:var(--dsw-alias-label-primary)}
.ega_intro{margin:0;font-size:14px;line-height:22px;color:var(--dsw-alias-label-secondary)}
.ega_card{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-1);border-radius:12px;padding:12px 14px;display:flex;flex-direction:column;gap:10px}
.ega_cardTitle{margin:0;font-size:14px;font-weight:500;line-height:20px;color:var(--dsw-alias-label-primary)}
.ega_row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px;line-height:20px;color:var(--dsw-alias-label-secondary)}
.ega_rowValue{color:var(--dsw-alias-label-primary)}
.ega_ok{color:var(--dsw-alias-state-success-primary)}
.ega_bad{color:var(--dsw-alias-state-error-primary)}
.ega_warn{color:var(--dsw-alias-state-warn-primary);margin:0;font-size:12px;line-height:18px;white-space:pre-wrap}
.ega_button{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:8px;height:32px;padding:0 14px;font:inherit;font-size:13px;cursor:pointer}
.ega_button:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2)}
.ega_button:disabled{opacity:.5;cursor:default}
.ega_primary{background:var(--dsw-alias-brand-primary);border-color:transparent;color:#fff}
.ega_primary:hover:not(:disabled){background:var(--dsw-alias-brand-primary);opacity:.9}
.ega_list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.ega_item{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;font-size:13px;line-height:20px}
.ega_itemTitle{color:var(--dsw-alias-label-primary);font-weight:500;text-decoration:none}
.ega_itemTitle:hover{text-decoration:underline}
.ega_itemMeta{color:var(--dsw-alias-label-secondary)}
.ega_tag{border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:0 6px;font-size:11px;line-height:16px;color:var(--dsw-alias-label-secondary)}
.ega_tagClaimed{color:var(--dsw-alias-state-success-primary);border-color:var(--dsw-alias-state-success-primary)}
.ega_tagFailed{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.ega_log{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px;font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}
.ega_logTime{margin-right:6px;opacity:.7}
`;

    function formatTime(value, t) {
      if (!value) return t('never');
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? t('never') : date.toLocaleString();
    }

    function StatusCard({ t, status, transportOk, busy, onLogin, onCheck, onRecheck }) {
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
      return h('div', { className: 'ega_card' },
        h('div', { className: 'ega_row' },
          h('span', null,
            h('span', { className: signedIn ? 'ega_ok' : 'ega_bad' }, '● '),
            h('span', { className: 'ega_rowValue' },
              signedIn ? t('signInOk') : (status == null ? t('signInUnknown') : t('signInNo'))),
            status?.accountName ? h('span', null, ` · ${t('accountLabel')}: ${status.accountName}`) : null),
          h('span', { style: { marginLeft: 'auto', display: 'inline-flex', gap: 8 } },
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
        h('div', { className: 'ega_row' },
          h('span', null, `${t('lastCheck')}: `, h('span', { className: 'ega_rowValue' }, formatTime(status?.lastCheckAt, t))),
          h('span', null, `${t('nextCheck')}: `, h('span', { className: 'ega_rowValue' }, formatTime(status?.nextRunAt, t)))),
        status?.lastError
          ? h('p', { className: 'ega_warn' }, `${t('errorLabel')}: ${status.lastError}`)
          : null,
        transportOk ? null : h('p', { className: 'ega_warn' }, t('transportHint')));
    }

    function Page({ t }) {
      const [status, setStatus] = React.useState(null);
      const [transportOk, setTransportOk] = React.useState(true);
      const [busy, setBusy] = React.useState(false);

      const fetchStatus = React.useCallback(async () => {
        try {
          const response = await fetch('/epicgames-auto/api/status', {
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

      const statusRef = React.useRef(null);
      statusRef.current = status;

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
      const log = (status?.log ?? []).slice(0, 8);

      return h('div', { className: 'ega_section' },
        h('style', null, CSS),
        h('h2', { className: 'ega_title' }, t('title')),
        h('p', { className: 'ega_intro' }, t('intro')),
        h(StatusCard, {
          t,
          status,
          transportOk,
          busy,
          onLogin: () => {
            void post('/epicgames-auto/api/login');
          },
          onCheck: () => {
            void post('/epicgames-auto/api/check');
          },
          onRecheck: () => {
            void post('/epicgames-auto/api/recheck');
          },
        }),
        h('div', { className: 'ega_card' },
          h('h3', { className: 'ega_cardTitle' }, t('currentTitle')),
          current.length === 0
            ? h('p', { className: 'ega_intro' }, t('currentEmpty'))
            : h('ul', { className: 'ega_list' },
              current.map(game => h('li', { key: game.pageSlug ?? game.title, className: 'ega_item' },
                h('a', {
                  className: 'ega_itemTitle',
                  href: game.url ?? '#',
                  target: '_blank',
                  rel: 'noreferrer noopener',
                }, game.title),
                game.endsAt
                  ? h('span', { className: 'ega_itemMeta' }, `${t('until')} ${formatTime(game.endsAt, t)}`)
                  : null)))),
        h('div', { className: 'ega_card' },
          h('h3', { className: 'ega_cardTitle' }, t('claimedTitle')),
          claimed.length === 0
            ? h('p', { className: 'ega_intro' }, t('claimedEmpty'))
            : h('ul', { className: 'ega_list' },
              claimed.map((entry, index) => h('li', {
                key: `${entry.claimedAt}-${entry.pageSlug}-${index}`,
                className: 'ega_item',
              },
                h('span', { className: 'ega_itemTitle' }, entry.title),
                h('span', {
                  className: entry.outcome === 'claimed' ? 'ega_tag ega_tagClaimed'
                    : (entry.outcome === 'failed' || entry.outcome === 'error') ? 'ega_tag ega_tagFailed' : 'ega_tag',
                }, entry.outcome === 'claimed' ? t('outcomeClaimed')
                  : entry.outcome === 'already-owned' ? t('outcomeAlreadyOwned')
                    : entry.outcome === 'failed' ? t('outcomeFailed')
                      : entry.outcome === 'error' ? t('outcomeError') : t('outcomeSkipped')),
                h('span', { className: 'ega_itemMeta' }, formatTime(entry.claimedAt, t)))))),
        h('div', { className: 'ega_card' },
          h('h3', { className: 'ega_cardTitle' }, t('logTitle')),
          h('ul', { className: 'ega_log' },
            log.map((entry, index) => h('li', {
              key: `${entry.at}-${index}`,
              className: entry.level === 'error' ? 'ega_bad' : entry.level === 'warn' ? 'ega_warn' : null,
            },
              h('span', { className: 'ega_logTime' }, formatTime(entry.at, t)),
              renderEvent(t, entry))))),
        h('p', { className: 'ega_intro' }, t('settingsHint')));
    }

    /** Localize a `{code, params}` activity entry; legacy raw text falls through. */
    function renderEvent(t, entry) {
      const template = entry.code ? t(entry.code) : null;
      if (typeof template !== 'string' || template === entry.code) return entry.text ?? entry.code ?? '';
      return template.replace(/\{(\w+)\}/g, (_, key) => String(entry.params?.[key] ?? ''));
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
        ctx.effect(() => ctx.locale.register(NS, dictionaries), 'epicgames-auto: locale');
        const t = ctx.locale.bind(NS);

        // Central panel behind the left-rail entry (the shell's layout
        // service selects it when the icon is clicked).
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main',
          key: 'epicgames',
          locale: NS,
          inject: () => ({ t }),
        }, Page));

        // The left-sidebar entry itself.
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist',
          id: 'epicgames',
          order: 10,
          label: () => t('panel'),
          locale: NS,
        }, PanelIcon));

        // Also reachable from Settings.
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: 'epicgames-auto',
          order: 25,
          label: () => t('nav'),
          inject: () => ({ t }),
        }, Page));
      },
    };
  },
});
