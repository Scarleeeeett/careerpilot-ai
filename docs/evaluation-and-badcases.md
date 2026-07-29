# CareerPilot AI：评测口径与 Badcase 记录

## 1. 当前评测边界

当前版本有三类评测对象：浏览器端本地函数工程回归、旧单标签关键词路由 baseline，以及服务端确定性 Planner 的精确计划评测。它们都不是线上真实用户效果，也不是大模型综合能力评测。

固定链路：

```text
Understand Job & Industry -> Profile Matcher -> Risk Diagnoser -> Prep Planner
```

### A. 工程回归：16 条

通过直接调用本地函数并执行预定义布尔断言，覆盖三类互斥维度：

1. 信号识别：AI、数据、用户、交付关键词是否进入正确分类。
2. 证据约束：空资料是否保持 0 分、不虚构项目、暴露缺失证据。
3. 链路完整：4 个节点是否执行成功，Trace 是否包含状态、耗时和错误字段。

### B. 浏览器单标签规则路由：15 条

- 样本来源：人工构造的典型求职任务。
- 标注方式：每条任务人工标注一个标准 Skill Key。
- 判定方式：规则路由结果与标准 Skill Key 精确匹配。
- 预期结果：组合任务保留为单标签规则的已知失败，以 Eval Lab 实际运行结果为准。
- 唯一失败：组合任务“分析这份 JD，然后生成准备计划”被路由为单个 `prepPlanner`，标准答案应是多 Skill 任务规划。
- 限制：该结果只能称为关键词规则 Routing Accuracy baseline，不能称为模型 Tool Calling 准确率。

当前没有评估：模型回答正确性、Function Call 参数字段准确率、多次运行稳定性、Token 成本和真实用户任务完成率。

### C. 服务端 Planner：14 条

- 数据：`evals/datasets/routing.json`。
- 命令：`npm run eval`。
- 指标：完整执行计划 Exact Match，而不是只判断一个 Skill 标签。
- 当前结果以 `npm run eval` 为准；组合任务会补齐依赖并执行 `understandJobIndustry -> profileMatcher -> riskDiagnoser -> prepPlanner`。
- `interview-retrospective` 单独复盘不强制加载 JD/简历；“评估准备覆盖”不会因为“准备”二字误触发 `prepPlanner`。
- 限制：Planner 仍是确定性意图规则，不是模型 Tool Calling。

“规则证据维度覆盖分”的定义为：

```text
候选人资料覆盖的 JD 能力维度数 / JD 识别出的能力维度数
```

它只用于提示哪些能力缺少简历证据，不是录用概率、岗位匹配概率或模型准确率。

## 2. Badcase 01：空资料仍得到较高匹配分

- 低分维度：证据约束。
- 观察到的现象：旧版本的分数由基础分、JD 关键词数量和重合关键词共同组成。即使简历为空，只要 JD 中关键词较多，也可能得到较高分。
- Trace 归因：`profileMatcher` 的评分公式没有把“候选人证据”设为必要条件。
- 修改节点：Profile Matcher。
- 修改动作：删除固定基础分，改成“已覆盖能力维度 / JD 要求能力维度”；资料为空时项目列表为空，不再默认补入 CareerPilot AI。
- 复测指标：空资料证据覆盖分、虚构项目数。
- 预期变化：空资料证据覆盖分必须为 0；虚构项目数必须为 0。
- 当前状态：已修复，并加入 `empty_project`、`empty_score` 两条回归样本。

## 3. Badcase 02：组合意图不能动态选择并串联 Skill（Planner 层已修复）

- 低分维度：任务路由 / 组合任务完成度。
- 观察到的现象：用户提出“分析这个 JD，同时生成一段自我介绍”时，当前产品依赖页面按钮或预定义分析流程执行，模型不会自主决定调用哪些 Skill。
- Trace 归因：当前架构是固定 Workflow 或单次结构化模型生成，不存在动态 Function Calling 循环。
- 修改节点：Agent Orchestrator。
- 已完成动作：新增统一 `/api/agent/run`，确定性 Planner 可识别多个意图、补齐 Skill 依赖并顺序执行；缺少 Cover Letter 必填事实时返回澄清问题。
- 复测指标：Tool Routing Accuracy、必填参数完整率、组合任务完成率、正确澄清率。
- 预期变化：组合任务能按依赖关系串联多个 Skill；缺少 JD 或简历时不直接生成结论。
- 当前状态：旧单标签 baseline 保留组合意图 badcase；新 Planner 精确计划评测已覆盖岗位行业理解、组合任务和面试反馈链路。面试中应说明这是确定性 Orchestrator 修复，不能声称已经完成模型 Function Calling。

## 4. 数据与表述边界

- 当前可以说：接入 `understand-job-industry` 替代旧 JD Parser，并与个人证据匹配、面试反馈、风险诊断、准备规划和 `coverletter-tailor` 组成 6 Skill 链路；实现统一 Agent API、依赖感知的确定性 Planner、Zod 校验、节点 Trace、自动化测试与独立评测数据。
- 当前不能说：10/10 是模型 Tool Calling 准确率、已完成模型自主 Function Calling、服务真实用户、提升投递转化或完成线上 A/B test。
- 后续接入模型规划/工具循环后，才能正式评估模型工具选择、必填参数完整率与字段准确率。
