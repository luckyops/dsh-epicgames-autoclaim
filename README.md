# dsh-plugin-epicgames-auto

English | [中文](#中文)

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that automatically
claims the **Epic Games Store weekly free games**. You sign in once in a real browser window;
afterwards the plugin discovers each week's free games on a schedule and claims them into your
Epic library — no notifications to click, no checkout links to open.

## How it works

- **Sign-in (once):** the plugin launches a dedicated, persistent Chromium profile (system
  Chrome by default) on the Epic login page. You complete the login yourself — including 2FA or
  any captcha — and the plugin never sees your credentials. The session cookie lives in
  `$DSH_HOME/data/epicgames-auto/browser-profile` and is reused for months.
- **Ownership confirmation:** before every purchase the plugin asks Epic's entitlement API whether
  the signed-in account already owns the offer (`already-owned` entries), and after every purchase
  it polls the same API until the game appears in the library — a claim is only recorded once Epic
  itself confirms ownership. Claim records are keyed by account id (read from the session), so
  signing in as a different account automatically re-audits the whole rotation, and
  **Re-verify library** (`/epicgames recheck`) forces that audit any time.
- **Rotation-aware scheduling:** the current batch's end time is the next rotation; the plugin
  checks again ~20 minutes after it, so new free games are claimed within minutes of going live.
  Failed claims (e.g. an unsolved captcha) retry within an hour.
- **Discovery:** a plain HTTP call to Epic's static promotions endpoint (no browser, no login)
  finds the current "free now" titles, so scheduled checks cost almost nothing.
- **Claiming:** only when unclaimed games exist, the plugin opens the store in its profile
  (headless or visible — configurable), resolves the real weekly offer, verifies it is free and
  not already owned, walks the `$0` purchase page, and confirms success through the account's
  entitlements. Failures are retried on the next scheduled check, with screenshots under
  `$DSH_HOME/data/epicgames-auto/errors/` for diagnosis.

## Install

From a local checkout of this repository:

```
plugin_manager install_bundle /absolute/path/to/dsh-plugin-epicgames-auto
```

Or install from a plugin-market index once the package is published there.

## First run

1. Open **Settings → Epic free games** and click **Sign in to Epic** (or run `/epicgames login`
   in the chat box). A Chrome window opens on Epic's login page.
2. Sign in and finish any verification. The window closes itself once the session is detected.
3. That's it. Use **Check and claim now** to test immediately, or wait for the scheduler.

## Usage

- **Settings page:** sign-in state, this week's free games, claim history, activity log, and the
  sign-in / check-now actions.
- **Slash commands:** `/epicgames status` · `/epicgames login` · `/epicgames check`.
- **Agent tool (optional):** add the row below to your agent preset (Settings → agent preset
  editor, or your profile patch) so sessions can call `epicgames_free_games`:

  ```yaml
  - id: epicgames-auto-tool
    name: dsh-plugin-epicgames-auto/tool
  ```

  Host-mounted tools never enter agent toolsets in DSH — the preset row mounts the tool, which
  calls back into the host-plane `epicGames` service.

## Configuration (Settings → Plugins)

| Field | Default | Meaning |
|---|---|---|
| `intervalHours` | `12` | Hours between automatic checks. |
| `country` | `US` | Store country used for discovery (`US`, `CN`, `DE`, …). |
| `locale` | `en-US` | Store locale for discovery and claim pages. |
| `loginLang` | *(empty)* | Login window language (the human verification follows it); empty follows `locale`. Chinese users usually set `zh-CN`. |
| `claimHeadless` | `false` | Claim without a visible browser window. Turn on only if your account never hits bot checks. |
| `executablePath` | *(empty)* | Full path to a Chromium-based browser executable; empty = system Chrome / Edge auto-detect. |
| `runOnStartup` | `true` | Run one check shortly after the Host starts. |

## Troubleshooting

- **Human check during claim** — Epic gates the $0 checkout with an hCaptcha. The claim window
  stays open (up to 5 minutes per game) and the plugin keeps confirming in the background:
  just solve the captcha in the window and the claim completes by itself. Fully unattended runs
  retry on the next scheduled check (with backoff).
- **"需要登录" after a few months** — Epic sessions expire; click **Sign in to Epic** again.
- **Bot check during claim** (`challenge` status) — keep `claimHeadless` off (default).
- **No Chrome installed** — set `executablePath` to any Chromium-based browser.
- **Skipped `not-free` / `not-purchasable`** — region or eligibility restrictions for that title.

## Development

```
pnpm install
pnpm test     # vitest: discovery projection, JWT/session parsing, claim-record
              # account scoping, state migration + atomicity, scheduling
              # policy, HTTP request guard
pnpm check    # syntax check of every module
```

Architecture: `index.js` is the composition root; behavior lives in `lib/`
(`epic` pure domain, `epic-api` store data access, `page-driver` UI
automation, `browser` engine lifecycle, `claim` use cases, `controller`
operation coordinator, `scheduler` policy, `http-api`/`command` projections).
Activity entries are `{code, params}` and localize in the settings page
(zh/en). See `ARCHITECTURE-REVIEW.md` for the audit this structure answers
and `CHANGELOG.md` for release history.

## Privacy

Everything stays on your machine: no telemetry, no data sent anywhere but Epic,
owner-only permissions on all stored data (session cookies, state, screenshots),
and screenshots auto-expire after 7 days. Full inventory and purge instructions:
[PRIVACY.md](PRIVACY.md). 快速清除：`rm -rf ~/.dsh/data/epicgames-auto`。

## Distribution

The package is a standard DSH bundle (`dsh.bundle.patch` + `dsh.client`): `npm publish` it, then
list it in any plugin-market index for one-click installation. Adjust `name`, `repository`, and
the LICENSE copyright line before publishing.

---

## 中文

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 插件：**自动领取 Epic
游戏商城每周免费游戏**。你只需在真实浏览器窗口中登录一次，之后插件按计划发现每周的免费游戏并
自动领取到你的 Epic 库中。

- 登录一次：插件用独立的持久化浏览器配置（默认系统 Chrome）打开 Epic 登录页，由你自己完成登录
  （含两步验证/验证码），插件不接触任何凭据；会话保存在
  `$DSH_HOME/data/epicgames-auto/browser-profile`。
- 发现：定时检查只用一次普通 HTTP 请求（Epic 静态促销接口），无需浏览器和登录。
- 领取：仅当存在未领取的游戏时才启动浏览器：解析真实周免 offer → 校验免费与未拥有 → 完成
  $0 下单 → 通过账号权益确认成功；失败自动留到下次重试，并截图到
  `$DSH_HOME/data/epicgames-auto/errors/`。

### 使用

1. 在 **设置 → Epic 免费游戏** 点击 **登录 Epic**（或在聊天框输入 `/epicgames login`）；
2. 在弹出的 Chrome 窗口完成登录（中文界面，含两步验证/验证码都由你自己完成），窗口检测到会话后自动关闭；
3. 完成。可点 **立即检查并领取** 测试，或等待定时任务。

领取时若出现 hCaptcha：窗口会保持打开（每款游戏最多等 5 分钟），你在窗口里完成验证即可，插件会自动确认入库；无人值守时段失败会在下次计划自动重试。

命令：`/epicgames status` · `/epicgames login` · `/epicgames check`；也可直接让助手调用
`epicgames_free_games` 工具。配置项见上表（设置 → 插件）。

MIT License.
