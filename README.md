# dsh-epicgames-autoclaim

**English** · [中文文档](#中文文档)

Automatically claims the **Epic Games Store weekly free games** inside
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — you sign
in once in a real browser window, and the plugin handles everything else on a
schedule: discovery, ownership checks, the $0 checkout, and multi-account
bookkeeping.

```text
Sidebar → Epic free games  ·  Settings → Epic free games  ·  /epicgames status | login | check | recheck | logout  ·  tool: epicgames_free_games
```

## Features

- **Multi-account.** Every registered Epic account gets its own persistent
  browser profile (`browser-profile-<key>`) and its own claim records; a check
  claims for all of them, account by account. Add an account by signing in (a
  clean scratch profile keeps existing sessions untouched); sign out per
  account from the Accounts card, `/epicgames logout [name|all]`, or the tool's
  `logout` action.
- **Sign in once per account.** A dedicated, stealth-patched Chromium profile
  (system Chrome by default) opens Epic's own login page — you complete the
  sign-in, 2FA, and any human verification yourself; the plugin never sees
  your password. Sessions persist for months.
- **Zero-overhead scheduled discovery.** Discovery reads Epic's static
  promotions CDN — one plain HTTP request, no browser, no login. A browser
  only launches when an account actually has an unclaimed free game.
- **Rotation-aware + circuit-breaker backoff.** Checks again ~20 minutes after
  each weekly rotation so new games land in your library within minutes.
  Transient errors back off 1h → 2h → 4h; expired sessions and repeated bot
  challenges open a circuit breaker instead of hammering Epic.
- **Ownership confirmed by Epic itself.** Queries Epic's entitlement API before
  every checkout and polls it after checkout until the title is verified in
  your library, with a 60-second pre-expiry safety margin so checkout never
  races a promotion expiration.
- **Captcha assist.** When Epic gates checkout with hCaptcha, the browser
  window stays open (up to 5 minutes per game) while the plugin polls in the
  background — solve it once and the claim completes automatically.
- **Private by design.** No telemetry, data sent only to Epic, `0700`/`0600`
  owner-only permissions, masked account IDs across every API/UI surface, and
  auto-expiring diagnostic screenshots. See [PRIVACY.md](PRIVACY.md).

## Requirements

- DeepSeek Harness with the Web GUI (Desktop app or `dsh web`), Node.js ≥ 20.
- A Chromium-based browser: system Google Chrome is auto-detected; Microsoft
  Edge and Chrome Beta are tried next; otherwise set `executablePath`.

## Install

### One-step install (ask DeepSeek Harness)

Paste this into any DeepSeek Harness chat session:

> Install and configure `https://github.com/luckyops/dsh-epicgames-autoclaim.git`
> for me, then open the Epic sign-in window so I can log in.

DeepSeek Harness will clone the bundle into a persistent directory, install its
dependencies, activate it in your current profile, and open the sign-in window.

### From a plugin market

Once listed in a configured plugin-market index, open **Plugins → Market** in
the DeepSeek Harness GUI, search for `dsh-epicgames-autoclaim`, and click
**Install**.

---

## Agent Playbook: Autonomous Install & Setup

> **Instructions for DeepSeek Harness agents:** When the user gives you this
> repository URL or a local checkout path and asks to install or set up this
> plugin, execute the steps below in order.

### Step 1 — Prepare a persistent checkout and install dependencies

`plugin_manager` (`install_bundle`) symlinks local directory targets into the
active profile, so **never clone into `/tmp`** — place the checkout under a
persistent directory such as `${DSH_HOME:-$HOME/.dsh}/bundles/dsh-epicgames-autoclaim`
(unless the user gave you an existing local checkout path):

```bash
BUNDLE_DIR="${DSH_HOME:-$HOME/.dsh}/bundles/dsh-epicgames-autoclaim"
mkdir -p "$(dirname "$BUNDLE_DIR")"
if [ -d "$BUNDLE_DIR/.git" ]; then
  git -C "$BUNDLE_DIR" pull --ff-only
else
  git clone https://github.com/luckyops/dsh-epicgames-autoclaim.git "$BUNDLE_DIR"
fi
```

Install runtime dependencies (`patchright`, `@deepseek-ai/schemastery`) inside
`$BUNDLE_DIR`:

- Run `pnpm --dir "$BUNDLE_DIR" install --prod` (if `pnpm` is not on `PATH`,
  call `load_workspace_dependencies` first to obtain the bundled Node + `pnpm`
  paths, or fall back to `npm --prefix "$BUNDLE_DIR" install --omit=dev`).
- **Completion check:** `node -e "import('patchright')"` succeeds with
  `workdir` set to `$BUNDLE_DIR`.

### Step 2 — Pre-configure locale if appropriate (optional)

Before or after installation, check whether the user wants localized store/login
settings (for example, Chinese users typically prefer `loginLang: "zh-CN"` so
human verification renders in Chinese). Defaults work out of the box
(`country: "US"`, `locale: "en-US"`, `intervalHours: 12`, `claimHeadless: false`).
To pre-set config in `$BUNDLE_DIR/cordis.patch.yml` before `install_bundle`:

```yaml
- insert:
    - id: epicgames-autoclaim
      name: 'dsh-epicgames-autoclaim'
      config:
        locale: 'zh-CN'
        loginLang: 'zh-CN'
```

*(Users can also edit every field later in **Settings → Plugins → Epic weekly free games**.)*

### Step 3 — Activate the bundle with `plugin_manager`

1. Call `plugin_manager`:
   ```json
   {
     "action": "install_bundle",
     "target": "/absolute/path/to/dsh-epicgames-autoclaim"
   }
   ```
2. If the result reports `pendingBuilds` (e.g. `["patchright"]`), ask the user
   for permission to run those build scripts, then call `install_bundle` again
   with `approvedBuilds: ["patchright"]`.
3. **Completion check:** Confirm `application: "applied"` in the tool result
   (if `"restart-required"`, inform the user a Host restart is needed), then
   verify registration without extra approval prompts via `cordis_inspect_query`:
   ```json
   {
     "platform": "host",
     "provider": "Config",
     "method": "listConfigs",
     "input": { "name": "dsh-epicgames-autoclaim" }
   }
   ```

### Step 4 — Verify live status & run first-time sign-in / claim

Once `application: "applied"`, the Host loopback API is immediately live on the
port from your runtime context's `Current DeepSeek Harness Web GUI URL`
(`http://127.0.0.1:<PORT>`). Every request requires `-H 'x-ega-plugin: 1'`:

1. **Verify live status:**
   ```bash
   curl -sS -H 'x-ega-plugin: 1' "http://127.0.0.1:${PORT}/epicgames-autoclaim/api/status"
   ```
2. **Open the sign-in window (when `signedIn` is `false`):**
   ```bash
   curl -sS -X POST -H 'x-ega-plugin: 1' "http://127.0.0.1:${PORT}/epicgames-autoclaim/api/login"
   ```
   Tell the user a Chrome window has opened on Epic's official sign-in page —
   once they finish signing in and 2FA, the window closes itself automatically.
3. **Trigger an immediate discovery & claim run (after sign-in):**
   ```bash
   curl -sS -X POST -H 'x-ega-plugin: 1' "http://127.0.0.1:${PORT}/epicgames-autoclaim/api/check"
   ```

### Step 5 — Optional: Mount `epicgames_free_games` into an agent preset

The bundle's `cordis.patch.yml` mounts the Host service, Web UI panels, and
`/epicgames` slash command profile-wide. If the user also wants future agent
sessions to have the native `epicgames_free_games` tool in their toolset, add
this plugin row to their `@deepseek-ai/dsh-agent-preset` `plugins` list (load
the `editing-cordis-compositions` skill for full preset-bundle instructions):

```yaml
- id: epicgames-autoclaim-tool
  name: dsh-epicgames-autoclaim/tool
```

---

## Usage

| Surface | What you get |
|---|---|
| Left-sidebar panel & Settings page | Account roster & session status, this week's free games with covers & end dates, per-account claim history, localized activity log, and Sign in / Sign out / Check / Re-verify buttons |
| Slash commands | `/epicgames status` · `/epicgames login` · `/epicgames check` · `/epicgames recheck` · `/epicgames logout [name\|all]` |
| Agent tool (optional) | `epicgames_free_games` (`status` / `check` / `recheck` / `login` / `logout`) |

## Configuration (Settings → Plugins)

| Field | Default | Meaning |
|---|---|---|
| `intervalHours` | `12` | Hours between automatic checks (`1`–`168`). |
| `country` | `US` | Store country code used for discovery (`US`, `CN`, `DE`, …). |
| `locale` | `en-US` | Store locale for discovery and claim pages (`en-US`, `zh-CN`, …). |
| `loginLang` | *(empty)* | Login window language (human verification follows it); empty follows `locale`. Chinese users usually set `zh-CN`. |
| `claimHeadless` | `false` | Claim without a visible browser window; `false` (default) is most reliable against bot checks. |
| `executablePath` | *(empty)* | Full path to a Chromium-based browser executable; empty auto-detects system Chrome / Edge. |
| `runOnStartup` | `true` | Run one check 90 seconds after the Host starts. |
| `extraOrderSelectors` | `[]` | Extra Playwright/CSS selectors prepended ahead of the built-in 10-language checkout CTA selectors. |

## Troubleshooting

- **Human check during claim** — normal. Solve it in the open window; the
  plugin continues automatically. Unattended runs retry with backoff.
- **"Sign-in required" after a few months** — Epic sessions expire; click
  **Add account / Sign in** (or `/epicgames login`) to refresh that account in
  place without duplicating it.
- **`challenge` status** — a bot check blocked the store page; keep
  `claimHeadless` off (default). After 3 consecutive challenges the circuit
  breaker pauses short retries until the next regular interval.
- **`api.fingerprint` in the activity log** — Epic rotated its storefront
  persisted-query hashes; update the plugin.
- **Skipped `not-free` / `not-purchasable`** — region or eligibility
  restrictions for that title.
- **No browser found** — install Google Chrome / Edge or set `executablePath`.

## Development

```bash
pnpm install
pnpm test           # vitest: domain, multi-account login/claim/logout, store
                    # migrations, circuit-breaker policy, HTTP loopback guard
pnpm check          # syntax check across entrypoints and lib/*.js
pnpm check:overflow # real-Chromium responsive layout & overflow verification
```

`index.js` is the composition root; behavior lives in `lib/` — `epic` (pure
domain & discovery), `epic-api` (Chain-of-Responsibility offer resolution &
entitlement queries), `page-driver` (semantic UI automation), `browser`
(per-account persistent profile manager), `claim` (login & claim use cases),
`state` + `state-store` (Aggregate Root + atomic v4 Repository), `operations`
(Command registry), `controller` (operation coordinator), `scheduler` (backoff &
circuit breaker), `storage` (directory hardening & legacy migrations), and
`http-api` / `command` / `i18n` (projections). See
[ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md) and
[CHANGELOG.md](CHANGELOG.md).

## Privacy

Everything stays on your machine: no telemetry, no data sent anywhere except
Epic, `0700`/`0600` owner-only permissions on all stored files, masked account
IDs everywhere, and screenshots that auto-expire after 7 days. Full inventory
and one-line purge command: [PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE)

---

# 中文文档

**[English](#dsh-epicgames-autoclaim)** · **中文**

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中**自动领取
Epic 游戏商城每周免费游戏**——只需在真实浏览器窗口中登录一次，后续的周免发现、
库内所有权核对、$0 下单与多账号记账全部由插件按计划自动完成。

```text
左侧栏 → Epic 免费游戏  ·  设置 → Epic 免费游戏  ·  /epicgames status | login | check | recheck | logout  ·  工具：epicgames_free_games
```

## 功能特性

- **多账号支持。** 每个登记的 Epic 账号拥有独立的持久化浏览器配置目录
  （`browser-profile-<key>`）与独立的领取记录；一次检查按账号逐一领取。点击
  **添加账号 / 登录** 即可新增账号（每次打开干净的临时配置目录，绝不污染已有账号
  会话；登录已存在的老账号会自动原地刷新，不会产生重复条目）；支持按账号单独退出。
- **每账号登录一次，长期有效。** 插件用隐身加固的 Chromium 配置（默认自动调用系统
  Chrome）打开 Epic 官方登录页——账号密码、两步验证与人机验证均由你本人在浏览器
  中完成，插件从不接触密码；会话通常可维持数月。
- **定时检查零开销。** 发现环节仅请求 Epic 静态促销 CDN——单次普通 HTTP 请求，无需
  启动浏览器、无需登录态；只有当前账号确实有未领取的周免游戏时才启动浏览器。
- **轮换感知 + 熔断退避调度。** 自动在每周轮换后约 20 分钟加查，新周免上架几分钟
  内即可入库；瞬时失败按 1h → 2h → 4h 指数退避，而登录过期或连续 3 次反机器人拦截
  会自动触发熔断器，避免无效高频拉起浏览器。
- **官方接口双重确认 + 过期安全缓冲。** 下单前先查 Epic 权益接口（已拥有则直接记账
  跳过），且要求距离免费截止至少留有 60 秒安全余量，杜绝卡点变回原价风险；下单后
  轮询权益接口直至确认入库。
- **人机验证辅助。** 结算若遇到 hCaptcha，浏览器窗口会保持打开（单款最长等待
  5 分钟），你在窗口中完成验证后插件自动确认入库并继续。
- **隐私优先。** 无遥测、数据仅发往 Epic 官方域名、本地目录与状态文件强制
  `0700`/`0600` 仅属主读写、所有界面与接口均对账号 ID 打码脱敏、诊断截图 7 天自动
  清理。详见 [PRIVACY.md](PRIVACY.md)。

## 环境要求

- 带网页界面（Web GUI）的 DeepSeek Harness（桌面端或 `dsh web`），Node.js ≥ 20。
- Chromium 内核浏览器：优先自动检测系统 Google Chrome，其次 Microsoft Edge /
  Chrome Beta；若自定义安装位置可配置 `executablePath`。

## 安装与配置

### 一句话自动安装（直接交给 DeepSeek Harness）

打开任意 DeepSeek Harness 会话，直接发送：

> 请帮我安装并配置好这个插件：`https://github.com/luckyops/dsh-epicgames-autoclaim.git`，
> 然后帮我打开 Epic 登录窗口。

DeepSeek Harness 读取本 README 后会自动完成持久化克隆、依赖安装、插件启用，并为你弹出
Epic 登录窗口。

### 插件市场安装

当本包收录至插件市场索引后，可在 GUI 的 **插件 → 插件市场** 中搜索
`dsh-epicgames-autoclaim` 一键安装。

---

## 供 DeepSeek Harness 助手执行的自动安装与配置手册

> **给 DeepSeek Harness Agent 的执行指令：** 当用户提供本仓库地址或本地目录并要求
> 安装/配置本插件时，请严格按以下 5 步顺序执行。

### 第 1 步 — 克隆到持久化目录并安装运行依赖

`plugin_manager` 的 `install_bundle` 对本地目录采用符号链接方式挂载，因此**切勿克隆到
`/tmp` 等临时目录**。若用户未指定现成本地目录，请克隆到持久化路径
`${DSH_HOME:-$HOME/.dsh}/bundles/dsh-epicgames-autoclaim`：

```bash
BUNDLE_DIR="${DSH_HOME:-$HOME/.dsh}/bundles/dsh-epicgames-autoclaim"
mkdir -p "$(dirname "$BUNDLE_DIR")"
if [ -d "$BUNDLE_DIR/.git" ]; then
  git -C "$BUNDLE_DIR" pull --ff-only
else
  git clone https://github.com/luckyops/dsh-epicgames-autoclaim.git "$BUNDLE_DIR"
fi
```

在 `$BUNDLE_DIR` 内安装运行时依赖（`patchright`、`@deepseek-ai/schemastery`）：

- 执行 `pnpm --dir "$BUNDLE_DIR" install --prod`（若系统 `PATH` 中无 `pnpm`，先调用
  `load_workspace_dependencies` 获取内置 Node 与 `pnpm` 路径执行，或退回使用
  `npm --prefix "$BUNDLE_DIR" install --omit=dev`）。
- **完成判据：** 在 `$BUNDLE_DIR` 工作目录下运行 `node -e "import('patchright')"` 退出码为 `0`。

### 第 2 步 — 按用户语言预设配置（可选）

若用户使用中文交流，建议在安装前将 `$BUNDLE_DIR/cordis.patch.yml` 中的 `locale` 与
`loginLang` 设为 `'zh-CN'`（使商店与登录人机验证界面默认显示中文；`country` 可保持
`'US'` 或按用户账号区服设为 `'CN'`）：

```yaml
- insert:
    - id: epicgames-autoclaim
      name: 'dsh-epicgames-autoclaim'
      config:
        locale: 'zh-CN'
        loginLang: 'zh-CN'
```

*（安装后用户也可随时在 **设置 → 插件 → Epic 每周免费游戏** 中可视化修改所有配置。）*

### 第 3 步 — 调用 `plugin_manager` 安装并激活插件包

1. 调用 `plugin_manager` 工具：
   ```json
   {
     "action": "install_bundle",
     "target": "/绝对路径/dsh-epicgames-autoclaim"
   }
   ```
2. 若返回结果包含 `pendingBuilds`（例如 `["patchright"]`），先向用户请求执行安装脚本的确认，
   获批后附带 `approvedBuilds: ["patchright"]` 重新调用 `install_bundle`。
3. **完成判据：** 返回结果中 `application` 为 `"applied"`（若为 `"restart-required"` 则提示
   用户重启一次 DeepSeek Harness），随后用免审批的 `cordis_inspect_query` 验证配置项已挂载：
   ```json
   {
     "platform": "host",
     "provider": "Config",
     "method": "listConfigs",
     "input": { "name": "dsh-epicgames-autoclaim" }
   }
   ```

### 第 4 步 — 验证在线状态并主动引导首次登录与领取

当 `application: "applied"` 生效后，Host 本地回环接口已在当前会话运行上下文的
`Current DeepSeek Harness Web GUI URL` 端口（`http://127.0.0.1:<PORT>`）上就绪。所有请求须携带请求头 `-H 'x-ega-plugin: 1'`：

1. **查询插件运行状态：**
   ```bash
   curl -sS -H 'x-ega-plugin: 1' "http://127.0.0.1:${PORT}/epicgames-autoclaim/api/status"
   ```
2. **为用户弹出 Epic 登录窗口（当 `signedIn` 为 `false` 时）：**
   ```bash
   curl -sS -X POST -H 'x-ega-plugin: 1' "http://127.0.0.1:${PORT}/epicgames-autoclaim/api/login"
   ```
   告知用户已弹出 Chrome 登录窗口，请在窗口中完成 Epic 登录与两步验证，检测成功后窗口会自动关闭。
3. **登录后立即触发首次发现与领取：**
   ```bash
   curl -sS -X POST -H 'x-ega-plugin: 1' "http://127.0.0.1:${PORT}/epicgames-autoclaim/api/check"
   ```

### 第 5 步 — 可选：将 `epicgames_free_games` 工具挂载到 Agent 预设

插件默认已全局挂载左侧栏面板、设置页与 `/epicgames` 斜杠命令。若用户希望后续新建的
会话也能直接调用原生工具 `epicgames_free_games`，可按 `editing-cordis-compositions` 技能规范，
在 `@deepseek-ai/dsh-agent-preset` 的 `plugins` 列表中加入：

```yaml
- id: epicgames-autoclaim-tool
  name: dsh-epicgames-autoclaim/tool
```

---

## 使用方式

| 入口 | 内容 |
|---|---|
| 左侧栏面板 & 设置页 | 多账号列表与会话状态、本周免费游戏封面及截止时间、按账号标记的领取历史、本地化动态日志，以及 添加账号 / 退出 / 立即检查 / 重新核对 按钮 |
| 斜杠命令 | `/epicgames status` · `/epicgames login` · `/epicgames check` · `/epicgames recheck` · `/epicgames logout [名称\|all]` |
| 助手工具（可选） | `epicgames_free_games`（`status` / `check` / `recheck` / `login` / `logout`） |

## 配置项（设置 → 插件）

| 字段 | 默认值 | 说明 |
|---|---|---|
| `intervalHours` | `12` | 两次自动检查的间隔小时数（`1`–`168`）。 |
| `country` | `US` | 发现免费游戏用的商店国家代码（`US`、`CN`、`DE`…）。 |
| `locale` | `en-US` | 商店与领取页面语言（`en-US`、`zh-CN`…）。 |
| `loginLang` | *(空)* | 登录窗口语言（人机验证跟随该语言）；留空跟随 `locale`，中文用户建议设 `zh-CN`。 |
| `claimHeadless` | `false` | 领取时是否隐藏浏览器窗口；关闭（默认）对反机器人检测最稳。 |
| `executablePath` | *(空)* | Chromium 内核浏览器可执行文件完整路径；留空自动检测系统 Chrome / Edge。 |
| `runOnStartup` | `true` | Host 启动 90 秒后自动执行一次检查。 |
| `extraOrderSelectors` | `[]` | 自定义额外结算按钮选择器（优先于内置的 10 国语言选择器匹配）。 |

## 故障排查

- **领取时出现人机验证** — 正常现象：在打开的浏览器窗口中完成即可，插件会自动继续并确认入库。
- **数月后提示“需要登录”** — Epic 会话自然过期；点击 **添加账号 / 登录**（或执行 `/epicgames login`）重新登录该账号即可原地刷新会话，不会产生重复账号。
- **`challenge` 状态** — 反机器人验证拦截了商店页；请保持 `claimHeadless` 为关闭状态（默认）。连续 3 次拦截将触发熔断，暂停短周期重试直至下一轮常规排期。
- **动态里出现 `api.fingerprint`** — Epic 更新了前端持久化查询哈希，请更新插件。
- **跳过 `not-free` / `not-purchasable`** — 该游戏存在区服锁或前置本体限制。
- **找不到浏览器** — 安装 Google Chrome / Edge，或在插件配置中填写 `executablePath`。

## 开发与测试

```bash
pnpm install
pnpm test           # vitest：纯领域逻辑、多账号登录/去重/领取/退出、v4 状态迁移、
                    # 熔断退避调度策略、HTTP 回环防重绑定守卫
pnpm check          # 全入口与 lib/*.js 语法检查
pnpm check:overflow # 真实 Chromium 多宽度响应式布局溢出回归检查
```

## 隐私

所有数据均保存在本机：无遥测、除 Epic 官方域名外无任何外发请求、本地文件强制属主只读权限（`0700`/`0600`）、账号 ID 全链路脱敏、诊断截图 7 天自动清理。完整数据清单与一键清除命令见 [PRIVACY.md](PRIVACY.md)。

## 许可

[MIT](LICENSE)
