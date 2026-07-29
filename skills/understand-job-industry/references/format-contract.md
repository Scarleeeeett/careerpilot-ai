# Format contract

## Contents

1. Global writing constraints
2. Quick, standard, and deep outputs
3. HTML artifact
4. Tables and terminology
5. Interview blocks and handoff

## Global writing constraints

- Lead each section with its conclusion.
- Use plain Chinese and short labels; define acronyms on first use.
- Avoid slogans, rhetorical questions, inflated transitions, and generic career advice.
- Separate facts, company claims, estimates, assumptions, and inference visually or verbally.
- Put source links next to supported claims, not in an unconnected bibliography only.
- Put date, geography, unit, and scope next to volatile figures.
- Use `未披露` or `无法同口径比较`; never invent missing values.
- Do not output a weekly or daily learning plan unless requested.

## Quick chat answer

Use for one focused question.

Required order:

1. Direct answer in the first paragraph
2. Industry classification or term definition
3. Compact chain/table/formula as needed
4. Role or interview implication
5. Sources and limitations

Keep only detail necessary to answer the question. Do not force all standard-report sections.

## Standard Markdown report

Use the standard section order in `output-template.md`. Requirements:

- Visible title, data-update date, scope, and assumptions
- Executive conclusion no longer than 8 bullets or 3 short paragraphs
- Value chain includes participants, inputs, outputs, and money flow
- Product table includes source and statistical scope
- Terminology section explains all decision-critical terms
- Interview section includes frameworks and follow-ups, not only model answers
- Sources section records title, source type, date, supported claim, and limitation

## Deep report

Add a claim ledger, customer workflow, product matrix, economics assumptions, policy-stage table, cases, open questions, and decision log. Do not add sections with no useful evidence.

## HTML artifact

Use:

- Sticky top bar
- Concise hierarchical left navigation
- Right content column divided by sections
- Mobile directory below 900 px
- Search for a glossary with more than 15 terms
- Horizontally scrollable product tables without page-level overflow
- Structured data separated from presentation when refreshes are expected
- Visible data-update date and source metadata

### Information architecture

Do not put 10 or more report sections at the same navigation level. Use 3 to 5 first-level chapters with 2 to 5 second-level anchors each. Default structure:

```text
岗位与业务
  核心结论 / 业务归属 / JD 岗位映射
行业与产品
  产业链 / 工作流 / 竞品定价 / 商业成本 / 安全治理
核心能力
  评测或运营框架 / 专业术语
面试使用
  高频问答 / 反问 / 来源与限制
```

Keep only the current chapter expanded on desktop. Expand its children when a second-level anchor becomes active. On mobile, use grouped native disclosure controls rather than a dense grid of flat links. Keep content order consistent with navigation order.

### Visual system

- Treat the report as a knowledge product, not a marketing landing page or decorative dashboard.
- Prefer a restrained product-documentation visual language: one sans-serif family, one accent color, clear type hierarchy, stable spacing, and limited motion.
- Use heading levels, whitespace, and dividers before adding containers. Avoid placing every paragraph in a card.
- Keep the page title within 36 to 56 px on desktop and 32 to 40 px on mobile; it must not dominate the research content.
- Do not use slogans, AI-purple gradients, glass effects, wide soft shadows, decorative score bars, or colored side-stripe callouts.
- Use cards only for real interaction or grouped state. Use tables for normalized comparisons and step flows for ordered processes.
- If a frontend design or audit skill is available and the user requests polish, use it after the research scope and content hierarchy are stable.

### HTML file structure

For reports likely to be refreshed, prefer:

```text
report-folder/
  index.html
  research-data.js
```

Keep volatile product price, adoption, and source URLs in the data file. Keep prose that explains reasoning in the HTML unless it also needs programmatic refresh.

### Browser QA

Before delivery:

1. Render at desktop and mobile widths.
2. Check first-level and second-level navigation, active-state updates, anchor order, keyboard focus, theme control, tables, glossary search, and copy buttons.
3. Check duplicate IDs, missing local anchors, missing local scripts, page-level horizontal overflow, long Latin terms on mobile, and empty/error states.
4. Run `validate_report.py` with role/JD flags when applicable.
5. Remove temporary screenshots and browser-test files after inspection.

Avoid hero slogans, decorative dashboards without analytical value, excessive cards, flat menus, and hidden methodology.

## Table constraints

- Every metric column shows unit.
- Every scale figure labels order, shipment, delivery, active fleet, revenue, capacity, or plan.
- Every price labels hardware, software, implementation, subscription, usage, or public visible cost.
- Unknown values use `未披露`.
- Non-comparable rows explain why.
- Add source links at row or claim level.

## Terminology card

Each detailed term uses this order:

```text
是什么
怎么工作
在本行业哪里使用
产品经理要决定什么
如何验证
常见错误
当前公司或岗位例子
```

## Interview answer block

Use:

```text
Question
Conclusion
Answer framework
Evidence
Limitation
Likely follow-up
Defensible answer point
```

## Final handoff

State the artifact path, data-update date, completed validation, and known unresolved facts. Do not narrate every tool call.
