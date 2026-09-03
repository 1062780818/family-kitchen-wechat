# FK-C02-001｜微信小程序前端复用审查 V0.1

执行人：Codex-02。审查日期：2026-09-03 至 2026-09-04（Asia/Shanghai，跨午夜完成交付）。

任务范围：第 0 阶段源码阅读、原样构建/开发启动、小范围隔离验证、复用盘点和交互建议。未开发业务功能，未改数据库、接口契约、基础配置或依赖版本。需求依据为启动总指令 V1.1 与后续 FK-C02-001；后者已明确“独立亲亲价格、默认 1、上菜后送上亲亲、不设余额欠账、调整后妻子确认”，这些不再列为未确认需求。

源码来源：https://github.com/llgululu/family-kitchen.git 。上游分支 `main`，基线 Commit ID：`572f3e20fb2c2ae243013c0bdc3e05054c708745`，提交日期 2026-06-13，提交说明 `Update manifest.json`。这是 Codex-02 本次审查快照，不替 Codex-01 冻结项目最终基线。

本地仓库：`H:\codex\林家餐厅小程序\family-kitchen`。审查分支：`codex/02-frontend-audit`。本报告所在交付提交可用 `git log -1 --format=%H -- docs/CODEX02_FRONTEND_REUSE_AUDIT_V0.1.md` 查询；提交后聊天交付中提供完整哈希，避免文档自引用哈希。

结论：候选前端有真实页面和 API 调用，微信/H5 编译可完成，但不具备已确认产品骨架的完整能力。31 个现有页面按整页计：A 直接复用 0、B 修改后复用 16、C 仅参考交互 3、D 建议移出第一版 12。E 表示后续缺失能力，不是假装已有页面。此处“完成”仅指审查任务，不是产品通过验收。

## 一、前端技术现状

| 项目 | 代码事实 |
| --- | --- |
| 工程 | pnpm workspace；根版本、小程序版本均为 0.1.0；mini-app、backend、admin、packages/shared 分离 |
| 框架 | uni-app + Vue 3 + JavaScript；多数页面 Options API，4 个 AI 页面 script setup |
| 实际安装 | uni-app 3.0.0-5000720260410001、Vue 3.5.34、Pinia 2.3.1、WOT 1.14.0、Vite 5.2.8；不是将 package.json 范围当实际版本 |
| 环境 | Windows/PowerShell，Git 2.53.0.windows.3，Node 24.19.0；仓库 .nvmrc=20，本次未复现 Node 20 |
| 包管理 | 仓库指定 pnpm 9.12.0；机器默认 11.19.0，成功验证均经 `pnpm.cmd dlx pnpm@9.12.0` 调用指定版本 |
| 构建 | `uni build -p mp-weixin` / `uni -p mp-weixin`；H5 为 `uni build` / `uni` |
| 路由 | src/pages.json 注册 31 页、4 个 Tab，无分包配置；使用 uni.navigateTo/redirectTo/switchTab/reLaunch，无自建 Vue Router 配置 |
| 状态 | 5 个 Pinia Store；页面各自 data/ref，未提供跨页已选餐单 Store，也未发现餐单草稿持久化 |
| UI | 2 个自定义组件 + 15 种实际使用的 wd-* 标签；大量卡片、底部按钮、遮罩写在页面内，不能按已抽离组件计算 |
| 样式 | SCSS、rpx、固定底部、安全区；theme.scss/uni.scss/App.vue 与页面局部样式共同控制；本轮不做最终视觉稿 |
| 数据 | uni.request REST 封装、Bearer Token；16 个 api 文件；运行时配置来自 /config/public；图片走原后端上传 |
| 实时 | uni.connectSocket，自定义 JSON 事件；不是 Socket.IO；主要用于聊天和家庭退出提醒 |
| 共享类型 | mini-app 声明 workspace shared 依赖，但 src 未发现直接 import shared；状态/限制在前端另有副本，存在漂移风险 |

根 LICENSE 为 MIT，原版权与许可证保持原样。已安装 Vue/Pinia/WOT 包 metadata 为 MIT、uni-app 为 Apache-2.0；这只是来源初筛，不是完整传递依赖或图片素材授权审计。静态头像、logo、DiceBear 远端形象的来源与可用范围交 Codex-01/03核查，不因根 LICENSE 就认定全部素材已合规。

## 二、实际运行结果

### 2.1 执行与证据

下列 pnpm 子命令均通过 `pnpm.cmd dlx pnpm@9.12.0` 执行；日志在 `docs/frontend/evidence/`。

| 实际操作 | 结果 | 证据 |
| --- | --- | --- |
| git clone --depth 1，创建审查分支 | 成功；保留 origin，不推送 | environment-and-http.txt、Git 历史 |
| `--filter @family-kitchen/mini-app... install --frozen-lockfile --ignore-scripts --store-dir .pnpm-store --reporter append-only` | 联网安装 973 包，退出 0；只选前端及 shared 依赖范围 | 环境记录为首次安装摘录 |
| 同命令增加 `--offline` 再验证 | 退出 0，锁文件最新，2.3 秒 | install-locked-offline.txt |
| `--filter @family-kitchen/mini-app run build:mp-weixin` | 退出 0，Build complete；原样生产编译成功 | build-mp-weixin.txt |
| `--filter @family-kitchen/mini-app run dev:mp-weixin` | Watching for changes，ready in 5608ms | dev-mp-weixin.txt |
| `--filter @family-kitchen/mini-app run build:h5` | 退出 0，Build complete | build-h5.txt |
| `--filter @family-kitchen/mini-app run dev:h5 --host 127.0.0.1` | 本机 5173 启动，ready in 4918ms | dev-h5.txt |
| HTTP 获取 `/`、`/src/main.js`、首页 SFC | 均为 200；证明服务/资源可访问，不等同渲染及交互验收 | environment-and-http.txt |
| `--filter @family-kitchen/mini-app run lint` | 退出 1：12 errors、1461 warnings | lint.txt，完整未截断日志 |
| 原 test / typecheck | 均退出 0，但只有 echo，没有实际自动化测试或类型检查 | original-test.txt、original-typecheck.txt |
| `node docs/frontend/audit-source.cjs` | 31 路由文件齐全、无未注册页面；完成 5 项源码/隔离探测 | source-inventory.json、probe-results.txt |

两个开发服务验证后已 Ctrl+C 停止；停止退出码不作构建失败处理。没有执行自动升级提示、全仓库格式化、lint --fix、后台部署或数据库迁移。

工具障碍已绕过：捆绑 Git 默认找不到 remote-https，通过进程级 GIT_EXEC_PATH 修正；沙箱外网限制与 pnpm 用户缓存 EPERM 通过工具授权后完成。默认 pnpm 11 会尝试重新安装且因无 TTY 中止，没有强制清理，后续固定用 9.12.0。安装禁用生命周期脚本是本轮限定验证措施，不能冒充整个 monorepo 的原始环境复现。

### 2.2 尚未完成的运行层级

- `http://127.0.0.1:3000/api/v1/config/public` 实测连接被拒绝；没有可联调的原后端、测试家庭和账号。本轮没有启动数据库或后端。
- `manifest.json` 和编译产物仍为 `appid: your-appid`，`urlCheck: false`。未提供有效微信 AppID、实际域名及订阅模板验证环境。
- PATH/常见安装目录没有找到微信开发者工具命令；没有模拟器导入、微信登录、真机上传或双端流转证据。不能声称真机可用。
- 生产产物 app.json 的 `tabBar.custom=true`，但产物没有 `custom-tab-bar/`，页面嵌入的是 WOT 自定义 Tab 组件。是否影响微信端导航须专门导入复核，不以 CLI 编译成功消除此风险。
- H5 只做服务和资源探测，没有执行浏览器 UI 自动化；Node 20、独立干净机器安装、真实网络中断恢复交 Codex-03 复现。

### 2.3 小范围验证发现

1. 多菜选择：直接执行原 create 页的 toggleRecipe；可加入两道不同菜，再次点击移除，验证通过。不是后端餐单提交测试。
2. 菜谱保存防重：连续调用原 edit 页 handleSave，隔离桩观察到两次 create。saving 只影响 view 样式，方法没有前置防重；可导致重复请求，实际数据库结果待联调。
3. 餐单详情断网：原 load 请求抛错后 order=null，根模板 v-if=order，无独立 error 状态。首次失败会没有正文，且无页内重试。
4. WS 地址：原 buildWsUrl 将 `https://example.test/api/v1` 推导为 `wss://example.test:3001`，强耦合原部署端口，不是同源 443。
5. 订阅授权：src 全量扫描没有 requestSubscribeMessage 调用；配置模板 ID 和通知开关不能证明授权链路已实现。

## 三、现有页面和路由清单

标记：A=无需业务改造的直接复用候选；B=修改后复用；C=仅参考交互，建议第一版不开放；D=建议第一版移除；E=缺失待后续开发。B/C/D 是审查建议，没有实际删除或修改路由。

以下路径统一相对于 `mini-app/src/`，路由均以 `pages/` 开头，源码加 `.vue`。状态栏中的“错误”默认指 http.js 的 toast；未写独立错误页不能推断存在。列表的 loading 变量通常只是条件控制，不代表有可见 spinner。

| 路由 | 页面/表单/局部交互 | 空、加载、错误状态 | 标记 |
| --- | --- | --- | --- |
| pages/tabbar/home/home | 小厨房 Tab；活跃单、随机推荐卡、通知/聊天/AI/积分入口 | 游客、无家庭、无活跃单；Store 失败也清空；无独立错误 | B |
| pages/tabbar/menu/menu | 菜单 Tab；搜索、全部/最爱/餐段筛选、新增入口 | 游客、无家庭、空菜单、加载更多/到底；搜索无结果混用空菜单；无独立错误 | B |
| pages/tabbar/timeline/timeline | 时间线 Tab；补记入口、回复文本浮层、删除操作菜单 | 游客、无记录、loading/分页；请求失败无页内重试 | C |
| pages/tabbar/profile/profile | 我的 Tab；资料、币/成就/等级、家庭设置、退出确认 | 未登录，指标占位 --；无独立加载/错误 | B |
| pages/auth/login | 协议勾选、微信登录；H5 手机号/密码；协议确认框 | loading/按钮禁用；校验提示、登录错误日志；无数据空态 | B |
| pages/auth/agreement-user | 静态用户协议 | 无远程加载；原文包含爱心币等不适用内容 | B |
| pages/auth/agreement-privacy | 静态隐私政策 | 无远程加载；存储/头像等描述须与最终实现一致 | B |
| pages/family/setup | 创建/加入模式；厨房名、邀请码；创建成功弹窗 | loading/按钮禁用、接口 toast；无独立错误 | B |
| pages/family/settings | 改名弹窗、邀请信息、四个通知开关、退出确认 | 无家庭占位；更新失败 toast、开关回滚；无请求加载页 | B |
| pages/order/create | 厨师选择、多菜浮层、单菜备注、时间 picker、整单备注 | 无第二成员、未选菜、无菜谱；saving 禁用；选菜加载失败也表现为空 | B |
| pages/order/detail | 餐单、角色/状态、接拒单/备菜/烹饪/拍照上菜、取消、评价浮层 | order=null 无正文；动作无统一进行中锁；拒绝/取消可填原因 | B |
| pages/order/history | 全部/我点的/我做的筛选、餐单卡、币奖励 | 无订单、loading 变量、加载更多/到底；无独立错误 | B |
| pages/order/chat | 文本、表情面板、催菜、AI 对话、图片/打赏消息展示、已读 | 终态禁止输入、AI streaming、新消息计数；无首次空/错重试 | D |
| pages/chat/list | 逐单会话列表、未读角标 | 无消息、loading 变量；失败仍可能显示无消息 | D |
| pages/recipe/detail | 图集、难度、餐段/口味、做法、收藏、编辑/删除/点这道 | 无图占位；未登录提示；请求失败时登录用户一直显示加载中 | B |
| pages/recipe/edit | 菜名、最多5图、难度、餐段、口味、做法 | 新增空表单、保存中文字；详情/上传失败无独立错误；图片选择可取消 | B |
| pages/timeline/monthly | 月度指标、常做菜图、成员贡献图、徽章 | 无 summary 或0单均显示无点单；无独立加载/错误 | D |
| pages/timeline/manual | 日期 picker、文字、最多5图 | 空表单、保存防重；上传/请求 toast，无专属错误页 | C |
| pages/profile/love-points | 余额、签到、我的流水/家庭账本 Tab、撤回确认 | 无家庭、无流水、loading/分页；余额失败回落0可能误导 | D |
| pages/profile/achievements | 成就分类 Tab、进度、徽章分享/保存相册 | 无家庭、无成就、锁定/已解锁；进度接口失败退旧 API | D |
| pages/profile/edit | 头像操作菜单/默认头像浮层、昵称、签名 | saving；加载失败保留空表单；选图/上传提示 | B |
| pages/profile/bind-credentials | 手机号、密码，开通 H5 登录 | saving、已绑定提示；冲突业务码弹窗 | D |
| pages/profile/feedback | 内容、联系方式 | 内容至少5字、saving/禁用；接口 toast | C |
| pages/profile/about | 版本与协议入口 | 静态，无数据加载 | B |
| pages/profile/chef-level | 当前等级、下一等级双进度、规则 | info=null 仍显示说明外壳；无独立加载/错误 | D |
| pages/onboarding/index | 3屏 swiper、跳过/开始 | 静态；没有已读持久化，每次普通登录入口都会先跳此页 | D |
| pages/notification/list | 通知分页、单条/全部已读、跳餐单 | 无通知、loading 变量、加载更多；无独立错误 | B |
| pages/ai/recipe-gen | 食材、餐段/口味/难度 picker、说明、生成/存菜谱 | loading/saving；无结果隐藏；异常 toast | D |
| pages/ai/recommend | 餐段、偏好、推荐/保存 | 初始与空推荐提示共用、loading；异常 toast | D |
| pages/ai/nutrition | 多菜勾选、营养分析 | loading 未展示、analyzing 按钮；异常 toast，无明确空菜谱态 | D |
| pages/ai/weekly-plan | 偏好、人数步进、一周计划 | 未生成/空结果共用提示、loading；异常 toast | D |

### 3.1 全部独立组件和 UI 基础

- `components/custom-tabbar.vue`：B，4 个固定 Tab 和 urlMap；调整 Tab 必须同时改 pages.json、组件、所有 switchTab 入口。
- `components/guest-placeholder.vue`：A 级局部复用候选，支持 icon/title/desc/actionText 和登录跳转；但整页不因此成为 A。条件编译双 actionText 被当前 lint 报重复键，需 Codex-01/03确认检查器处理方式，不能宣称无条件可交付。
- 实际使用 15 种 WOT 标签：wd-button、wd-cell、wd-cell-group、wd-checkbox、wd-icon、wd-input、wd-popup、wd-rate、wd-search、wd-switch、wd-tab、wd-tabbar、wd-tabbar-item、wd-tabs、wd-textarea。可作基础控件候选，控件库全量目录不是项目自研组件清单。
- 原生主要控件：view/text/image、scroll-view、swiper/swiper-item、input/textarea、picker、canvas。图片预览/选相册由平台接口打开。
- 日期/时间 picker、图片预览、通用输入、安全区、卡片布局可参考；餐单栏、份量选择、逐菜处理、调整对比、亲亲回馈均没有独立组件。

### 3.2 全部显式弹层/系统交互入口

全局：App 隐私同意、登录守卫、家庭守卫。登录：协议确认。家庭：创建成功、改名、退出。餐单：选菜底部浮层、时间 picker、拒绝原因、取消原因、评价浮层、上菜选图/预览。菜谱：删除确认、编辑选图、详情图集。时间线：回复浮层、回复/删除操作菜单、删除确认；补记日期/选图/预览。个人：退出登录、头像来源菜单、默认头像浮层、头像相册/相机、H5 绑定冲突、打赏撤回、徽章保存相册菜单。聊天：表情展开、消息图片预览；不是独立亲亲动画。AI：生成页3个 picker、推荐页餐段 picker。首页“推荐弹窗”注释对应实际可关闭的内联推荐卡，不算模态弹窗。

31 页没有统一 Empty/Loading/Error 组件；没有发现专门断网页、失败重试页或全局骨架组件。逐文件导入、表单绑定、标签、状态条件与行号已生成 `source-inventory.json`，作为以上人工分类的可复查明细。

## 四、可直接复用页面

整页 A=0。没有任何一页在固定角色、亲亲语义、数据契约与真机验证方面满足“原样直接交付”的证据。可保留的主要是通用输入、图片预览、卡片、空态布局、时间格式函数等局部结构；后续仍须经过权限与异常回归。

## 五、修改后复用页面

16 个 B 页见总清单。重点改造范围仅提出、不实施：

- 首页/菜单：妻子以菜品浏览为主，丈夫以待办为主；移除随机/AI/币/成就入口；区分空菜单、搜索无结果、网络失败。
- 菜谱详情/编辑：增加分类、独立亲亲价格（默认1）、预计耗时、简单介绍、可选主要食材；旧 difficulty 与 mealTags 不能冒充这些字段；仅丈夫显示并获授权维护正式菜单。
- 创建餐单：复用 items、单菜 customNotes、整单 customerNotes；新增明确日期/餐次/时间和分量；移除厨师自由选择；不能把未保存菜名塞进 recipeId。
- 餐单详情/历史：复用快照、备注、卡片和图片；四主状态与协商子流程需契约支持；去掉爱心币奖励、额外备菜点击和强制拍照假设；补动作防重与失败恢复。
- 登录/家庭/我的/协议/通知：简化引导，固定身份，不以性别或创建者身份自动当厨师；保留家庭隔离、站内通知、必要账户及说明入口。

## 六、建议删除页面和功能

“删除”均指未来任务审批后的第一版范围建议，本轮零删除。

| 范围 | 实际发现 | 路由/组件/API 影响 |
| --- | --- | --- |
| 爱心币、账本、签到、撤回 | 有独立页、首页/我的入口、历史奖励、月报指标；聊天能展示打赏 | 删除 love-points 路由与入口，梳理 love-point.js、business-config、labels、rating/cron；不能仅改名称为亲亲 |
| 等级/成就 | chef-level、achievements、我的指标、首页入口、通知类型、分享画布 | 删对应路由/入口，移除 achievement API、share-card、相关通知开关；后端触发交 Codex-01处理 |
| 复杂聊天 | order/chat、chat/list、App 全局消息、chat-unread、AI streaming | 删详情/首页入口，清理监听与 chat-active；先确保站内业务通知不被一起删；不能直接全删 ws.js |
| AI | 4个独立页 + 聊天助手 | 清理首页入口、ai.js、ai:stream；不是菜单外菜品功能的替代实现 |
| 月报/时间线/补记 | 月报 D；时间线、补记 C | 建议第一版隐藏，历史走 order/history；Tab 调整联动 custom-tabbar/pages.json；图表依赖交 Codex-01审批 |
| 引导/H5绑定 | onboarding、bind-credentials | 移除登录强跳引导和个人页 H5 入口；需同步登录返回路径，不能留下失效 redirect |
| 反馈 | C，非当前核心流程 | 如第一版不开放，关于/协议中的反馈引用也要改；不擅自删除用户数据权利入口 |
| 排行榜 | 无独立排行路由/API；月报有“最常做/谁更辛苦”对比 | 随月报移除，不虚构已有排行模块 |
| 社区 | 未发现公共社区页面；家庭时间线不等于社区 | 不增加社区，也不误删家庭记录数据 |
| 商业支付/充值/配送/收货地址/商家 | 在小程序页面、API及调用扫描中未发现实现；无 requestPayment | 不虚构删除清单；爱心币与商业支付应分开描述 |
| 管理后台入口 | 仓库有独立 admin；小程序未发现 admin 导航入口；有公开配置依赖 | 不动 admin；不能因没有入口就认为不依赖后台配置 |

## 七、妻子端第一版页面地图

以下均为“建议，待需求确认”的页面组织，不是新需求冻结。15 个要求不必做成15个独立路由。

| 需求入口 | 建议落点 | 复用与缺口 |
| --- | --- | --- |
| 1 首页/菜品列表 | 妻子首页复用 menu 列表，顶部当前餐单 | B；缺跨页已选状态 |
| 2 搜索和分类 | 列表内搜索/分类栏 | 搜索 B；正式菜品分类 E，mealTags 不等于分类 |
| 3 菜品详情 | recipe/detail | B；新增亲亲价、耗时、份量入口 |
| 4 已选餐单 | 底栏展开摘要→order/create | create B；跨页餐单栏 E |
| 5 日期/餐次/预计开饭时间 | 已选餐单顶部表单 | 时间控件 B；日期/餐次 E；不能沿用隐式顺延明天 |
| 6 单菜分量/备注 | 已选条目编辑 | customNotes B；小/正常/大 E |
| 7 整单备注 | 已选餐单表单 | customerNotes B |
| 8 菜单外想吃 | 专用简短表单，再关联本餐单 | E；菜名/图片/参考链接；不自动入正式菜谱 |
| 9 餐单详情 | order/detail | B；快照、菜列表、角色操作 |
| 10 待确认调整 | 详情内醒目调整区/对比层 | E；版本、变更内容和妻子确认 |
| 11 做饭进度 | 详情内四阶段展示 | B骨架/E四状态语义适配；不是增加四张页面 |
| 12 上菜后送上亲亲 | 已上菜详情主按钮+轻动画 | E；不复用 tip 或余额接口 |
| 13 历史餐单 | order/history | B；移除币奖励与角色切换筛选，展示餐日/餐次 |
| 14 评价入口 | 已上菜详情次操作 | 原整单星评浮层 B；粒度待定 |
| 15 家庭绑定 | login + family/setup | B；固定身份绑定方式待定 |

最小导航建议：“点菜 / 餐单 / 我们”。“餐单”可合并当前和历史；是否采用3个Tab由需求负责人确认，当前4个Tab不改。

## 八、丈夫端第一版页面地图

同样是建议，待需求确认；固定厨师身份由服务端决定，前端不提供角色切换。

| 需求入口 | 建议落点 | 复用与缺口 |
| --- | --- | --- |
| 1 最新待处理餐单 | 厨师首页待办卡/列表 | 首页B；若并行多餐单，现单个 activeOrder 不足 |
| 2 逐道接受或调整 | 餐单详情的条目操作 | E；现有 accept/reject 是整单 |
| 3 标记需要买菜 | 条目辅助标签 | E；与接受/拒绝分开展示 |
| 4 采购备注 | 详情内简短文本 | E；不用库存或采购模块 |
| 5 提议替换菜品 | 复用选菜浮层做候选选择 | C结构参考/E替换关联和版本 |
| 6 提交调整方案 | 详情底部动作 | E；提交后仍待确认，不冒充接单 |
| 7 接单 | 详情底部动作 | B；有调整时必须妻子确认后才正式接单 |
| 8 开始做饭 | 详情主操作 | B；与原 accepted→prepping→cooking 不一致 |
| 9 标记已上菜 | 详情主操作 | B；原实现至少一张图，是否保留强制规则待定 |
| 10 正式菜单管理 | 丈夫菜单页 | menu B；权限、分类、价格 E |
| 11 新增/编辑菜品 | recipe/edit | B；按已确认字段简化，无AI/批量导入 |
| 12 图片上传 | 编辑表单内拍照/相册 | B；上传进度、防重复、部分失败/重试须补 |
| 13 历史餐单 | order/history | B；与妻子共享结构，操作按固定角色约束 |

最小导航建议：“待办 / 菜单 / 我们”；与妻子端可共享页面结构，仅按固定身份展示入口，不让用户切换身份。

## 九、关键交互建议

### 9.1 原流程与断点

实际原流程：游客首页→登录入口→3屏引导→微信登录/协议→家庭创建或邀请码加入→菜单→菜谱详情→点这道→创建餐单内再多选→整单提交→厨师整单接/拒→备菜→烹饪→至少1图上菜→整单星评→后端奖励币并完成→历史/时间线。

主要断点：登录未可靠保存原操作意图；菜单与创建页选菜重复且无共享草稿；仅选时分，过去时间自动变成明天；固定角色未实现；只能整单拒绝；没有逐菜调整、妻子确认和采购备注；详情停留期间没有订单状态事件订阅或轮询；上菜强制拍照；评价与币奖励强耦合；原后端“一家庭一活跃单”阻止并行安排未来餐次。

### 9.2 建议交互（均待确认，不实施）

1. 多菜共单：列表/详情加入同一份待提交餐单，单菜编辑分量和备注；底栏与确认页读取同一草稿。不得为每道菜单独创建餐单。
2. 底栏：显示“已选 N 道 · 共 X 个亲亲”和“查看餐单”。X 的汇总以最终条目/价格规则为准；份量是否影响价格、菜单外菜如何计入未确认时显示待确认，不能编造数字。
3. 亲亲价：菜卡名称旁或难度展示区域改为“1 个亲亲”等文字+轻图标；不用 ¥、余额、充值、付款、扣款。独立价格默认1是已确认规则，不沿用难度奖励公式。
4. 调整对比：保留“原点菜→建议调整”，逐条写替换/拒绝/份量或时间变化及原因；原始备注不被覆盖；未变项折叠。妻子看到完整新方案后确认当前版本，不能确认已过期方案。
5. 妻子确认：仅对服务器最新调整版本提交确认；等待时显示“等你确认调整”，主状态仍是待确认。不暗加“妻子确认后再让丈夫二次接单”的点击规则。
6. 需要买菜：用辅助标签和说明“可以做，需要买菜”，不同于“今天做不了”；不得红色拒绝样式，也不得因此让妻子无法点全部菜品。采购备注可见范围待确认。
7. 四状态：文字+图标+当前步骤同时区分“待确认/已接单/做饭中/已上菜”，不用纯颜色。协商提示归待确认，避免增加日常状态按钮。
8. 送上亲亲：已上菜后妻子点击，建议短暂淡入上浮亲亲/心形与一句感谢，不整屏轰炸、不强制音效、不接入币余额；重复触发与持久化规则待定，至少操作请求应防重。
9. 通知降级：优先保证站内待办/未读角标/餐单变化提示；回到前台重新取服务端状态，页面提供手动刷新及失败重试。订阅拒绝/不可用不阻断下单；轮询或实时策略交 Codex-01决定，不自行新增复杂聊天。
10. 手机录入20～30菜：单页短表单，显示必填项和保存结果，照片上传状态与菜品保存分开；复用上传功能但补部分失败反馈。不加入批量导入、AI识别、链接自动解析。

## 十、接口和后端耦合问题

### 10.1 核心页面依赖矩阵

所有 API 默认基址 `http://localhost:3000/api/v1`，可由 VITE_API_BASE_URL 覆盖。除公开配置/登录外均按原鉴权链路读取本地 Token。仅隐藏按钮不是服务端权限实现。

| 页面/区域 | API及主要字段 | 登录、全局状态、图片/实时耦合 |
| --- | --- | --- |
| 首页 | GET families/me、orders/active、notifications/unread-count；可选 recipes/random；family.name、items[].recipeSnapshot、status、myRole、expectedServeAt、count | auth/family/activeOrder/chatUnread；App全局WS；头像/菜图URL；原单活跃单逻辑 |
| 菜单/搜索 | GET recipes：page/pageSize/search/mealTags/onlyFavorites；items/total、id/name/imageUrls/difficulty/orderCount/avgRating/isFavorited | auth/family；无页面WS；图片URL；分类不是mealTags |
| 菜谱详情 | GET recipes/:id；POST/DELETE favorite；DELETE recipe；同上加flavorTags/notes | 登录/家庭守卫；无厨师权限判断；图片图集；编辑删除后端只查同家庭 |
| 菜谱编辑 | GET/POST/PATCH recipes；name/imageUrls/difficulty/mealTags/flavorTags/notes | family；POST storage/upload category=recipe；无kissPrice/预计耗时/正式分类字段 |
| 创建餐单 | GET recipes(pageSize100)、家庭成员；POST orders；chefUserId、items[{recipeId,customNotes}]、customerNotes、expectedServeAt | auth/family/config；页面本地form；无WS，无跨页草稿；原后端禁止同时存在活跃单 |
| 餐单详情/厨师操作 | GET orders/:id；accept/reject/prepping/cooking/serve/cancel/rating；myRole/status/items快照、备注、servedImageUrls、rating | auth/activeOrder；category=order-served上传；无订单状态WS监听；原上菜至少1图 |
| 历史 | GET orders(page/pageSize/role/statuses)；items/total、createdAt、myRole、totalLovePoints | 本地分页，无显式页级守卫；依赖http鉴权；状态和币字段为原后端语义 |
| 登录 | POST auth/wx-login {code,gender} 或 password-login {phone,password,gender}；token/user/isNewUser；必要时PATCH users/me | auth持久化并connect WS；目前硬传male，与固定厨师身份无关 |
| 家庭绑定/设置 | families创建、me读取/修改、join、invite-code、leave；name/members/userId/role/myRole/status/inviteCode/expiresAt；users/me/notification-prefs | auth/family/config；creator/member不是点菜者/厨师；分享登录路径不携带自动绑定参数 |
| 我的/资料 | users/me读取/修改、chef-level；balance、achievements；nickname/avatarUrl/signature | auth/family/config；avatar上传；默认头像含DiceBear外链SVG，需网络/格式/授权检查 |
| 站内通知 | notifications列表/unread-count/:id/read/read-all；id/type/title/body/data.orderId/readAt/createdAt | 本地分页；无通知WS订阅；目前类型围绕接单、上菜、催菜、成就、纪念日，未覆盖新单/调整确认 |
| 新增协商/采购/亲亲/菜单外菜 | 原核心API没有完整对应输入、输出与动作 | E；不能临时塞入customNotes、消息或totalLovePoints；提交接口请求等待冻结 |

### 10.2 全部 API 文件目录与调用面

下列为客户端声明的调用面，不表示每个接口都已跑通，也不表示全部都有可见入口。

| api 文件 | 方法/路径 |
| --- | --- |
| http.js | GET/POST/PATCH/DELETE封装；15秒超时；非2xx toast；401清本地凭证并尝试auth.logout |
| auth.js | POST /auth/wx-login、/auth/password-login |
| user.js | GET/PATCH/DELETE /users/me；PATCH /users/me/credentials；GET /users/me/chef-level；GET/PATCH /users/me/notification-prefs |
| family.js | POST /families、/families/join、/families/me/invite-code、/families/me/leave；GET/PATCH /families/me |
| recipe.js | GET/POST /recipes；GET /recipes/random；GET/PATCH/DELETE /recipes/:id；POST/DELETE /recipes/:id/favorite |
| order.js | POST/GET /orders；GET /orders/active、/orders/:id；POST /orders/:id/{accept,reject,prepping,cooking,serve,cancel,rating} |
| storage.js | POST /storage/upload?category=...，uni.uploadFile；返回url/key/size/mimeType；多图逐张串行上传 |
| notification.js | GET /notifications、/notifications/unread-count；POST /notifications/:id/read、/notifications/read-all |
| message.js | GET/POST /orders/:id/messages；text/emoji/image/rush/tip；POST /orders/:id/messages/read |
| love-point.js | GET /love-points/balance、/love-points/logs；POST /love-points/logs/:id/reverse、/love-points/check-in |
| timeline.js | GET /timeline、/timeline/monthly-summary；POST /timeline/manual；PATCH /timeline/:id/{reply,hide,unhide}；DELETE /timeline/:id |
| achievement.js | GET /achievements/me、/achievements/family、/achievements/progress |
| feedback.js | POST /feedback |
| ai.js | POST /ai/recipes/{generate,save}、/ai/recommend、/ai/cooking-assistant/chat、/ai/nutrition/{analyze,weekly-plan} |
| business-config.js | GET /config/public，silent失败，Store保留默认配置 |
| ws.js | API主机派生WS地址，端口加1，JWT query；事件 family:member_left、order:message、order:messagesRead、ai:stream；最多3次重连 |

### 10.3 全部状态管理

| Store/全局模块 | 内容与风险 |
| --- | --- |
| auth | token/user持久化；登录启动WS、退出关闭WS。没有固定妻子/丈夫的权威身份字段 |
| family | family/loading、members、myRole、isCreator；refresh失败设null，可能把网络失败误判未绑定 |
| active-order | 单个order/loading；refresh失败设null；不支持多待办集合 |
| business-config | 爱心公式、限额、时间规则、模板ID、默认头像；请求失败使用内置默认；不能直接沿用旧公式 |
| chat-unread | 内存Map<orderId,count>，无持久化；聊天列表拉服务器未读数补齐；删除聊天时清理依赖 |
| chat-active（非Store） | 当前聊天orderId模块变量，App据此抑制消息toast；离开聊天后清除 |
| 页面局部状态 | items、page、loading、form、dialogs等；无统一错误/提交状态；部分退出流程未清activeOrder/chatUnread，需回归跨账号缓存 |

### 10.4 需要 Codex-01 统一处理的适配缺口

- 权限：菜谱服务只校验家庭归属；前端菜单/详情向双方开放新增、编辑、删除。必须服务端落实固定角色，不能仅前端隐藏。
- 餐单数据：缺显式餐日/餐次、份量、逐菜处理结果、采购备注、替换关联、协商版本、妻子确认、菜单外请求、亲亲价格快照/送出记录。
- 状态：原服务明确 accepted→prepping→cooking；不能只隐藏prepping按钮就期望cooking接口成功。accept可收expectedServeAt，但现UI未暴露，也不是妻子确认方案接口。
- 价格：原totalLovePoints是完成评价后按难度和星级生成的厨师奖励，不是菜品价格和本餐单亲亲总数；旧rating/cron/achievement链必须一起评估。
- 时序：原一家庭一活跃单限制与可选未来日期需求存在潜在冲突；并发多单是否允许由产品决定，不擅自改Schema。
- 通知：后端存在接单/上菜站内与微信通知代码，但前端无订阅授权调用；新单/调整/确认事件覆盖不足，详情不会原地同步状态。
- 图片：串行多图中途失败会丢失调用方已上传成功的结果；上传401不共用http登录失效处理；默认头像有第三方外链。需统一响应、授权、上传限制和失败策略。
- 工程：lint真实失败；原test/typecheck为空；Node20未验证；自定义Tab产物与平台行为待核查；公共配置与前端硬编码字段有漂移。

本轮已登记 `docs/frontend/INTERFACE_CHANGE_REQUEST.md`，只写能力缺口和待冻结项，未指定数据库结构或私自实现新API。

## 十一、修改文件列表

仅新增文档、审查脚本与证据：

1. docs/CODEX02_FRONTEND_REUSE_AUDIT_V0.1.md
2. docs/frontend/DECISION_REQUEST.md
3. docs/frontend/INTERFACE_CHANGE_REQUEST.md
4. docs/frontend/audit-source.cjs
5. docs/frontend/evidence/source-inventory.json
6. docs/frontend/evidence/probe-results.txt
7. docs/frontend/evidence/environment-and-http.txt
8. docs/frontend/evidence/install-locked-offline.txt
9. docs/frontend/evidence/build-mp-weixin.txt
10. docs/frontend/evidence/dev-mp-weixin.txt
11. docs/frontend/evidence/build-h5.txt
12. docs/frontend/evidence/dev-h5.txt
13. docs/frontend/evidence/lint.txt
14. docs/frontend/evidence/original-test.txt
15. docs/frontend/evidence/original-typecheck.txt

本地还生成 Git 忽略的 node_modules、.pnpm-store、mini-app/dist；不作为业务源码提交。上游仓库完整保留于独立子目录；原启动指令未移动/覆盖。最终 Git diff 验证 mini-app、backend、admin、packages、package.json、pnpm-lock.yaml 与基线无改动。

证据保真说明：原始终端日志保留命令输出的末尾空格和空行，因此全量 `git diff --cached --check` 会提示4处日志空白问题；未为通过空白检查而修改原始日志。报告、请求文档、审查脚本本身另行执行空白检查。

## 十二、需要产品负责人决定的问题

完整登记于 DECISION_REQUEST.md，未决定前不实现：

1. 是否允许同时安排多个未来餐单；同日同餐次重复提交如何处理。
2. 小/正常/大是否改变亲亲价；独立价格允许的数值范围及是否仅整数。
3. 送上亲亲按整餐一次还是逐菜；重复点击是否只重播、是否记录已送出（不引入余额或欠账）。
4. 妻子不接受调整、全部菜被拒绝、再次修改/过期方案时的协商结束方式。
5. 菜单外菜何时确定亲亲价格、是否先作为本餐单临时条目；正式收录仍由丈夫决定。
6. 评价整单还是逐菜；是否必填；是否取消原自动五星；不擅自沿用。
7. 采购备注仅丈夫还是双方可见；上菜照片是否可选。
8. 家庭创建/邀请绑定流程，以及初次固定身份如何绑定；不提供角色切换。
9. 首版分类选项，以及建议的3Tab组织、辅助时间线/反馈入口取舍。

## 十三、需要 Codex-01 或 Codex-03 配合的问题

Codex-01：确认共同基线哈希与Node/pnpm环境；审查第三方依赖/素材；提供可运行测试后端、测试家庭账号、图片服务与域名；冻结固定身份、餐单/条目/协商/亲亲/通知契约；处理状态机、奖励链和配置改动；本报告不是改后端授权。

Codex-03：在独立环境按本哈希复现安装/构建/lint；验证Node20与微信开发者工具导入、自定义Tab、真实AppID登录/隐私/订阅授权/图片上传；检查双用户固定角色、跨家庭隔离、重复保存、详情断网空白、退出缓存、单活跃单冲突、通知拒绝与调整过期。Mock/源码探测只作复现线索，不替代独立验收，当前不发布PASS。

产品负责人具体环境配合：提供或让Codex-01准备有效测试AppID与已配置的测试后端/图片地址；确保微信开发者工具已安装并提供路径，由本人登录工具及完成真机授权。AppSecret仅留后端本地配置，不在聊天或仓库提供明文。

当前状态：已完成（FK-C02-001全部当前可完成审查；真机/后端联调待环境）

对应分支：codex/02-frontend-audit

对应提交哈希：基线572f3e20fb2c2ae243013c0bdc3e05054c708745；交付提交见本文件Git历史及聊天回报

构建结果：微信生产/开发编译、H5生产构建/本机HTTP资源验证成功；未完成微信运行验收

测试结果：lint失败；原test/typecheck为空实现；审查脚本完成并复现问题；不代表业务PASS

待决策项：见第十二节与DECISION_REQUEST.md

需要其他员工配合：Codex-01冻结基线/契约并供环境，Codex-03独立复现/验收

下一步建议：由用户转交本报告给ChatGPT，等待第1阶段正式需求与任务单；本任务不进入业务开发。
