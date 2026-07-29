---
name: match-candidate-evidence
description: 将候选人的真实简历与项目证据映射到目标 JD，识别强匹配、可迁移证据和缺口。用于岗位匹配、简历诊断和面试素材选择，不预测录用概率。
---

# Match Candidate Evidence

## 输入

- 已结构化的岗位理解结果，包括岗位任务、能力要求和关键词命中。
- 候选人简历正文、项目材料、目标岗位和目标行业。

缺少简历和项目正文时，返回缺少证据，不凭空推断候选人能力。

## 执行

1. 从 JD 提取 AI、数据、用户、业务和交付等证据维度。
2. 只从候选人材料中寻找同维度的事实、行为和成果。
3. 区分直接匹配、可迁移匹配和待补证据。
4. 给出用于排序的规则覆盖分，清楚声明它不是录用概率或模型准确率。

## 输出契约

返回 `userProfile` 和 `fit`。`fit` 至少包含：

- `score`、`scoreDefinition`
- `requiredEvidenceDimensions`、`coveredEvidenceDimensions`
- `strongMatches`、`transferableMatches`
- `gaps`、`recommendedProjects`

## 证据边界

- 不把关键词出现等同于能力已被证明。
- 不补写候选人没有提供的项目、指标、工具或职责。
- 所有建议都应能回溯到 JD 或候选人原始材料。

## 依赖

先运行 `understand-job-industry`，再执行本 Skill。
