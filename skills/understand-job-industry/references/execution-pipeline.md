# Execution pipeline

Use this as the visible, auditable processing chain. It specifies decisions and intermediate artifacts, not private chain-of-thought.

## Contents

1. Intake card
2. JD requirement map
3. Research question tree
4. Source map and claim ledger
5. Industry model
6. Company and product model
7. Role mapping
8. Terminology registry
9. Interview package
10. Artifact assembly and QA

## Phase 0: Intake card

**Input:** user request, company, role, JD, files, links, conversation context.

**Action:** normalize the fields in `input-and-routing.md`; preserve the latest explicit output format from the conversation; choose quick, standard, deep, or update mode.

**Output:** scope statement, assumptions, unresolved questions, research date.

**Gate:** if entity or business line ambiguity changes the result, ask; otherwise proceed. If the user also does not know, record user hypotheses and create a qualitative scope-hypothesis matrix instead of choosing one branch.

## Phase 1: JD requirement map

**Input:** JD text, official job page, or role description.

**Action:** extract actions, owned objects, users, technical/business nouns, metrics, interfaces, seniority, and expected evidence.

**Output:** structured JD table separating explicit statements from inference.

**Gate:** identify which industry dimensions matter to the role. Do not research irrelevant dimensions at equal depth.

## Phase 2: Research question tree

**Input:** intake and JD map.

**Action:** convert the request into answerable questions:

- What industry and market transaction define the company?
- Who pays, uses, operates, benefits, regulates, and supplies?
- What products solve which workflow?
- How does money enter and which costs scale?
- Which competitors are truly comparable?
- Which policy or operational boundary matters?
- Which knowledge changes the target role's decisions?

**Output:** prioritized question list: must answer, useful, optional.

## Phase 3: Source map and claim ledger

**Input:** search results and local materials.

**Action:** follow `search-protocol.md` and `evidence-rules.md`.

**Output:** source map and claim ledger with scope, date, confidence, and limitation.

**Gate:** reject unsupported critical claims; mark missing facts `未披露`.

## Phase 4: Industry model

**Input:** verified claims.

**Action:** construct industry boundary, demand, workflow, value chain, participant roles, product/data flow, money flow, business model, economics, policy, and risks.

**Output:** one-sentence classification, value-chain map, stakeholder table, workflow, and economics model.

**Gate:** check that “industry” is not merely a technology label and that upstream/downstream are concrete.

## Phase 5: Company and product model

**Input:** company and market evidence.

**Action:** map product stack, target scenarios, customers, delivery, pricing, scale, differentiators, dependencies, and constraints. Normalize physical-product and software-product scale differently; use adoption, workload, seats, customers, or revenue for software instead of calling it production.

**Output:** company position card and representative product matrix.

**Gate:** separate company-wide data from model-level data; normalize competitor scope.

## Phase 6: Role mapping

**Input:** JD map, industry model, company/product model.

**Action:** map the role to users, workflow nodes, modules, recurring decisions, metrics, partner teams, risks, and likely deliverables.

**Output:** `JD phrase → industry meaning → daily decision → metric → interview evidence` table.

**Gate:** every role conclusion must be traceable to JD text, company workflow, or a labeled inference.

## Phase 7: Terminology registry

**Input:** material terms from JD, sources, and report draft.

**Action:** explain each using definition, mechanism, industry use, product decision, validation, failure, and example.

**Output:** inline first-use explanations and a glossary for terms needing more detail.

**Gate:** a newcomer should not need another unexplained term to understand the definition.

## Phase 8: Interview package

**Input:** verified conclusions and role mapping.

**Action:** prepare 30-second and 60-to-90-second answers, likely questions, evidence, limitations, follow-ups, and interviewer questions.

**Output:** interview-ready answer blocks.

**Gate:** avoid claims the user cannot defend or facts without source/scope.

## Phase 9: Artifact assembly

**Input:** all intermediate artifacts.

**Action:** use `output-template.md`; select chat, Markdown, or HTML. For long reports, group content into first-level chapters and second-level sections rather than exposing every section as a peer.

**Output:** final report plus sources and open questions.

## Phase 10: QA

Check content, evidence, terminology, format, links, dates, responsive layout when applicable, and absence of an unrequested learning schedule. Run the validator for saved reports. For HTML, render desktop and mobile views, test hierarchical navigation and interactions, check anchors and local data files, then remove temporary QA artifacts.

## Concise decision log

Include when scope or evidence is non-obvious:

```text
Assumption made:
Reason for industry classification:
Competitor comparison scope:
Facts treated as company claims:
Unresolved information:
What would change the conclusion:
```
