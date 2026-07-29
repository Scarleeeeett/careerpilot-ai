# CareerPilot 文件地图

以下说明覆盖业务代码、配置、文档、测试和运行数据；不展开 `node_modules/` 与 `.git/` 内部文件。

## 根目录

| 文件 | 用途 |
|---|---|
| `.env` | 本机真实环境变量与 API Key。已被 Git 忽略，不能提交或分享。 |
| `.env.example` | 可公开的环境变量模板，不包含真实密钥。 |
| `.gitignore` | 定义依赖、密钥、数据库、原始附件和备份等不应提交的文件。 |
| `package.json` | 项目元信息、依赖和 `start/dev/test/eval/data:summary/check` 命令。 |
| `package-lock.json` | 锁定 npm 依赖的精确版本，保证安装可复现。 |
| `README.md` | 项目入口说明、能力边界、运行方法与关键文档链接。 |
| `server.js` | 极薄启动入口，只加载 `src/server/app.js`，保持 `npm start` 稳定。 |

## 前端 `public/`

| 文件 | 用途 |
|---|---|
| `public/index.html` | 页面语义结构与表单、容器、导航节点，不再内嵌大段 CSS/JS。 |
| `public/assets/styles.css` | 全站视觉样式、响应式布局和可访问性状态。 |
| `public/assets/app.js` | 浏览器交互、页面状态、本地缓存、数据库同步、API 调用和本地兜底 Workflow。 |

## 服务端 `src/`

| 文件 | 用途 |
|---|---|
| `src/server/app.js` | HTTP 服务器、路由表、健康检查和静态文件入口。 |
| `src/server/agent/planner.js` | 确定性意图识别、Skill 选择和依赖展开。 |
| `src/server/agent/runner.js` | 按计划执行 Skill，生成 Run 汇总和逐步骤 Trace。 |
| `src/server/data/database.js` | SQLite Schema、迁移、版本化数据、原文件索引、Run/Eval/指标持久化与备份。 |
| `src/server/schemas/agent.js` | `/api/agent/run` 与 `/api/review-interview` 的 Zod 输入校验、旧 Skill key 兼容迁移和错误格式化。 |
| `src/server/services/career-service.js` | 模型调用、Prompt、简历解析、统一 Agent API 和旧兼容接口。 |
| `src/server/services/data-service.js` | 浏览器状态无感迁移、状态同步、文件上传下载和指标 API。 |
| `src/server/services/file-parser.js` | 纯文件解析模块，供简历与 Word 面试记录复用，不初始化数据库或模型。 |
| `src/server/tools/job-analysis.js` | 岗位理解、候选人证据匹配、风险诊断和准备计划实现。 |
| `src/server/tools/interview-retrospective.js` | 逐题复盘、回答/证据评分、准备语义匹配、岗位信号、下一轮计划和确定性指标。 |
| `src/server/tools/cover-letter.js` | Cover Letter 输入校验、真实证据约束和本地兜底生成。 |
| `src/shared/skill-registry.js` | 前后端共享的 Skill 名称、版本、用途和依赖关系注册表。 |

## Skill 契约 `skills/`

每项运行时能力现在都有独立的 `SKILL.md` 与 Agent 展示配置，注册路径位于 `src/shared/skill-registry.js`。

| 文件 | 用途 |
|---|---|
| `skills/match-candidate-evidence/SKILL.md` | 将真实简历与项目证据映射到 JD，区分强匹配、可迁移项与缺口。 |
| `skills/match-candidate-evidence/agents/openai.yaml` | 候选人证据匹配 Skill 的展示名称、简介与默认调用提示。 |
| `skills/interview-retrospective/SKILL.md` | 新面试复盘 Skill 主契约：四种模式、输入保存、逐题复盘、岗位更新、准备审计和下一轮输出。 |
| `skills/interview-retrospective/agents/openai.yaml` | 面试复盘 Skill 的展示与默认调用配置。 |
| `skills/interview-retrospective/references/runtime-chain.md` | 手动、导入、多轮、重跑触发条件，状态机、运行阶段、持久化和回退规则。 |
| `skills/interview-retrospective/references/careerpilot-contract.md` | CareerPilot 的完整输入、输出、准备快照和复盘历史数据契约。 |
| `skills/interview-retrospective/references/review-rubric.md` | 问题分类、回答/证据 0–4 分、准备状态、缺口和产品学习标签口径。 |
| `skills/interview-retrospective/scripts/score_review.py` | 离线确定性评分与 Node 运行时评分的校验脚本。 |
| `skills/diagnose-interview-risks/SKILL.md` | 定义高概率追问、证据风险、表达边界和缺失材料的输出契约。 |
| `skills/diagnose-interview-risks/agents/openai.yaml` | 面试风险诊断 Skill 的展示与默认调用配置。 |
| `skills/generate-preparation-plan/SKILL.md` | 将岗位、证据、风险和反馈转换为下一轮面试准备任务。 |
| `skills/generate-preparation-plan/agents/openai.yaml` | 面试准备计划 Skill 的展示与默认调用配置。 |
| `skills/coverletter-tailor/SKILL.md` | Cover Letter、BOSS 招呼语、邮件或内推文案的输入、输出、隐私和证据边界。 |
| `skills/coverletter-tailor/agents/openai.yaml` | 投递文案 Skill 的展示与默认调用配置。 |

### `skills/understand-job-industry/`

| 文件 | 用途 |
|---|---|
| `SKILL.md` | 岗位与行业理解 Skill 的主入口、执行规范和资源路由。 |
| `agents/openai.yaml` | Skill 的 OpenAI Agent 展示与调用配置。 |
| `references/input-and-routing.md` | 输入字段、任务类型和路由规则。 |
| `references/execution-pipeline.md` | 分阶段执行顺序、停止条件和质量门。 |
| `references/format-contract.md` | 结构化输出字段与格式约束。 |
| `references/output-template.md` | 最终岗位研究报告模板。 |
| `references/evidence-rules.md` | 事实、推断、未知项和证据强度规则。 |
| `references/search-protocol.md` | 外部检索顺序、来源选择和引用要求。 |
| `references/research-framework.md` | 行业、公司、业务和岗位研究框架。 |
| `references/product-comparison.md` | 竞品比较维度和禁止无证据排序的规则。 |
| `references/role-and-interview.md` | 岗位映射、面试重点和候选人准备规则。 |
| `references/terminology.md` | Agent、Function Call、Skill 等术语口径。 |
| `references/worked-example.md` | 一份完整输入到输出的参考案例。 |
| `scripts/validate_report.py` | 校验岗位研究 Markdown 是否满足格式和证据要求。 |

## 评测与测试

| 文件 | 用途 |
|---|---|
| `evals/datasets/routing.json` | 人工标注的 Planner 标准执行计划数据集。 |
| `evals/run-evals.js` | 运行 Exact Plan Accuracy，并把 EvalRun/逐样本结果写入数据库。 |
| `tests/agent.test.js` | Planner、证据边界、Trace、新复盘输入/输出、稀疏上下文、准备评分和旧 key 兼容测试。 |
| `tests/database.test.js` | 旧状态迁移、复盘版本表、Run/Artifact、文件资产和备份的数据库测试。 |

## 脚本 `scripts/`

| 文件 | 用途 |
|---|---|
| `scripts/setup-openai-key.ps1` | 交互式写入 OpenAI 本地 `.env` 配置。 |
| `scripts/setup-deepseek-key.ps1` | 交互式写入 DeepSeek 本地 `.env` 配置。 |
| `scripts/snapshot-data.mjs` | 从当前 SQLite 生成 Schema、数据目录和不含正文的指标快照。 |

## 文档 `docs/`

| 文件 | 用途 |
|---|---|
| `docs/README.md` | 文档导航入口。 |
| `docs/product.md` | 产品定位与设计原则。 |
| `docs/architecture.md` | 技术架构、API、Trace 和数据持久化说明。 |
| `docs/evaluation-and-badcases.md` | 评测定义、badcase 和修复记录。 |
| `docs/interview-script.md` | 项目面试讲解材料。 |
| `docs/file-map.md` | 当前这份逐文件职责地图。 |
| `docs/assets/screenshots/bytedance-analysis.png` | 从当前数据库加载的字节跳动岗位分析页截图。 |
| `docs/assets/screenshots/eval-lab.png` | 当前 Eval Lab 工程回归与路由评测截图。 |
| `docs/assets/screenshots/skill-center.png` | 完整展示 6 项能力，以及 `interview-retrospective` 的直接任务入口截图。 |
| `docs/assets/screenshots/interview-retrospective.png` | Word/音频材料入口、提取校对区、复盘执行器与缺失条件引导截图。 |
| `docs/assets/screenshots/quick-start-desktop.png` | 当前快速开始页桌面端截图。 |
| `docs/assets/screenshots/quick-start-mobile.png` | 当前快速开始页移动端截图。 |

## 开发工具配置

| 文件 | 用途 |
|---|---|
| `.impeccable/live/config.json` | Impeccable 实时设计检查配置，指向 `public/index.html`；不参与生产运行。 |

## 运行数据 `data/`

| 路径 | 用途 |
|---|---|
| `data/README.md` | 运行数据目录说明，可提交。 |
| `data/catalog.md` | 自动生成的 17 张数据表用途、当前行数和可量化指标入口，不含隐私正文。 |
| `data/schema.sql` | 自动生成的 SQLite Schema v4 可读快照；运行时源代码仍以 `database.js` 为准。 |
| `data/metrics-snapshot.json` | 脱敏聚合快照，包含 Run、投递漏斗、评测结果和各实体数量。 |
| `data/careerpilot.sqlite` | 主 SQLite 数据库，包含 JD/简历版本、面试、Run、Artifact、Eval 和指标；不提交。 |
| `data/careerpilot.sqlite-wal` / `-shm` | SQLite WAL 模式临时文件；服务运行时自动创建，不提交。 |
| `data/files/` | 新上传的简历原文件、JD 图片和面试音频，按哈希保存，不提交。 |
| `data/backups/` | 一致性 SQLite 快照备份，不提交。 |
