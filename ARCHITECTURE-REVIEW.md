# 架构与代码评审 — dsh-epicgames-autoclaim

> **修复状态（v1.6.1，2026-11-08）**：面向开源发布与多账号生产可靠性的全量 SOLID / GoF 二轮架构审计与重构已完成。
> - **P0 / P1 级功能、安全与并发缺陷**：全部修复并通过自动化单测/集成测试验证 ✅
> - **SOLID 原则（SRP / OCP / LSP / ISP / DIP）**：全部达标 ✅
> - **GoF 设计模式落地**：Repository、Observer、Command、State、Strategy、Chain of Responsibility、Facade、Adapter、Template Method + Circuit Breaker ✅
> - **测试覆盖**：6 个测试套件、51 项单元与集成测试（覆盖多账号登录/去重/窗口关闭/动态 iframe 轮询/多 Cookie 选择/Observer/四端对称操作）+ Chromium 布局溢出检查全部通过 ✅

---

## 1. v1.5.0 深度扫描发现并修复的核心缺陷

| 编号 | 类别 / 违反原则 | 缺陷定位与根因分析 | 修复方案 |
|---|---|---|---|
| **BUG-1** | **P0 功能崩溃 / ISP & Command 模式缺失** | `index.js` 在 `ctx.provide('epicGames', ...)` 中手写暴露了 4 个方法，遗漏了 `controller.logout`；导致 Agent 调用 `epicgames_free_games(action="logout")` 时直接抛出 `TypeError: controller.logout is not a function`。 | 新增 `lib/operations.js`（**GoF Command 模式**），统一定义 `status / login / check / recheck / logout` 五个命令及 `createServiceFacade(controller)`，驱动 Service、HTTP、Slash Command、Agent Tool 四大投影面。 |
| **BUG-2** | **P0 多账号串号与漏领 / 领域不变量破裂** | 1) `claim.js` 在 `readSession(context)` 之前计算 `accountKey`，导致首次获取 `EPIC_EG1` 的账号以 `account: null` 写入领取记录；而 `state.hasClaimed` 将 `ownedBy === null` 视为通配符，导致一个未铸造 ID 的账号领完后阻塞所有其他账号。<br>2) `runLoginFlow` 未在启动前清理上次中断残留的 `browser-profile-login`，且对 `legacy` / `anonymous` 账号重复登录时未按 `accountId` 合并键名，产生重复账号条目。 | 1) `runLoginFlow` 启动前强制清理 `browser-profile-login` 临时目录，并在检测到 SSO 会话后轮询等待商店铸造 `EPIC_EG1`（最多 15s）。<br>2) `state.resolveAccountKey(id, name)` 与 `upsertAccount` 按 `id`/`name`/`legacy` 自动归并已有账号并回填历史记录。<br>3) `hasClaimed` 严格按账号集合匹配，绝不将未铸造 `id` 的多账号记录当成全局通配符。 |
| **BUG-3** | **P0 隐私泄露 / 违反最小暴露原则** | `claim.js` 将原始 32 位十六进制 `accountId` 写入 `entry.account`，`controller.status()` 原样返回给 `/api/status` 与前端标签，违反了 `PRIVACY.md`“绝不暴露完整账号 ID”的承诺。 | 领取记录同时保存内部归属键 `account`/`accountKey` 与脱敏展示名 `accountName`；`state.recentClaimedView()` 对所有历史记录统一脱敏映射。 |
| **BUG-4** | **P0 macOS 登录窗口关闭死锁** | 在 macOS 上用户直接关闭 Chrome 登录窗口时，页面（`Page`）关闭但后台浏览器进程仍在，`context.cookies()` 不会抛异常而是持续返回 `[]`，导致插件卡死在 `login-waiting` 状态长达 10 分钟；且关闭窗口时误将全局 `state.data.sessionOk` 设为 `false`，污染已登录的其他账号。 | 在 `runLoginFlow` 轮询中引入 `hasAnyOpenPage(context, page)` 检测，窗口关闭立即退出并清理临时目录，同时调用 `state.syncSummaryFromAccounts()` 保持已有正常账号的登录状态。 |
| **BUG-5** | **P0 恒真布尔逻辑缺陷 / LSP 违背** | `claim.js` 中 `return { ok: adopted || true }` 导致 `browser.adoptProfile` 失败返回 `false` 时仍被判定为登录成功，后续领取因持久化目录为空立即失效。 | 显式校验 `if (!adopted)`，失败时清理临时目录、记录 `login.crash` 并返回 `{ ok: false, error: 'adopt-failed' }`。 |
| **BUG-6** | **P0 结算原价误扣风险与 Offer 解析断链** | 1) `resolveOffer` 第一步 `getMappingByPageSlug` 或第二步 CMS 404 抛错时未捕获，直接中断而无法降级到第三步 `candidate.offerId + namespace`。<br>2) `queryOfferFree` 未预留促销截止缓冲期，卡点结算存在免单刚过期恢复原价的风险。 | 1) `resolveOffer` 重构为三阶段 **Chain of Responsibility（责任链模式）**，前序步骤 404/异常自动降级至后续策略。<br>2) `queryOfferFree` 增加 60 秒过期安全缓冲（`EXPIRY_SAFETY_BUFFER_MS`）。 |
| **BUG-7** | **P1 安全绕过与异常崩溃（HTTP API & DOM）** | 1) `http-api.js` 使用 `bare.startsWith('127.')` 校验回环地址，可被 `http://127.evil.com` 域名绕过（DNS Rebinding / Origin 伪造）。<br>2) `/api/logout/%E0%A4%A` 非法 URL 编码触发未捕获 `URIError`。<br>3) `page-driver.js` 中 `label[for="${box.id}"]` 未转义特殊字符（如 React `:r1:`），且营销过滤词 `/offer/i` 误伤含 `"for this offer"` 的正规 EULA 复选框。 | 1) 严格正则校验 IPv4 回环 `/^127(?:\.(?:25[0-5]\|2[0-4]\d\|1?\d?\d)){3}$/`。<br>2) `guardAndRun` 统一捕获 `URIError` 返回 `400 bad-request`。<br>3) 使用 `box.labels` + `CSS.escape(box.id)`，并将营销过滤精准化为 `promotional / special offers / share my email`。 |
| **BUG-8** | **P1 状态机漂移与无效高频重试** | 1) `runCheck` 从未将阶段切换为 `'claiming'`，且进程崩溃会导致 `'discovery'` 持久化残留。<br>2) 任一账号会话过期（`need-login`）或连续触发反机器人挑战（`challenge`）时仍每 1~4 小时无限拉起 Chrome。 | 1) `scheduler.js` 集中实现 `derivePhase`（**State 模式**）与 `isCircuitOpen`（**Circuit Breaker 熔断器**）：认证过期、接口指纹失效、连续 3 次挑战自动开启熔断。<br>2) 引入插件卸载 `AbortController`，确保重载/退出时立即中止异步任务。 |

---

## 2. SOLID 与 GoF 设计模式映射

```text
index.js               # Composition Root：装配配置、存储、状态、浏览器与控制器，挂载四张投影面
tool.js                # Agent 工具入口（通过 epicGames 服务门面调用统一命令表）
client.js              # Web GUI 双槽位自适应视图（左侧栏宽面板 + 设置页窄面板）
lib/
  operations.js        # [Command + Facade] 五大操作注册表与服务门面，消除多端契约漂移
  state.js             # [Aggregate Root] 纯内存领域模型（多账号注册表、按账号幂等记账、脱敏投影）
  state-store.js       # [Repository + Strategy] v1→v4 迁移链、0600 原子写（tmp+rename）、损坏文件自动备份与内存假实现
  storage.js           # [SRP Bootstrap] 数据目录权限加固（0700）与旧版目录/单账号配置无缝迁移
  epic.js              # [Domain Value Objects] 促销发现、多语言 URL 构建与 JWT/Cookie 会话解析
  epic-api.js          # [Chain of Responsibility + Adapter] 三级 Offer 解析链与判别联合（ok/error）数据访问
  page-driver.js       # [Strategy + Adapter] 10 语言 + 可配置下单按钮定位器、EULA/营销复选框语义判定
  browser.js           # [Lifecycle Manager] 多账号持久化 Profile 管理、外部关窗自愈与诚实 acquire 契约
  claim.js             # [Template Method] 多账号独立领取管道与防污染临时 Profile 登录流
  controller.js        # [Mediator / Coordinator] 互斥操作协调、AbortSignal 生命周期管理与状态投影
  scheduler.js         # [State + Circuit Breaker] 轮换感知退避策略、熔断器判定与统一阶段派生
  http-api.js          # [Table-Driven Router] 严格回环校验与统一异常边界的本地 HTTP 路由
  command.js           # [Adapter] /epicgames 多语言斜杠命令处理器
  i18n.js              # [Strategy] Host 端用户语言偏好读取与双语回退器
```
