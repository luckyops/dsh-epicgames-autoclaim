# 架构与代码评审 — dsh-epicgames-autoclaim

> **修复状态（v1.1.0，2026-11-08）**：P0 全部 5 项 ✅；P1 全部 7 项 ✅（D-1 页面驱动端口化为已记录的权衡：浏览器调用已收敛到 `page-driver.js`/`browser.js` 两个文件，完整端口抽象留待引擎多样化需求出现时再做）；P2 完成 8/8 ✅（其中"选择器注入"以组合定位器 + 注册表实现，用户级注入留作后续）。测试 24/24 通过，重构后经全量核对端到端回归。另：评审驱动的测试还抓出一个真实 bug（WHATWG URL 的 IPv6 hostname 带方括号导致 `::1` 回环判定失效）。

评审基准：当前工作区代码（v1.0.0，经 2026-11-08 多轮热修后状态）。
视角：SOLID（SRP/OCP/LSP/ISP/DIP）、GoF 23 种设计模式、资深工程师/架构师工程标准。
结论先行：**功能链路可用且领域建模正确，但存在 5 个 P0 缺陷（1 个阻碍发布、2 个可靠性、1 个漏领风险、1 个用户风险）与 1 项流程性硬伤（零测试）**。以下每条给出位置、违反原则、修复方案。

---

## 0. 架构现状与模式映射

| 现有结构 | 隐性使用的模式 | 评价 |
|---|---|---|
| browser manager（进程内唯一 context） | Singleton | ✓ 合理，但与操作锁 `running` 语义重叠（见 D-2） |
| claim 管道 resolve→validate→own→purchase→confirm | Template Method | ✓ 骨架正确，但步骤的"错误分支"被吞（见 L-2） |
| ORDER_BUTTON_SELECTORS 数组 | Strategy（退化） | 缺注册机制与数据化，改语言要改源码（见 O-1） |
| `epicGames` 服务 → ./tool 消费 | Facade + DIP | ✓ 符合 DSH 双平面架构 |
| pageFetchJson（页面内 fetch 适配为 Node 调用） | Adapter | ✓ 但忽略 HTTP status（见 P2-16） |
| state → UI 3s 轮询 | Observer（轮询退化） | 可用；无推送、无退避（见 P2-15） |
| phase/running/sessionOk 组合 | （无状态机） | **缺失 State 模式**，转换规则散落三处（见 P1-13） |
| 4 个 HTTP 端点 + 命令 + 工具动作 | （无 Command 抽象） | 同一组操作被手写三遍投影（见 S-5） |

**缺失的关键模式**：Command（操作表驱动）、State（集中状态机）、Retry with backoff/Circuit Breaker（现行"失败 1h 重试"无错误分类、无退避）、Repository（持久化内嵌领域对象）。

---

## 1. SOLID 逐项

### SRP 单一职责

- **S-1（P1）`index.js apply()` 是上帝函数**：346 行承担配置、目录、状态、调度、HTTP、CSRF、命令、服务发布、日志共 9 个职责，≥7 个变化方向。
  修复：拆为组合根 + 模块——`apply` 只组装；`scheduler.js`（含 NextRunPolicy 纯函数）、`http-api.js`（路由表驱动）、`command.js`、`controller.js`（login/check/recheck 用例）。每文件一个变化理由。
- **S-2（P1）`claim.js` 混四种职责**：会话/账号管理、GraphQL 数据访问、UI 自动化、流程编排。
  修复：分 `epic-api.js`（数据访问：resolve/validate/ownership）、`page-driver.js`（自动化：按钮/复选框/挑战检测）、`claim.js` 仅编排。
- **S-3（P2）`state.js` 三合一**：领域数据 + 日志总线 + 持久化网关，且 save() 隐式散布于 mutator。修复：领域对象纯内存 + 独立 `state-store.js`（显式 flush），顺带实现原子写（见 R-1）。

### OCP 开闭

- **O-1（P1）扩展点全部硬编码**：订单按钮选择器（10 条）、挑战标题正则、CSRF 判定都为常量；Epic 改 UI/新增语言必须发版。
  修复：选择器表 → Config 可注入 `extraOrderSelectors: string[]`（用户侧热扩展）；挑战检测注册化（title 规则 + DOM 标记两组策略）。
- **O-2（P1）调度策略硬编码于 finally**：`12h / 轮换+20min / 失败+1h` 三条规则内联。修复：`nextRunAt = NextRunPolicy({ intervalHours, rotationAt, failures })` 纯函数——可单测、可配置。

### LSP 里氏替换

- **L-1（P0-级，行为缺陷）`browser.acquire(options)` 契约破裂**：签名承诺按 options 启动，但已有实例时**静默忽略** headless/locale/executablePath 返回旧实例（lib/browser.js）。login（强制 headed）可能拿到 headless 实例。
  修复：options 不兼容时先 `release()` 再按新 options 重启（acquire-and-restart），或拆 `acquireAny()`/`acquireExact(options)` 两个诚实的接口。
- **L-2（P0-级，漏领风险）错误与业务结论同形**：`checkOwnership` catch → `{owned:false, blocked:true}`、`verifyOfferFree` catch → `false`。瞬时网络错误被折叠成"不可购买/不免费"，走 skipped 分支：**不进 retrySoon、不置 lastError，本周静默漏领**。
  修复：返回判别联合 `{kind:'ok',…}|{kind:'error'}`；error 路径 → `outcome:'error'` + `retrySoon=true` + 事件告警。

### ISP 接口隔离

- **I-1（P2）参数包依赖**：`runClaimRun({browser,config,state,logger,candidates,errorsDir})` 把 6 个依赖整体传入，实际各步只用子集；`logger` 参数从未使用（死参数）。修复：显式窄接口（Storage / Notifier / PageDriver 各自注入），删除死参数。
- **I-2（P2）路由样板重复 4 份**：method 校验 + guard + send 三行 ×4。修复：路由描述表驱动注册（同时满足 OCP——新端点一行）。

### DIP 依赖倒置

- **D-1（P2）claim 直接依赖 patchright 具体类型**：换引擎（playwright-core/patchright 迭代）改动扩散。已通过单一 import 收敛到 browser.js（改一行），但 Page/Context 的使用遍布 claim.js。修复（分发视角建议，非必须）：定义 PageDriver 端口（goto/click/cookies/evaluate），browser.js 为 Adapter，引擎名进 Config。
- **D-2（P1）两套互斥机制不同步**：`running`（操作锁）与 browser manager（实例互斥）各自为政；acquire 的 options 又被忽略（L-1），三者组合出的行为难以推理。修复：统一 `OperationCoordinator`——唯一入口串行化 login/check，内部管理浏览器生命周期（获取/重启/释放），对外只暴露 run(operation)。
- **D-3（P1）服务器端文案硬编码中文**：state.event 与命令返回为中文串，而 client 已有 zh/en 字典——英文用户在设置页看到中文日志。修复：事件结构化 `{code, params}`，client 用现有 locale 渲染（表示与本地化分离）。

---

## 2. 工程缺陷清单（按严重级）

### P0（必须修，当前就构成风险/阻碍目标）

| # | 缺陷 | 位置 | 后果 |
|---|---|---|---|
| P0-1 | `package.json` `"private": true` | package.json | **`npm publish` 直接被拒**，与分发目标冲突（publishConfig.access 形同虚设） |
| P0-2 | `GET /api/status` 无鉴权 | index.js:229 | 本机任意进程可读 accountId 全量、昵称、领取史、日志（游戏库隐私侧信道）；POST 有 guard 而 GET 没有，防护不对称 |
| P0-3 | state.json 非原子写、无 schemaVersion | lib/state.js save() | 崩溃窗口产生损坏 JSON → 下次启动静默回默认（丢全部领取记录）；未来字段无迁移路径 |
| P0-4 | 错误折叠为业务结论 → 静默漏领 | claim.js checkOwnership/verifyOfferFree（见 L-2） | 一次网络抖动 = 本周该游戏漏领且零告警 |
| P0-5 | `acceptAgreements` 盲勾前 4 个可见复选框 | claim.js:179 | 购买页若含营销/订阅复选框会被误勾（用户被动订阅）。应只勾与下单按钮存在校验关联（required/aria-describedby EULA 关键词）的项，排除已知营销关键词 |

### P1（重要，影响可靠/可维护/分发质量）

1. 卸载不等待浏览器关闭：`ctx.effect(() => () => { void browser.release(); })` 不返回 Promise——Host 重启可能残留 Chrome 进程/profile 锁（改为返回 promise）。
2. 持久化查询哈希（3 个 magic sha256）失效时全线 skipped 且无诊断。应检测 GraphQL `errors[].extensions.code === 'PersistedQueryNotFound'` 并写入明确事件"Epic 接口指纹变更，请更新插件"；更优：非 persisted 的 query 文本兜底。
3. `clickOrderButton` 串行 10 选择器 × 3.5s × N frame，失败路径可拖 1 分钟+；且"可见但 click 失败"继续尝试后续选择器可能重复触发真实按钮。应组合选择器一次 locator + race 等待，并区分"未找到/点击失败"。
4. 零测试（**流程性硬伤**）：epic.js 的发现过滤/JWT 解码、state.js 的账号键控 hasClaimed、NextRunPolicy 全是纯逻辑，必须补 vitest；claim 管道用注入 PageDriver 假实现做集成测试。
5. 状态机分散：phase 转换散在 statusView/finally/登录回调，新增状态（如 captcha-waiting）会漂移。集中 `derivePhase(operation, sessionOk, data)`。
6. `loginLang` 默认 `zh-CN` 写死在包里——对分发的非中文用户不友好。默认应跟随 `locale`，zh-CN 作为本 profile 的用户层覆盖。
7. `configSchema` 的 `country/locale` 直接透传外部 API 而无格式校验（应 `Schema.string().regex(/^[A-Z]{2}$/)` 等），坏配置的报错形态是运行时深层异常。

### P2（改进项）

8. `errors/` 截图无清理策略（fullPage PNG 每张数百 KB，无限增长）——保留最近 20 张。
9. client 轮询固定 3s：无退避、页面隐藏不暂停、fetch 失败仍原频重试。加 visibilitychange 暂停 + 指数退避。
10. `pageFetchJson` 忽略 status；非 2xx/HTML 一律 json=null 靠 `?.` 兜底——统一转错误分支。
11. `lookupAccountName` 在 store 域跨域拉 www 域接口（CORS 必失败）+ claim 流内再次调用——JWT `dn` 已覆盖，属死代码，删除。
12. `runClaimRun` 的 `logger` 死参数；`html !== '' && isChallengePage(page)` 的空串分支绕（直接 try isChallengePage）。
13. statusView 投影无契约版本（client 无法做兼容协商），`claimed.slice(-30).reverse()` 每次新建数组——量级无害，规范问题。
14. 无 `engines` 声明（建议 `"node": ">=20"`）；README 仓库地址为占位符——发布前必改。
15. 失败重试无退避/熔断：连续 challenge 仍每 1h 重试；建议 1h→2h→4h 封顶，challenge 连续 3 次转"暂停至人工确认"。

---

## 3. 重构蓝图（目标结构）

```
index.js            # 组合根：装配 config/state/browser/controller，注册四张投影面
lib/
  state.js          # 纯领域对象（无 IO）
  state-store.js    # Repository：原子写(tmp+rename)、schemaVersion 迁移
  epic-api.js       # Epic 数据访问（resolve/validate/ownership，判别联合返回）
  page-driver.js    # UI 自动化端口 + patchright Adapter（选择器注册表）
  browser.js        #引擎生命周期（acquireExact 诚实契约）
  claim.js          # 用例编排（login/check/recheck pipeline）
  scheduler.js      # tick + NextRunPolicy 纯函数
  controller.js     # OperationCoordinator：串行化 + 状态机 derivePhase
  operations.js     # Command 表：{name,run,uiLabel}×4，HTTP/命令/工具三面共同驱动
```

迁移顺序（每步可独立发布）：P0-1/3（十分钟级）→ L-1/L-2（browser 契约 + 错判别联合）→ P0-2/5 → S-1/O-2 拆分（纯移动，行为不变，配测试）→ P1 其余。

## 4. 发布前检查单（分发视角）

- [ ] 移除 `private:true`，补 `engines`、真实 `repository`
- [ ] state schemaVersion + 迁移测试
- [ ] 事件码化（i18n）+ loginLang 默认改为跟随 locale
- [ ] 选择器/哈希失效的用户可诊断告警
- [ ] vitest：discovery/JWT/hasClaimed/NextRunPolicy/路由 guard 五组
- [ ] LICENSE 署名确认
