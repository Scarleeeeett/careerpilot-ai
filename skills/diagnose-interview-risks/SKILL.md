---
name: diagnose-interview-risks
description: 根据 JD 理解和候选人证据缺口，识别高概率追问、表达风险、缺失证据与不可夸大的边界。用于面试前风险诊断。
---

# Diagnose Interview Risks

## 输入

- 岗位理解结果。
- 候选人匹配结果，尤其是证据缺口和规则覆盖分。

## 执行

1. 根据岗位任务生成可验证的高概率追问。
2. 将候选人缺口原样转入风险点，不重新编造画像。
3. 明确项目表述中不能越过的事实边界。
4. 列出回答关键问题仍缺少的材料。

## 输出契约

返回：

- `likelyQuestions`：可能被追问的问题。
- `riskPoints`：来自证据匹配的风险。
- `boundaries`：禁止夸大或混淆的边界。
- `missingEvidence`：需要补充的原始证据。

## 证据边界

- “高概率”是基于 JD 的准备优先级，不是招聘方行为预测。
- 没有真实上线、A/B test、增长或模型训练证据时，必须明确禁止这样表述。
- 风险诊断不能替代候选人的事实确认。

## 依赖

依赖 `understand-job-industry` 与 `match-candidate-evidence`。
