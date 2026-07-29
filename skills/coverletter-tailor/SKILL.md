---
name: coverletter-tailor
description: 根据目标 JD、候选人的真实简历或项目证据、投递渠道和到岗信息，生成不夸大的求职信、招聘平台招呼语或内推沟通文案。
---

# Cover Letter Tailor

## 何时使用

用于生成或缩短求职信、Boss/招聘平台招呼语、邮件正文和内推沟通文案。纯简历改写、没有目标 JD 的泛化自我介绍不属于本 Skill。

## 必需输入

- 目标岗位：公司、岗位名称和完整 JD。
- 候选人证据：选中的简历正文或项目材料。
- 输出选项：渠道和语言。
- 实习岗位还需要最早到岗日、每周天数和持续时长。

缺少 JD、候选人证据或必要的实习信息时，返回 `needs_clarification` 和 `blockingQuestions`，不生成看似完整的文案。

## 执行

1. 判断 JD 的角色重心。
2. 从候选人材料中选择最多三条相关证据，过滤联系方式等敏感行。
3. 保留原始责任强度，不放大为主导、上线、增长或商业结果。
4. 按渠道生成推荐版本和更短版本。
5. 附上取舍、阻塞问题和质量检查结果。

## 输出契约

成功时返回：`status`、`mode`、`channel`、`language`、`jdJudgment`、`selectedEvidence`、`recommended`、`shorter`、`tradeoffs`、`qualityChecks`。

需要补充信息时返回：`status: needs_clarification`、`blockingQuestions`，并将文案字段留空。

## 证据与隐私边界

- 只使用当前选中简历或项目中的真实事实。
- 不补写未确认的公司偏好、技能、指标、项目成果或可到岗时间。
- 不在生成内容中泄露身份证、电话、邮箱等不必要的个人信息。
- `selectedEvidence.sourceEvidence` 必须能回溯到输入材料。

## 依赖

运行时会复用岗位理解逻辑；此 Skill 可独立触发，但完整 JD 是硬性前提。
