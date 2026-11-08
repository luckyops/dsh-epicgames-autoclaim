# Claim Epic Games Store weekly free games automatically

**中文指南** · [English guide](#english-guide) · [Agent install recipe](#agent-install-recipe)

`dsh-epicgames-autoclaim` 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 的 Epic 游戏商城周免自动领取插件。你在本地 Chrome 窗口中登录一次 Epic 账号，插件随后按计划自动发现每周免费游戏、核对库内所有权、完成 $0 下单并按账号独立记账。

## 安装插件

打开任意 DeepSeek Harness 聊天会话，粘贴并发送以下指令，助手会自动完成克隆、依赖安装、中文配置并弹出登录窗口：

```text
请帮我安装并配置 https://github.com/luckyops/dsh-epicgames-autoclaim.git ，完成后打开 Epic 登录窗口。
```

> **Agent pointer**: When asked to install, update, or configure this plugin, execute [Agent install recipe](#agent-install-recipe) step 1 through step 4 in order.

## 开始使用

插件启用后提供三种操作入口：

| 入口 | 位置与命令 |
|---|---|
| 图形界面 | 点击左侧栏礼物盒图标 **Epic 免费游戏**，或打开 **设置 → Epic 免费游戏** |
| 斜杠命令 | 输入 `/epicgames status`、`/epicgames login`、`/epicgames check`、`/epicgames recheck` 或 `/epicgames logout 账号名` |
| 助手工具 | 在 Agent 预设中挂载 `dsh-epicgames-autoclaim/tool` 后调用 `epicgames_free_games` |

首次配置按以下三步完成：

1. 点击 **添加账号 / 登录**（或输入 `/epicgames login`），在弹出的 Chrome 窗口中完成 Epic 登录与两步验证，检测到有效会话后窗口自动关闭。
2. 需要管理多个 Epic 账号时，再次点击 **添加账号 / 登录**；每个账号拥有独立的持久化浏览器目录，互不串号。
3. 点击 **立即检查并领取**（或输入 `/epicgames check`）立即执行首次领取，后续由后台定时器自动运行。

## 核心机制

- **多账号独立配置**：每个账号独占 `browser-profile-账号键` 目录与领取账本；重新登录已有账号会自动原地刷新会话，不产生重复记录。
- **零密码接触**：账号密码、两步验证与人机验证均在本地 Chrome 窗口内由你本人操作，插件只读取登录后的会话 Cookie。
- **静态发现零开销**：定时检查先请求 Epic 公开促销 JSON 接口，仅当账号存在未领取的免费游戏时才启动浏览器。
- **轮换加查与退避熔断**：每周周免轮换 20 分钟后自动加查；瞬时网络错误按 1 小时、2 小时、4 小时退避重试，会话过期或连续 3 次反机器人拦截自动开启熔断。
- **双重权益核对与防原价保护**：下单前查询 Epic 权益接口跳过已拥有游戏，距免费截止不足 60 秒自动中止结算以防恢复原价，下单后轮询确认入库。
- **本地隐私加固**：无任何遥测，本地目录权限强制 `0700`、状态文件强制 `0600`，所有界面与接口均脱敏账号 ID，诊断截图保留 7 天自动清理，详见 [隐私说明](PRIVACY.md)。

## 配置参数

打开 **设置 → 插件 → Epic 每周免费游戏** 可调整以下参数：

| 参数名 | 默认值 | 说明 |
|---|---|---|
| `intervalHours` | `12` | 定时检查间隔小时数，范围 `1` 至 `168` |
| `country` | `US` | 商店国家代码，如 `US`、`CN`、`DE` |
| `locale` | `en-US` | 商店与商品页语言，如 `en-US`、`zh-CN` |
| `loginLang` | 空字符串 | 登录窗口与人机验证语言，留空则跟随 `locale` |
| `claimHeadless` | `false` | 是否隐藏领取浏览器窗口，保持 `false` 可显著降低反机器人拦截率 |
| `executablePath` | 空字符串 | Chromium 浏览器可执行文件绝对路径，留空自动检测系统 Chrome 或 Edge |
| `runOnStartup` | `true` | DeepSeek Harness 启动 90 秒后自动执行一次检查 |
| `extraOrderSelectors` | `[]` | 自定义结算按钮选择器列表，优先于内置的 10 语言选择器匹配 |

## 故障排查

- **结算时出现 hCaptcha 人机验证**：浏览器窗口会保持打开最多 5 分钟，你在窗口内完成验证后插件自动继续确认入库。
- **状态提示需要登录**：Epic 会话已过期，点击 **添加账号 / 登录** 重新登录对应账号即可恢复。
- **日志出现 `challenge.blocked`**：商店页触发了反机器人拦截，请在插件设置中将 `claimHeadless` 保持关闭。
- **日志出现 `api.fingerprint`**：Epic 更新了前端持久化查询哈希，拉取本仓库最新版本即可恢复。
- **跳过原因显示 `not-free` 或 `not-purchasable`**：该游戏在当前账号区服不免费，或依赖未拥有的基础本体。

## English guide

`dsh-epicgames-autoclaim` claims weekly free games from the Epic Games Store inside [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Sign in once in a real Chrome window, and the plugin discovers active giveaways, verifies library entitlements, completes the $0 checkout, and records claims across multiple Epic accounts.

### Install the plugin

Paste this prompt into any DeepSeek Harness chat session to install, configure, and open the sign-in window:

```text
Install and configure https://github.com/luckyops/dsh-epicgames-autoclaim.git for me, then open the Epic sign-in window.
```

### Use the plugin

Manage accounts and claims from three surfaces:

| Surface | Location and commands |
|---|---|
| Web GUI | Click the gift-box icon **Epic free games** in the left sidebar, or open **Settings → Epic free games** |
| Slash commands | Run `/epicgames status`, `/epicgames login`, `/epicgames check`, `/epicgames recheck`, or `/epicgames logout your_account_name` |
| Agent tool | Mount `dsh-epicgames-autoclaim/tool` in an agent preset to call `epicgames_free_games` |

Complete first-time setup in three steps:

1. Click **Add account / Sign in** (or run `/epicgames login`) and sign in to Epic in the Chrome window; the window closes automatically once your session cookie is active.
2. Click **Add account / Sign in** again to add more Epic accounts; each account uses an isolated browser profile directory.
3. Click **Check and claim now** (or run `/epicgames check`) for an immediate claim run, or wait for the background scheduler.

### Configure plugin settings

Adjust settings in **Settings → Plugins → Epic weekly free games**:

| Field | Default | Description |
|---|---|---|
| `intervalHours` | `12` | Hours between scheduled checks, from `1` to `168` |
| `country` | `US` | Two-letter store country code such as `US`, `CN`, or `DE` |
| `locale` | `en-US` | Storefront and checkout locale such as `en-US` or `zh-CN` |
| `loginLang` | Empty string | Sign-in and captcha language; empty follows `locale` |
| `claimHeadless` | `false` | Run checkout headless; keep `false` to pass bot checks reliably |
| `executablePath` | Empty string | Full path to a Chromium executable; empty detects Chrome or Edge |
| `runOnStartup` | `true` | Run one check 90s after the Host starts |
| `extraOrderSelectors` | `[]` | Custom Playwright or CSS selectors checked before the built-in 10-language CTA list |

### Troubleshoot common issues

- **Human verification appears during checkout**: Solve the challenge in the open Chrome window within 5 minutes, and the plugin finishes the order automatically.
- **Account shows session expired**: Click **Add account / Sign in** and sign in with that account to refresh its session in place.
- **Activity log shows `challenge.blocked`**: Keep `claimHeadless` set to `false` in **Settings → Plugins** so checkout runs in a visible window.
- **Activity log shows `api.fingerprint`**: Update the plugin to get the latest Epic GraphQL query hashes.

## Agent install recipe

Execute step 1 through step 4 in order when asked to install, update, or configure `dsh-epicgames-autoclaim`.

### Step 1: Clone the bundle into persistent storage and install dependencies

Clone the repository into `${DSH_HOME:-$HOME/.dsh}/bundles/dsh-epicgames-autoclaim` so the linked bundle directory survives system reboots, then install production dependencies:

```bash
BUNDLE_DIR="${DSH_HOME:-$HOME/.dsh}/bundles/dsh-epicgames-autoclaim"
mkdir -p "$(dirname "$BUNDLE_DIR")"
if [ -d "$BUNDLE_DIR/.git" ]; then
  git -C "$BUNDLE_DIR" pull --ff-only
else
  git clone https://github.com/luckyops/dsh-epicgames-autoclaim.git "$BUNDLE_DIR"
fi
pnpm --dir "$BUNDLE_DIR" install --prod
```

When `pnpm` is absent from `PATH`, call `load_workspace_dependencies` to obtain the bundled Node and `pnpm` paths, or run `npm --prefix "$BUNDLE_DIR" install --omit=dev`.

- **Done when**: `node -e "import('patchright')"` exits `0` with `workdir` set to `$BUNDLE_DIR`.

### Step 2: Write language defaults into `cordis.patch.yml`

When the user writes in Chinese, configure Chinese store and sign-in defaults in `$BUNDLE_DIR/cordis.patch.yml`:

```yaml
- insert:
    - id: epicgames-autoclaim
      name: 'dsh-epicgames-autoclaim'
      config:
        locale: 'zh-CN'
        loginLang: 'zh-CN'
```

When the user writes in another language, keep `config: {}` in `$BUNDLE_DIR/cordis.patch.yml`.

- **Done when**: `$BUNDLE_DIR/cordis.patch.yml` matches the user's language.

### Step 3: Activate the bundle with `plugin_manager`

Call `plugin_manager` with the resolved absolute path of `$BUNDLE_DIR`:

```json
{
  "action": "install_bundle",
  "target": "/Users/your_username/.dsh/bundles/dsh-epicgames-autoclaim"
}
```

When `install_bundle` returns `pendingBuilds` listing `"patchright"`, ask the user for approval to run its install script, then call `install_bundle` again with `"approvedBuilds": ["patchright"]`. Confirm registration with `cordis_inspect_query`:

```json
{
  "platform": "host",
  "provider": "Config",
  "method": "listConfigs",
  "input": { "name": "dsh-epicgames-autoclaim" }
}
```

- **Done when**: `install_bundle` returns `"application": "applied"` and `Config.listConfigs` returns the `epicgames-autoclaim` entry.

### Step 4: Verify live status and open the sign-in window

Extract the port from `Current DeepSeek Harness Web GUI URL` in your runtime context (for example `49320`), check `/epicgames-autoclaim/api/status`, and open the Epic sign-in window when `signedIn` is `false`:

```bash
GUI_PORT=49320
curl -sS -H 'x-ega-plugin: 1' \
  "http://127.0.0.1:${GUI_PORT}/epicgames-autoclaim/api/status"
curl -sS -X POST -H 'x-ega-plugin: 1' \
  "http://127.0.0.1:${GUI_PORT}/epicgames-autoclaim/api/login"
```

Tell the user that Chrome has opened on Epic's sign-in page and will close automatically once login succeeds. After sign-in completes, trigger the first claim pass with `curl -sS -X POST -H 'x-ega-plugin: 1' "http://127.0.0.1:${GUI_PORT}/epicgames-autoclaim/api/check"`.

- **Done when**: `/epicgames-autoclaim/api/status` returns `"contract": 3` and either `"signedIn": true` or `"phase": "login-waiting"`.

### Preset tool reference (on request)

When the user also asks to expose the `epicgames_free_games` tool to future agent sessions, load the `editing-cordis-compositions` skill and add this entry to the target `@deepseek-ai/dsh-agent-preset` `plugins` list:

```yaml
- id: epicgames-autoclaim-tool
  name: dsh-epicgames-autoclaim/tool
```

## Development and license

Run tests, syntax checks, and layout overflow checks from the repository root:

```bash
pnpm install
pnpm test
pnpm check
pnpm check:overflow
```

See [ARCHITECTURE-REVIEW.md](ARCHITECTURE-REVIEW.md) for architecture notes, [PRIVACY.md](PRIVACY.md) for privacy details, [CHANGELOG.md](CHANGELOG.md) for release notes, and [LICENSE](LICENSE) for the MIT license.
