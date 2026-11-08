# dsh-epic-autoclaim

**English** · [中文](#中文文档)

Automatically claims the **Epic Games Store weekly free games** inside
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) — you sign
in once in a real browser window, and the plugin does everything else on a
schedule: discovery, ownership checks, the $0 checkout, and bookkeeping.

```
设置 → Epic 免费游戏  ·  /epicgames status | login | check | recheck  ·  agent tool: epicgames_free_games
```

## Features

- **Multi-account.** Every registered Epic account gets its own persistent browser profile and
  its own claim records; a check claims for all of them, account by account. Add an account by
  signing in (a scratch profile keeps existing sessions untouched); sign out per account from the
  Accounts card, `/epicgames logout [name|all]`, or the tool's `logout` action.
- **Sign in once per account.** A dedicated, stealth-patched Chromium profile
  (system Chrome by default) opens Epic's own login page — you complete the
  sign-in, 2FA, and any human verification yourself; the plugin never sees
  your password. Sessions persist for months.
- **Cheap scheduled checks.** Discovery reads Epic's static promotions API —
  one plain HTTP request, no browser, no login. A browser only launches when
  there is actually something to claim.
- **Rotation-aware.** The current batch's end time is the next rotation; the
  plugin checks again ~20 minutes after it, so new games land in your library
  within minutes of going live. Failed claims back off 1h → 2h → 4h.
- **Ownership confirmed by Epic itself.** Before every purchase the plugin
  asks Epic's entitlement API whether you already own the game; after every
  purchase it polls the same API until the game really is in your library.
  Claim records are keyed by account — switching accounts re-audits
  everything automatically, and **Re-verify library** re-audits on demand.
- **Captcha assist.** When Epic gates the checkout with an hCaptcha, the
  claim window stays open (up to 5 minutes per game) and the plugin keeps
  confirming in the background — solve it in the window and the claim
  completes itself.
- **Private by design.** No telemetry, data only to Epic, owner-only
  permissions on everything stored, masked account ids, screenshots that
  auto-expire. See [PRIVACY.md](PRIVACY.md).

## Requirements

- DeepSeek Harness with the Web GUI (desktop app or `dsh web`).
- A Chromium-based browser: system Google Chrome is auto-detected; Edge and
  Chrome Beta are tried next; otherwise set `executablePath`.

## Install

**From a local checkout.** DeepSeek Harness has no shell command for plugin
installs — `plugin_manager`'s `install_bundle` is a tool the assistant calls
for you. Open any DSH session (this GUI works) and ask it to:

> Install the plugin bundle at /absolute/path/to/dsh-epic-autoclaim using
> plugin_manager's `install_bundle`.

The bundle installs into the current profile and loads without a restart
when possible.

**From a plugin market.** Once the package is published and listed by a
plugin-market index, add that index in the GUI's plugin-market settings,
search for `dsh-epic-autoclaim`, and install from there.

## Quick start

1. Open **Settings → Epic free games** and click **Sign in to Epic**
   (or run `/epicgames login`). A Chrome window opens on Epic's login page.
2. Sign in and finish any verification. The window closes itself once the
   session is detected.
3. Done. Press **Check and claim now** for an immediate run, or just wait for
   the scheduler.

## Usage

| Surface | What you get |
|---|---|
| Settings page | Sign-in state, this week's free games with end dates, claim history, activity log, and the sign-in / check / re-verify actions |
| Slash commands | `/epicgames status` · `/epicgames login` · `/epicgames check` · `/epicgames recheck` · `/epicgames logout [name\|all]` |
| Agent tool (optional) | `epicgames_free_games` (`status` / `check` / `recheck` / `login`) — add the row below to your agent preset so sessions can call it |

```yaml
# in your agent preset's plugin list (Settings → agent preset editor)
- id: epic-autoclaim-tool
  name: dsh-epic-autoclaim/tool
```

## Configuration (Settings → Plugins)

| Field | Default | Meaning |
|---|---|---|
| `intervalHours` | `12` | Hours between automatic checks. |
| `country` | `US` | Store country used for discovery (`US`, `CN`, `DE`, …). |
| `locale` | `en-US` | Store locale for discovery and claim pages. |
| `loginLang` | *(empty)* | Login window language (the human verification follows it); empty follows `locale`. Chinese users usually set `zh-CN`. |
| `claimHeadless` | `false` | Claim without a visible browser window; off (default) is most reliable against bot checks. |
| `executablePath` | *(empty)* | Full path to a Chromium-based browser executable; empty auto-detects system Chrome. |
| `runOnStartup` | `true` | Run one check shortly after the Host starts. |

## Troubleshooting

- **Human check during claim** — normal. Solve it in the open window; the
  plugin continues automatically. Unattended runs retry with backoff.
- **"Sign-in required" after a few months** — Epic sessions expire; sign in
  again.
- **`challenge` status** — a bot check blocked the store page; keep
  `claimHeadless` off (default).
- **`api.fingerprint` in the activity log** — Epic rotated its storefront
  query fingerprints; update the plugin.
- **Skipped `not-free` / `not-purchasable`** — region or eligibility
  restrictions for that title.
- **No browser found** — set `executablePath`.

## Development

```
pnpm install
pnpm test     # vitest: discovery projection, JWT/session parsing, claim-record
              # account scoping, state migration + atomicity, scheduling
              # policy, HTTP request guard
pnpm check    # syntax check of every module
```

`index.js` is the composition root; behavior lives in `lib/` — `epic` (pure
domain), `epic-api` (store data access), `page-driver` (UI automation),
`browser` (engine lifecycle), `claim` (use cases), `controller` (operation
coordinator), `scheduler` (policy), `http-api` / `command` (projections).
Activity entries are `{code, params}` and localize in the settings page
(zh/en). See `ARCHITECTURE-REVIEW.md` for the audit this structure answers and
`CHANGELOG.md` for release history.

## Privacy

Everything stays on your machine: no telemetry, no data sent anywhere but
Epic, owner-only permissions on all stored data, and screenshots
auto-expire after 7 days. Full inventory and the one-line purge command:
[PRIVACY.md](PRIVACY.md).

## License

[MIT](LICENSE)

---

# 中文文档

**[English](#dsh-epic-autoclaim)** · **中文**

在 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 中**自动领取
Epic 游戏商城每周免费游戏**——你只需在真实浏览器窗口中登录一次，剩下的全部交给
插件按计划完成：发现、所有权核对、$0 下单、记账。

```
设置 → Epic 免费游戏  ·  /epicgames status | login | check | recheck  ·  助手工具：epicgames_free_games
```

## 功能特性

- **多账号。** 每个登记的 Epic 账号拥有独立的浏览器配置与领取记录；一次检查按账号逐个
  领取。点“添加账号 / 登录”即可新增（登录用一次性临时配置，不影响已有会话）；在“账号”
  卡片按账号退出，或用 `/epicgames logout <名称|all>`。
- **每账号登录一次，长期有效。** 插件用独立的隐身加固 Chromium 配置（默认系统
  Chrome）打开 Epic 官方登录页——登录、两步验证、人机验证都由你亲自完成，
  插件不接触你的密码；会话可维持数月。
- **定时检查零开销。** 发现环节只调用 Epic 的静态促销接口——一次普通 HTTP
  请求，无需浏览器、无需登录；只有真的有游戏可领时才启动浏览器。
- **轮换感知调度。** 当前批次的截止时间就是下一批上架时间，插件会在轮换后约
  20 分钟自动加查，新游戏上架几分钟内入库；领取失败按 1 小时 → 2 小时 →
  4 小时退避重试。
- **所有权由 Epic 官方确认。** 下单前先查 Epic 权益接口（已拥有则跳过，绝不
  重复下单）；下单后轮询同一接口直到游戏真的出现在库里才记账。领取记录按
  账号标记——换账号登录自动全量重审，也可随时点 **重新核对** 手动重审。
- **验证码辅助。** Epic 在结算环节可能要求 hCaptcha：领取窗口会保持打开
  （每款游戏最多 5 分钟），你在窗口里完成验证即可，插件自动确认入库。
- **隐私优先。** 无遥测、数据只发往 Epic、本地数据全部仅属主权限、账号 ID
  打码显示、诊断截图自动过期。详见 [PRIVACY.md](PRIVACY.md)。

## 环境要求

- 带网页界面（Web GUI）的 DeepSeek Harness（桌面应用或 `dsh web`）。
- 一个 Chromium 内核浏览器：自动检测系统 Google Chrome，其次 Edge / Chrome
  Beta；都没有则配置 `executablePath`。

## 安装

**本地目录安装。** DeepSeek Harness 没有供终端使用的插件安装命令——
`plugin_manager` 的 `install_bundle` 是由助手代为调用的工具。打开任意
DSH 会话（本界面即可），对助手说：

> 用 plugin_manager 的 install_bundle 安装 /绝对路径/dsh-epic-autoclaim

插件会安装进当前配置档（profile），多数情况下无需重启即可生效。

**插件市场安装。** 包发布并被某个插件市场索引收录后，在 GUI 的插件
市场设置中添加该索引，搜索 `dsh-epic-autoclaim` 安装。

## 快速上手

1. 打开 **设置 → Epic 免费游戏**，点击 **登录 Epic**（或在聊天框输入
   `/epicgames login`），弹出 Chrome 登录窗口；
2. 完成登录与验证，窗口检测到会话后自动关闭；
3. 完成。可点 **立即检查并领取** 立即执行一次，或等待定时任务。

## 使用方式

| 入口 | 内容 |
|---|---|
| 设置页 | 登录状态、本周免费游戏及截止时间、领取历史、动态日志，以及 登录 / 立即检查 / 重新核对 按钮 |
| 斜杠命令 | `/epicgames status` · `/epicgames login` · `/epicgames check` · `/epicgames recheck` · `/epicgames logout <名称\|all>` |
| 助手工具（可选） | `epicgames_free_games`（`status` / `check` / `recheck` / `login`）——把下行加入 agent 预设后，会话即可调用 |

```yaml
# 加入 agent 预设的插件列表（设置 → 预设编辑器）
- id: epic-autoclaim-tool
  name: dsh-epic-autoclaim/tool
```

## 配置项（设置 → 插件）

| 字段 | 默认值 | 说明 |
|---|---|---|
| `intervalHours` | `12` | 两次自动检查的间隔小时数。 |
| `country` | `US` | 发现免费游戏用的商店国家代码（`US`、`CN`、`DE`…）。 |
| `locale` | `en-US` | 商店与领取页面语言。 |
| `loginLang` | *(空)* | 登录窗口语言（人机验证跟随该语言）；留空跟随 `locale`，中文用户一般设 `zh-CN`。 |
| `claimHeadless` | `false` | 领取时是否隐藏浏览器窗口；关闭（默认）对反机器人检测最稳。 |
| `executablePath` | *(空)* | Chromium 内核浏览器可执行文件完整路径；留空自动检测系统 Chrome。 |
| `runOnStartup` | `true` | Host 启动后不久先检查一次。 |

## 故障排查

- **领取时出现人机验证** — 正常现象：在打开的窗口中完成即可，插件自动继续；
  无人值守时段失败会退避重试。
- **数月后提示“需要登录”** — Epic 会话过期，重新登录一次即可。
- **`challenge` 状态** — 反机器人验证拦截了商店页；保持 `claimHeadless` 关闭
  （默认）。
- **动态里出现 `api.fingerprint`** — Epic 更新了前端查询指纹，请更新插件。
- **跳过 `not-free` / `not-purchasable`** — 该游戏有地区或资格限制。
- **找不到浏览器** — 配置 `executablePath`。

## 开发

```
pnpm install
pnpm test     # vitest：发现投影、JWT/会话解析、领取记录账号匹配、
              # 状态迁移与原子写、调度策略、HTTP 请求守卫
pnpm check    # 全模块语法检查
```

`index.js` 是组合根；行为都在 `lib/` 中——`epic`（纯领域）、`epic-api`（商店
数据访问）、`page-driver`（界面自动化）、`browser`（引擎生命周期）、`claim`
（用例）、`controller`（操作协调器）、`scheduler`（调度策略）、`http-api` /
`command`（投影面）。动态日志为 `{code, params}` 结构，设置页按 zh/en 字典
本地化。`ARCHITECTURE-REVIEW.md` 记录了本结构所回应的评审，`CHANGELOG.md`
记录版本历史。

## 隐私

一切都在你的机器上：无遥测、数据只发往 Epic、本地数据仅属主权限、诊断截图
7 天自动过期。完整数据清单与一键清除命令见 [PRIVACY.md](PRIVACY.md)。

## 许可

[MIT](LICENSE)
