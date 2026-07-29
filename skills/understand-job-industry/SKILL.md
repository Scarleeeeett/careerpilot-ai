---
name: understand-job-industry
description: Research a target company's industry for job applications and interviews from a company name, role, pasted JD, job URL, screenshot, PDF, or existing artifact. Trigger when the user asks “这家公司属于什么行业”, “上下游是什么”, “面试前了解行业”, “根据JD做行业调研”, “有哪些竞品和代表产品”, or requests pricing/functions/shipments, business models, TCO or unit economics, policy and risk, role-to-industry mapping, terminology explanations, or a Markdown/HTML industry brief. Also use to update an existing industry artifact. Do not use for pure resume rewriting, investment advice, or generic study planning; do not generate schedules unless explicitly requested.
---

# Understand Job Industry

Turn a company name, target role, and optional JD into an evidence-backed industry brief for job applications. Explain the industry plainly, connect it to the role, and make every important claim traceable.

## Intake

Read [references/input-and-routing.md](references/input-and-routing.md) at the start of every run. Normalize the request into an intake card, parse any JD, select the route, and ask only material follow-ups. Treat user-provided files and links as primary inputs. Preserve the user's latest explicit format preference across follow-up turns.

Before researching, run the business-line clarification gate. If the target company has materially different businesses and the JD does not identify the relevant product, customer, or business line, ask whether the user knows it; do not silently convert the missing field into an assumption. Ask one concise question, mention likely options only as examples, and allow “不知道”. If the user does not know, proceed with a clearly labeled branch analysis and add recruiter-confirmation questions. Do not claim a specific product-team mapping without evidence.

## Depth selection

- **Quick**: direct conclusion, compact value chain, 3 to 5 role implications, and sources.
- **Standard**: default for interviews. Cover industry, value chain, company, products, competitors, economics, policy, role mapping, terminology, and questions.
- **Deep**: add workflows, cases, TCO or unit economics, policy detail, time series, claim ledger, risks, and a product matrix.
- **Update**: inspect the existing artifact, preserve useful structure, refresh volatile facts, and record the as-of date.

Do not substitute a weekly or daily learning plan for knowledge content. Add one only when explicitly requested.

## Required workflow

Follow [references/execution-pipeline.md](references/execution-pipeline.md). Produce these intermediate artifacts when applicable:

1. Intake card and scope assumptions
2. JD requirement map
3. Prioritized research-question tree
4. Source map and claim ledger
5. Industry, workflow, value-chain, and economics models
6. Company position and normalized product matrix
7. Role mapping and terminology registry
8. Interview package
9. Final artifact and QA record

Use [references/search-protocol.md](references/search-protocol.md) for search channels, query passes, source minimums, gap search, and stopping conditions. Use [references/evidence-rules.md](references/evidence-rules.md) for volatile facts and critical claims.

Load the detailed framework only when relevant:

- Industry and economics: [references/research-framework.md](references/research-framework.md)
- Competitors and product metrics: [references/product-comparison.md](references/product-comparison.md)
- JD-to-role and interview mapping: [references/role-and-interview.md](references/role-and-interview.md)
- Terminology: [references/terminology.md](references/terminology.md)
- Output structure: [references/output-template.md](references/output-template.md)
- Formatting and presentation: [references/format-contract.md](references/format-contract.md)

For Markdown or HTML artifacts, run `scripts/validate_report.py <file> --depth <quick|standard|deep>` and address substantive warnings. For HTML, also verify rendering, navigation, interactions, links, and mobile overflow in a browser.

When the input is a JD and the business line or desired chain is unclear, read [references/worked-example.md](references/worked-example.md) for a complete clarification → hypothesis matrix → research → HTML assembly → QA example.

## Research rules

- Separate fact, company claim, estimate, and inference.
- Put date and scope next to volatile figures.
- Distinguish price from lifecycle cost; order from shipment; shipment from active fleet; capacity from output; pilot permit from commercial operation.
- For software and AI products, translate “产量” into adoption, workload, customers, seats, or revenue; never label user or task counts as physical output.
- Use `未披露` instead of guessing.
- Treat a case as evidence of one workflow, not an industry-wide result.
- Explain limitations near the claim.
- Use direct, neutral language without slogans or unsupported superlatives.
- Cite sources next to supported claims.

## Industry classification

Use this layered answer:

```text
Primary industry → Subsector → Product form → Application scenario
```

Then name adjacent industries and identify which layer creates most value.

## Terminology rule

For each material term, provide: plain definition, mechanism, input/output, product decision, validation method, failure mode, and a role-relevant example. Expand abbreviations on first use. Do not define one term only with another unexplained term.

## Quality gates

Confirm before delivery:

- The opening answers what industry the company belongs to.
- The value chain names participants, inputs, outputs, and money flow.
- Comparisons use consistent definitions and show missing data.
- Pricing and scale include date, scope, and source.
- Economics identify payer, charging unit, variable cost, and utilization driver.
- Policy stages are distinguished where relevant.
- The role section connects product decisions to workflows and metrics.
- Every material term is understandable to a newcomer.
- Interview answers include evidence, limits, and follow-ups.
- No study roadmap appears unless requested.

## HTML presentation

When HTML is requested, follow [references/format-contract.md](references/format-contract.md). Use 3 to 5 first-level navigation chapters with second-level anchors; do not expose every report section as a flat peer. Prefer tables for exact comparisons and flows for processes. Keep volatile facts in a structured data file when refreshes are expected. Show source type, as-of date, confidence, and a visible data-update date. Browser-check desktop and mobile rendering, navigation, interactions, links, local data loading, and overflow before delivery.
