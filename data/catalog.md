# 数据目录

生成时间：2026-07-22T11:37:30.537Z  
Schema 版本：4

本文件由 `npm run data:summary` 从本机 SQLite 生成。只展示表名、行数和用途，不包含简历、JD、面试记录、Prompt 或 AI 输出正文。

| 数据表 | 当前行数 | 用途 |
|---|---:|---|
| `agent_runs` | 1 | 每次 AI/规则任务的输入、输出、模型、耗时和 Token 汇总 |
| `agent_steps` | 4 | Agent Run 内逐 Skill 的执行顺序、摘要、耗时与错误 |
| `app_snapshots` | 1 | 浏览器完整状态快照，用于首次迁移和恢复 |
| `application_stage_events` | 7 | 岗位阶段从旧状态到新状态的变更历史 |
| `artifacts` | 21 | 岗位分析、准备计划、求职信等可复用输出版本 |
| `eval_case_results` | 108 | 评测中每个样本的期望、实际结果和错误 |
| `eval_runs` | 7 | 一次评测的版本、通过数、总数与准确率 |
| `file_assets` | 0 | 简历、JD 图片、音频等原文件的元数据和存储索引 |
| `interview_questions` | 26 | 真实问题、回答、思路、缺口和 AI 反馈 |
| `interview_reviews` | 0 | 面试复盘的版本、准备快照、确定性指标和完整结构化结果 |
| `interview_sessions` | 14 | 各岗位的面试轮次、原始笔记和关联准备运行 |
| `jd_versions` | 7 | JD 原文和来源的不可覆盖历史版本 |
| `jobs` | 7 | 公司、岗位、业务线、当前投递阶段等岗位主记录 |
| `metric_events` | 4 | 迁移、同步和运行完成等可聚合事件 |
| `resume_versions` | 2 | 简历正文、项目材料及内容哈希的历史版本 |
| `resumes` | 2 | 简历主记录，不含每次修改的正文 |
| `schema_migrations` | 4 | 数据库迁移版本与执行时间 |

## 可量化成果

- `agent_runs` / `agent_steps`：成功率、耗时、Token、失败步骤。
- `eval_runs` / `eval_case_results`：按数据集版本追踪回归准确率和 badcase。
- `interview_sessions` / `interview_questions` / `interview_reviews`：比较面试前准备与真实问题覆盖率，追踪回答和证据准备度。
- `application_stage_events`：计算保存、投递、面试、Offer 等阶段转化。
- `resume_versions` / `jd_versions` / `artifacts`：比较每次迭代前后的输入和输出。

聚合结果见 [`metrics-snapshot.json`](./metrics-snapshot.json)，完整字段定义见 [`schema.sql`](./schema.sql)。
