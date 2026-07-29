# CareerPilot AI 架构

## 当前形态

系统采用混合架构：稳定的岗位诊断仍使用固定依赖链；开放自然语言任务先由确定性 Planner 生成一个或多个 Skill 的执行计划，再由 Runner 顺序执行并记录 Trace。

```text
Browser / 求职助手
        |
        v
POST /api/agent/run
        |
        +-- Zod 输入校验
        +-- Deterministic Planner
        +-- Dependency expansion
        +-- Agent Runner
              |
              +-- understand-job-industry
              +-- match_candidate_evidence
              +-- interview-retrospective
              +-- diagnose_interview_risks
              +-- generate_preparation_plan
              +-- coverletter-tailor
```

## 目录职责

```text
src/
├─ shared/
│  └─ skill-registry.js       # Skill 名称、版本与依赖关系
└─ server/
   ├─ app.js                   # 薄 HTTP 路由与启动入口
   ├─ agent/
   │  ├─ planner.js           # 意图识别和依赖展开
   │  └─ runner.js            # 执行、错误处理和 Trace
   ├─ schemas/
   │  └─ agent.js             # Agent API 的 Zod Schema
   ├─ data/
   │  └─ database.js          # SQLite Schema、版本化持久化与指标聚合
   ├─ tools/
   │  ├─ job-analysis.js      # 岗位诊断与准备 Skill
   │  ├─ interview-retrospective.js # 逐题复盘、准备对比和确定性评分
   │  └─ cover-letter.js      # Cover Letter 校验与本地兜底
   └─ services/
      ├─ career-service.js    # Prompt、模型调用、面试材料提取接口和兼容接口
      ├─ file-parser.js       # PDF、DOCX、TXT 的纯文件正文提取
      └─ data-service.js      # 无感迁移、状态同步和指标 API

evals/
├─ datasets/routing.json      # 人工标注的完整计划样本
└─ run-evals.js               # Exact Plan Accuracy

tests/
└─ agent.test.js              # 编排、证据边界、澄清与 Trace

public/
├─ index.html                 # 页面语义结构
└─ assets/
   ├─ styles.css              # 页面样式与响应式布局
   └─ app.js                  # 浏览器状态、交互、API 与本地兜底

skills/
├─ understand-job-industry/   # 岗位与行业理解契约、参考资料与报告校验器
├─ match-candidate-evidence/  # 候选人证据匹配契约
├─ interview-retrospective/    # 面试复盘、评分、集成契约与离线评分器
├─ diagnose-interview-risks/  # 面试风险和事实边界契约
├─ generate-preparation-plan/ # 下一轮准备计划契约
└─ coverletter-tailor/        # 求职信与投递文案契约

scripts/
├─ setup-*-key.ps1           # 本地环境配置辅助脚本
└─ snapshot-data.mjs          # 生成可读 Schema、数据目录和脱敏指标

data/
├─ catalog.md                 # 数据表用途与当前行数
├─ schema.sql                 # Schema v4 可读快照
├─ metrics-snapshot.json      # 聚合运行与评测指标
└─ careerpilot.sqlite         # 私有运行数据库，不提交 Git
```

## API

- `GET /api/health`：模型配置和架构状态，不返回 API Key。
- `GET /api/skills`：服务端 Skill 注册表。
- `POST /api/agent/run`：统一 Agent 入口。
- `POST /api/review-interview`：面试页面专用复盘入口，使用 `job / candidate / priorPreparation / interviewRound / previousRounds` 契约。
- `GET /api/data/bootstrap`：读取数据库中的最新状态快照；数据库为空时触发前端无感迁移。
- `POST /api/data/state`：保存状态快照，并拆分同步 Resume/JD/Interview/Artifact 版本。
- `POST /api/data/file`、`GET /api/data/file/:id`：保存和读取简历原文件、JD 图片及面试音频。
- `GET /api/metrics/summary`：读取 Run 成功率、耗时、Token 和核心数据量。
- 旧的 `/api/analyze-job`、`/api/role-understanding`、`/api/self-introduction`、`/api/cover-letter` 暂时保留，保证现有页面兼容。

Agent 响应不会回显完整简历，只返回字符数等输入摘要。Cover Letter 结果可能包含用户授权使用的证据片段。

## Trace

- 每次 Agent Run 生成唯一 `runId`、计划、总耗时和调用汇总。
- 每个 Tool 节点记录调用序号、执行模式、开始时间、耗时、输入摘要、输出摘要、状态与错误。
- Cover Letter 使用模型时记录 provider、model 和供应商返回的 usage；输入校验阻断时明确记录 `model.called=false`。
- 独立的“运行记录”页面仍缓存最近 30 次 Run，便于快速查看；服务端 SQLite 保存完整 `AgentRun`、`AgentStep`、输入快照和输出 Artifact，不受 30 条限制。
- 旧 `localStorage` 首次加载时自动保存为原始快照并拆分迁移，不向用户展示导入/导出入口。后续每次状态变化都会防抖同步到数据库，`localStorage` 仅作为页面缓存和数据库不可用时的回退。
- Trace 展示显式决策依据，不保存或展示模型隐藏思维链。

## 数据持久化

- 默认数据库：`data/careerpilot.sqlite`，使用 Node 内置 SQLite，启用 WAL 和外键约束；数据库文件不会提交到 Git。
- 原始文件按 SHA-256 去重保存在 `data/files/`，数据库记录文件类型、大小、哈希和业务关联；文件目录不会提交到 Git。
- `ResumeVersion` 和 `JDVersion` 按内容哈希去重。同一简历或 JD 内容发生变化时新增版本，不覆盖旧版本。
- 面试轮次和问题独立落表，保留原始记录、回答、思考、缺口、下一次回答和 AI 反馈。
- 统一 Agent API 和旧兼容 AI 接口都会在返回响应前落库，记录任务类型、输入、输出、Prompt/Skill/模型版本、耗时、Token、Trace 和错误。
- `Artifact` 保存岗位分析、准备计划、Cover Letter、自我介绍和各分析模块的历史版本。
- `MetricEvent` 记录迁移、同步和 Agent Run 完成事件；聚合 API 不读取简历正文。
- 岗位状态变化写入 `ApplicationStageEvent`，可直接计算当前投递漏斗和阶段转移。
- 浏览器离线评测与 `npm run eval` 都会写入 `EvalRun/EvalCaseResult`，保留数据集版本、逐样本结果和历史准确率。
- 每轮面试首次创建时保存 `preparationSnapshot`；如果只能在首次复盘时补存，则降低对比置信度，避免把事后改写当成面试前准备。
- `InterviewReview` 独立版本表保存每次有效复盘、确定性指标和所用准备快照；重跑不覆盖旧版本。
- `npm run data:summary` 会从当前数据库刷新 `catalog.md`、`schema.sql` 和 `metrics-snapshot.json`；聚合快照不读取或导出求职正文。

## 运行边界

- Planner 是确定性规则，不是模型自主 Function Calling。
- 主诊断链依然是固定 Workflow，保证结果稳定和便于回归。
- `understand-job-industry` 已替代旧 JD Parser。当前服务端先执行可确定验证的 JD 理解阶段，并明确标注尚未完成公开资料检索；公司定位、竞品、价格、规模、政策等事实不能由 JD 推断冒充。
- 面试记录作为新的事实输入：系统会对照准备阶段的预测，计算问题覆盖情况、提取岗位信号，并把差异转成下一轮准备动作；该覆盖率不是通用模型准确率。
- `interview-retrospective` 可独立处理只有问题、没有完整回答或没有准备快照的稀疏记录：对应分数返回 `null`，不会伪造为 0 分。
- “准备覆盖/准备质量/准备效果”属于复盘评测语义，不触发 `prepPlanner`；只有明确要求制定计划或下一步行动时才串联准备链路。
- 有模型 Key 时 Cover Letter 可使用模型生成；无 Key 时使用本地事实约束兜底。
- 请求体默认限制为 8 MiB，可通过 `MAX_JSON_BODY_BYTES` 调整。

## 下一阶段

1. 继续把 `public/assets/app.js` 的状态、API 和视图逻辑拆成独立 ES Modules。
2. 把旧浏览器端 Skill 实现迁移到共享模块，删除前后端重复口径。
3. 增加模型 Planner/Function Calling 实验，但保留确定性 Planner 作为 fallback。
4. 将当前本地原文件存储升级为可配置对象存储，并增加敏感字段加密和数据保留策略。
5. 增加鉴权、限流、精确成本计价、人工采纳反馈和线上任务完成率。
