---
name: generate-preparation-plan
description: 将岗位任务、候选人证据、风险和真实面试反馈转成可执行的面试准备清单、一分钟自我介绍角度与面试简报。
---

# Generate Preparation Plan

## 输入

- 当前岗位与岗位理解。
- 候选人匹配和风险诊断。
- 可选的真实面试反馈。

## 执行

1. 优先吸收真实面试反馈中的下一轮行动。
2. 补充岗位相关的项目故事、业务研究、评测和自我介绍任务。
3. 控制任务数量，使结果可执行且能在后续面试中验证。
4. 标注是否使用过真实面试反馈及其覆盖率。

## 输出契约

返回：`todoList`、`oneMinuteIntroAngle`、`interviewBrief`、`prepSuggestions`、`basedOnInterviewFeedback`、`feedbackCoverage`。

## 质量要求

- 每个任务必须能映射到岗位要求、候选人缺口或真实反馈。
- 不以泛化学习计划替代本轮面试准备。
- 不把建议标记为“已完成”；完成状态应由用户或后续事件记录。

## 依赖

依赖 `understand-job-industry`、`match-candidate-evidence` 与 `diagnose-interview-risks`。
