# Worked example: ambiguous JD to HTML industry brief

## Input

```text
Company: 字节跳动
Role: AI 产品实习生，AI 创新业务
JD excerpts:
- 参与打造“超级 Agent”，可能独立负责部分链路
- 用户意图分类、负面案例归因、分类占比统计
- 场景梳理、理想态定义、Skill 定义
- 工具调用准确率、Function Call 参数提取、工具调用链路设计
- 熟悉 Coding Agent，并使用相关产品设计自己的 Agent
- 加分：理解开放平台运行逻辑和开发者需求
User request: 面试前做行业分析，输出 HTML
```

## Intake and ambiguity detection

```yaml
target_company: 字节跳动
target_business_line: unknown
business_line_status: unknown
target_role: AI 产品实习生
geography: 中国
depth: standard
output_format: html
format_source: prior_explicit
user_focus:
  - industry classification
  - Agent value chain and workflow
  - representative products and pricing
  - evaluation and terminology
  - interview preparation
```

The JD clearly identifies the Agent application layer, but not the named product, target customer, or business model. Competitor and economics research would differ for a consumer Agent, developer platform, Coding Agent, or enterprise Agent platform. Run the business-line clarification gate.

## Material follow-up

Ask one question:

> 这份 JD 对应的具体业务或产品你知道吗？例如通用 Agent、开发者 Agent 平台、Coding Agent 或企业 Agent 平台。如果招聘方没有透露，直接说“不知道”即可，我会按多分支口径分析。

Example user response:

> 具体不清楚。我猜与开发者和开放平台有关，TRAE 的可能性更大。

Record this as a user hypothesis. Do not change `business_line_status` to explicit. Do not expand “开放平台” into “开放内容平台” without another clue.

## Scope-hypothesis matrix

Use fit levels, not probabilities:

| Candidate scope | Fit | Supporting JD clues | Missing or contradictory evidence | Preparation implication |
|---|---|---|---|---|
| Developer-facing Agent platform | High | Skill, Function Call, API/tool chain, open-platform operations, developer and user perspectives | No named platform or external-developer statement | Research tool ecosystem, Skill supply, access, permissions, quality, and governance |
| TRAE or Coding Agent | Medium-high | Coding Agent is a dedicated requirement; user must design an Agent; evaluation chain is highly relevant | JD does not mention TRAE, IDE, repository, PR, or software-development workflow | Compare Coding Agents on the same repository task and prepare sandbox/test evaluation |
| Consumer general Agent | Medium | “Super Agent”, user behavior, intent classification, badcase attribution | Developer-platform requirement is unusually prominent for a pure consumer assistant | Prepare intent taxonomy, multi-step task completion, trust and approval design |
| Enterprise Agent platform | Medium | API, tools, evaluation, cross-functional delivery | No enterprise customer, solution, procurement, SLA, or private-deployment language | Prepare platform governance and cost, but label the branch as secondary |

This matrix narrows search priorities without pretending to identify the internal team.

## JD requirement map

| JD phrase | Explicit requirement | Product meaning | Likely deliverable |
|---|---|---|---|
| Intent classification and badcase attribution | Analyze user and failure data | Build a usable taxonomy and locate failure nodes | Label guide, badcase library, attribution report |
| Ideal state and Skill definition | Write strategy and requirement documents | Specify trigger, input, tools, steps, exceptions, permissions, and success | Scenario card, Skill Spec, AI PRD |
| Function Call evaluation | Evaluate model behavior in business tasks | Separate tool selection, parameter quality, execution, and end result | Eval Set, Rubric, regression report |
| Coding Agent experience | Deep product use and Agent building | Understand long tasks, terminal/file tools, validation, and safety | Same-task comparison, repository demo, trace review |
| Open-platform understanding | Consider developer and user needs | Understand two-sided supply, access, quality, versioning, and governance | Platform metric tree and developer journey |

## Research-question tree

Must answer:

1. Which industry layer does the role definitely belong to, regardless of product name?
2. Which product scopes remain plausible, and what evidence supports each?
3. How does an Agent move from intent to planning, tool execution, environment feedback, and evaluation?
4. Which ByteDance public capabilities provide context without proving team attribution?
5. Which Coding Agents are comparable on entry, function, price, usage model, task chain, and governance?
6. How should software scale replace the user's “产量” wording?
7. Which metrics and deliverables map directly to this intern role?

## Retrieval passes

```text
Entity: ByteDance AI innovation Agent product official
Model: ByteDance Seed Agent long-horizon multi-step official
Platform: Volcano Engine AgentKit Skill MCP trace evaluation sandbox official
Coding: TRAE pricing features cloud task SOLO custom agent official
Competition: Cursor GitHub Copilot Claude Code Codex official pricing features
Policy: China generative AI service rules AI-generated content labeling official
Role: Function Call evaluation tool selection parameter extraction Agent badcase
```

Search company-wide products as capability context, not as proof of business-line ownership. Put “company official claim” next to company-published adoption figures.

## Software product normalization

Do not use “产量” for Coding Agents. Use:

- Registered users and monthly active users when disclosed
- Paid seats, enterprise customers, completed tasks, cloud-task concurrency, API usage, or revenue
- Subscription, credits, priority calls, task concurrency, or consumption as pricing units
- `未披露` when the same scale metric is unavailable

Do not rank one product's disclosed monthly active users against another product's missing value. GitHub stars are ecosystem interest, not active usage.

## Intermediate models

- Classification: artificial intelligence → generative AI applications → AI Agent → developer platform or Coding Agent scenario
- Value chain: compute/models → Agent infrastructure, tools, APIs, sandbox, trace/evaluation → Agent product → developer/team/end user
- Agent workflow: intent → plan/Skill → tool selection → parameter validation → permission/approval → execution → feedback/recovery → trace/evaluation
- Economics: subscription or seat plus usage; variable cost includes model, tool/API, sandbox, storage, retries, and human handling
- Role map: user data → taxonomy/badcase → Skill and strategy document → cross-functional delivery → evaluation and regression

## HTML information architecture

Use four first-level navigation chapters and second-level anchors:

```text
岗位与业务
  核心结论 / 业务归属 / JD 岗位映射
行业与产品
  行业产业链 / Agent 工作流 / 竞品定价 / 商业成本 / 安全治理
核心能力
  Agent 评测 / 专业术语
面试使用
  高频问答 / 反问 / 来源与限制
```

Keep only the current chapter expanded. Do not place every section in a flat sidebar. Keep volatile product prices, adoption claims, and source URLs in `research-data.js`; keep explanatory reasoning in `index.html`.

Use a restrained documentation visual system: one sans-serif family, one accent color, limited cards, no slogan hero, no decorative dashboard, and no wide shadow. Use tables for normalized product comparisons and disclosure components for terminology and interview answers.

## QA

Run:

```text
validate_report.py index.html --depth standard --role-required --jd-required
```

Then:

1. Render desktop and mobile views.
2. Verify chapter expansion, active second-level link, reordered content, table scrolling, glossary search, theme, and copy actions.
3. Check duplicate IDs, missing anchors, missing local data files, and page-level overflow.
4. Confirm the report labels the specific product and team as unresolved.
5. Remove temporary screenshots after visual inspection.
