# Input and routing contract

## Contents

1. Triggering
2. Input schema
3. JD parsing
4. Follow-up decision
5. Routing

## 1. Triggering

Trigger explicitly when the user invokes `$understand-job-industry`.

Trigger implicitly when the request combines a company, industry, role, or JD with one or more intents below:

- “这家公司属于什么行业”
- “上下游是什么”或“产业链怎么分”
- “面试前快速了解这个行业”
- “帮我做行业调研／行业全景／赛道分析”
- “有哪些代表公司和产品”
- “比较价格、功能、销量、交付量或产量”
- “商业模式、TCO、单位经济怎么样”
- “这个岗位为什么需要这些行业知识”
- “根据 JD 看它负责哪条业务线”
- “把行业资料做成 Markdown／HTML”
- “更新已有行业研究”

Also trigger when the user supplies a JD, job-page URL, screenshot, PDF, or pasted responsibilities and asks for company, business, product, competitor, industry, or interview context.

Do not trigger for pure resume rewriting, generic career planning, stock recommendations, or a technical tutorial unrelated to a target company/role. A narrow term question may use the terminology rules without running a full report.

## 2. Input schema

Normalize the request into this intake card:

```yaml
target_company: required when company-specific
target_business_line: optional
business_line_status: explicit/inferred/unknown
target_role: optional for a narrow company question; required for role mapping
jd_text_or_url: optional
geography: inferred or asked when policy/market differs materially
seniority: intern/junior/experienced/unknown
research_date: current date
interview_date: optional
depth: quick/standard/deep/update
output_format: chat/markdown/html
format_source: current_request/prior_explicit/default
existing_artifact: optional file or folder
user_focus:
  - industry classification
  - value chain
  - product and competition
  - economics
  - policy and risk
  - role mapping
  - terminology
  - interview preparation
known_constraints: optional
clarification_log: optional
user_hypotheses: optional
```

Minimum viable input is one identifiable company, industry, product, or JD. Do not demand a JD for a narrow question such as “新石器属于什么行业”.

Preserve the latest explicit output-format preference across follow-up turns and iterations. If the user previously requested HTML and has not replaced that preference, keep `output_format: html`; do not fall back to Markdown merely because the latest message omits the format.

## 3. JD parsing

When a JD is present, extract a JD requirement map before research:

| Field | Extract |
|---|---|
| Company context | Company, department, product line, customer type, geography |
| Role identity | Standardized role family and seniority |
| Action verbs | Research, define, design, operate, sell, deliver, analyze, evaluate, coordinate |
| Owned objects | Product module, workflow, model, data, customer, market, project |
| Users and customers | Internal user, payer, operator, beneficiary |
| Technical nouns | Models, platforms, protocols, hardware, tools, data systems |
| Business nouns | Pricing, procurement, GTM, delivery, retention, cost, compliance |
| Metrics | Accuracy, latency, conversion, utilization, SLA, margin, deployment cycle |
| Interfaces | Algorithm, engineering, sales, operations, customer, supplier, regulator |
| Evidence expected | Portfolio, case, SQL, PRD, model eval, industry knowledge, communication |

Separate explicit requirements from inferences. Quote or paraphrase the JD evidence supporting each inference.

## 4. Follow-up decision

Ask a follow-up only when the answer changes research scope or output materially.

Ask when:

- The company name maps to multiple entities.
- The role could belong to materially different business lines.
- The JD link or attachment cannot be read and the role cannot be inferred.
- Geography changes regulation, competitors, or market definition.
- The user requests edits but the target artifact cannot be located.

Do not ask when:

- Depth is unspecified: use standard for interview preparation and quick for one narrow question.
- Format is unspecified: answer in chat; use Markdown for a saved report.
- The role is omitted in a company-only industry question.
- A reasonable assumption can be stated without distorting the result.

Ask at most three short questions in one turn. Continue safe research while waiting when possible.

### Business-line clarification gate

Run this gate after parsing the JD and before competitor, product, customer, economics, or policy research.

1. Set `business_line_status: explicit` only when the user or JD names the product, business line, customer type, or sufficiently specific workflow.
2. Set `business_line_status: inferred` only when several independent clues point to one scope. State the clues and confidence; do not present the inference as fact.
3. Set `business_line_status: unknown` when multiple materially different scopes remain possible.
4. When status is `unknown` and the user may possess the missing context, pause scope-dependent research and ask one concise question before producing the final artifact.

Preferred question pattern:

> 这份 JD 对应的具体业务或产品你知道吗？例如 [2–4 个基于现有证据的可能方向]。如果招聘方没有透露，直接说“不知道”即可，我会按多分支口径分析。

Do not ask the user to choose from speculative options as if one must be correct. The examples only help memory retrieval.

If the user answers “不知道” or confirms it was not disclosed:

- Continue with industry-level facts that are common across branches.
- Build a scope-hypothesis matrix before branch-specific research.
- For each branch, show `candidate scope → fit level → supporting JD clues → contradictory or missing evidence → research/interview implication`.
- Use qualitative fit such as `高／中高／中／低`; do not invent probability percentages.
- Separate branch-specific users, competitors, business models, workflows, and metrics.
- Label each branch as a scenario, not a conclusion.
- Put the missing business line in `Known unresolved facts`.
- Add targeted questions for the recruiter or interviewer.

If the user provides the business line, update the intake card and narrow all subsequent product, competition, economics, policy, and interview sections to that scope.

### User-hypothesis handling

When the user offers a guess such as “可能是 Coding Agent”:

1. Store it in `user_hypotheses`, not in confirmed company context.
2. Compare it against explicit JD clues and independent public evidence.
3. Show which parts are supported, unsupported, or contradicted.
4. Preserve the user's wording narrowly. Do not enrich “开放平台” into “开放内容平台”, or a product-category clue into a named product, without evidence.
5. Use the hypothesis to prioritize searches and interview questions, not to manufacture a team attribution.

## 5. Routing

- One narrow question → quick mode
- Company + role/JD + “面试/了解行业” → standard mode
- “全面/深入/产品定价产量/客户案例/TCO/政策” → deep mode
- Existing file + “更新/优化/补充” → update mode
- Only a term such as TCO, RAG, ODD → terminology answer, then connect it to the company/role if context exists
