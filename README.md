# CareerPilot AI 求职诊断 Workflow

这是一个面向海投场景的 AI 求职诊断原型。项目当前采用「固定 Workflow + 确定性 Agent Planner + 结构化模型输出 + 本地规则兜底」的混合架构，把岗位理解、候选人证据、面试准备、真实面试复盘和投递文案串成可观察、可迭代链路。

## 架构边界（面试口径）

- 当前已完成：固定 Workflow、6 个服务端可执行 Skill、统一 `/api/agent/run`、确定性多 Skill 任务规划、Zod 输入校验、节点 Trace、SQLite 版本化持久化、原文件存储、运行指标、工程回归与路由评测。
- 当前未完成：模型自主 Function Calling、模型 Tool 参数字段评测、身份认证、敏感字段加密和线上多用户指标。
- 因此应称为「求职诊断 Agent / Workflow 原型」，不要表述为已上线的超级 Agent 或多 Agent 系统。
- 代码由 Coding Agent 辅助实现；产品定义、链路拆解、Schema、评测标准和 badcase 归因需要由项目负责人解释和验收。

## 当前入口

- `public/index.html`：页面语义结构；样式和交互分别位于 `public/assets/`。
- `server.js`：仅负责加载应用，保持启动命令稳定。
- `src/server/app.js`：薄 HTTP 路由与启动入口。
- `src/server/services/career-service.js`：Prompt、模型调用、简历解析与旧接口兼容服务。
- `src/server/services/data-service.js`、`src/server/data/`：无感迁移、SQLite、文件资产、备份和指标。
- `src/server/agent/`：任务规划和 Agent 执行器。
- `src/server/tools/`：6 个 Skill 的服务端实现，包括 `interview-retrospective` 的逐题复盘与确定性评分。
- `skills/`：6 项运行时能力各自的 Skill 契约和 Agent 配置；`understand-job-industry` 另含研究规则、输出模板和校验脚本。
- `src/server/schemas/`：Zod 输入契约。
- `evals/`、`tests/`：独立评测数据与自动化测试。
- `scripts/`：本地环境配置辅助脚本。
- `data/catalog.md`、`data/schema.sql`、`data/metrics-snapshot.json`：可读的数据目录、Schema 和脱敏指标快照。
- `docs/`：产品、架构、评测、面试口径、截图和逐文件地图。

完整逐文件说明见 [`docs/file-map.md`](docs/file-map.md)，文档导航见 [`docs/README.md`](docs/README.md)。

## 当前 MVP 闭环

1. 上传个人资料 / 简历
2. 新增岗位并粘贴 JD
3. AI 拆解 JD
4. 生成岗位准备卡
5. 按渠道生成 Cover Letter / BOSS 开场白 / 内推自荐语
6. 面试前查看 Interview Brief
7. 面试后记录真实问题与回答，对照不可变的面试前准备快照进行逐题复盘
8. 将岗位新信号、准备遗漏和回答缺口写回下一轮准备与产品学习记录

## 当前状态

当前版本已经支持：

- 任务优先的快速开始：首页直接提交 JD、上传或粘贴简历，并多选当前目标
- 自动识别岗位基础字段，将快速开始材料沉淀为岗位和简历版本
- 执行前预览预计使用的能力，执行后查看实际 Skill 与完整运行记录
- 岗位增删改查
- SQLite 版本化保存，浏览器 `localStorage` 仅作缓存回退
- 资料库
- 本地 Workflow 分析
- 求职助手：用户可直接输入真实任务，由 Planner 自动选择并组合 Skill
- 能力说明：以用户语言说明 6 项 Skill 能做什么、何时使用和产出什么；面试复盘能力可直接跳转到任务入口
- 任务结果：直接标明本次用了哪些 Skill，并分项呈现结果
- 运行记录：页面缓存最近 30 次，数据库永久保存 Agent Run、Step、Trace、输入输出和 Artifact
- 简历原文件、JD 图片和面试音频按哈希持久化
- 投递状态事件、求职漏斗、Eval 历史和内部指标 API
- `coverletter-tailor`：JD/简历/到岗条件校验、渠道适配、真实证据选择与取舍说明
- `interview-retrospective`：从「求职项目 → 导入并复盘面试」或「能力说明 → 去复盘面试」进入；上传 `.docx` 后本地提取正文，上传音频后使用 OpenAI Speech-to-Text 转写，再自动重建问答、校对并运行 Quick/Full/CareerPilot Evaluation/Cross-round 复盘
- 浏览器端 16 条工程回归 + 15 条单标签路由 baseline
- 服务端 12 条自动化测试 + 14 条 Planner 精确计划评测
- 可选真实 OpenAI API 分析

## 当前评测口径

1. 16条工程回归：本地函数布尔断言，不是模型准确率。
2. 15 条浏览器规则路由评测：人工标注单个标准 Skill Key；其中组合任务仍作为单标签 baseline 的已知失败，以 Eval Lab 实际运行结果为准。
3. 14 条服务端 Planner 精确计划评测：同时验证组合意图、依赖展开及“评估准备覆盖”不会误触发准备计划；当前为 14/14，以 `npm run eval` 为准。
4. 当前没有评估模型 Function Call 参数提取，不能把规则路由结果表述为模型 Tool Calling 准确率。
5. 原组合意图 badcase 已在确定性 Planner 层修复；这不代表模型自主 Function Calling 已完成。

## 开发与验证

```powershell
npm test
npm run eval
npm run data:summary
npm run check
```

详细结构与边界见 [`docs/architecture.md`](docs/architecture.md)。

运行记录只展示可审计的计划、Skill 调用参数摘要、结果、耗时、错误和模型用量，不记录模型隐藏思维链。完整输入版本、Agent Run、Step、Artifact 和指标事件会保存到本地 SQLite；浏览器 `localStorage` 只作为快速缓存和服务不可用时的回退。旧浏览器数据会在首次加载时无感迁移，不提供面向用户的 JSON 导入/导出入口。

数据库默认位于 `data/careerpilot.sqlite`，数据库文件已加入 `.gitignore`。内部指标可通过 `GET /api/metrics/summary` 查询；也可运行 `npm run data:summary` 生成不含简历、JD、面试正文和 AI 输出正文的可读快照。

## 启动方式

在当前目录运行：

```powershell
npm start
```

然后打开：

```text
http://localhost:8787
```

## 启用真实 API

设置环境变量后再启动：

```powershell
$env:OPENAI_API_KEY="你的 API Key"
npm start
```

可选指定模型：

```powershell
$env:OPENAI_MODEL="gpt-4o-mini"
npm start
```

如果没有设置 API Key，前端会自动回退到本地 Workflow 分析。
