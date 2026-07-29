# Review rubric

## Question categories

Use one primary category and, only when useful, one secondary category.

| Code | Category | Typical signal |
|---|---|---|
| `motivation_fit` | Motivation and fit | Why this company, role choice, career direction |
| `project_depth` | Project depth | Ownership, decisions, implementation, results, reflection |
| `product_judgment` | Product judgment | Prioritization, trade-offs, user value, product critique |
| `business_understanding` | Business understanding | Users, supply/demand, monetization, competition, growth |
| `data_strategy` | Data and strategy | Metrics, labeling, experiments, thresholds, attribution |
| `ai_technical` | AI technical understanding | LLM, Agent, RAG, tool use, Function Call, evaluation |
| `execution_collaboration` | Execution and collaboration | Alignment, conflict, delivery, acceptance, resource constraints |
| `behavioral` | Behavioral | Failure, pressure, learning, influence, self-awareness |
| `case_design` | Open case/design | New product, diagnosis, strategy, estimation |
| `interviewer_questions` | Candidate questions | Quality of questions asked to the interviewer |

## Answer readiness score

Score only what is visible in the recorded answer.

| Score | Meaning |
|---|---|
| 0 | No answer, evasive, or unrelated |
| 1 | Some relevant content but no clear conclusion or usable structure |
| 2 | Understandable answer with partial reasoning; key trade-off, evidence, or depth missing |
| 3 | Clear judgment, relevant reasoning, and credible evidence; survives one follow-up layer |
| 4 | Strong judgment and evidence, explicit trade-offs, honest boundaries, and reflection; likely survives several follow-ups |

Use `null` if the answer was not recorded. Do not infer fluency, tone, or confidence from notes alone.

## Evidence readiness score

| Score | Meaning |
|---|---|
| 0 | Material claim conflicts with sources or appears fabricated |
| 1 | Claims are vague; ownership, metric, baseline, or method cannot be explained |
| 2 | Core story is credible but important evidence is missing or partly remembered |
| 3 | Ownership and method are clear; important numbers and boundaries are supportable |
| 4 | Evidence is complete: source, sample/baseline, decision ownership, outcome, and limitations are all explainable |

Use `null` when the question does not require personal evidence.

## Preparation status

- `prepared`: prior material directly supported this question and sufficient depth was available
- `partial`: related prior material existed, but the actual angle, depth, or evidence was incomplete
- `missed`: prior material did not materially help
- `unassessable`: prior preparation snapshot is absent or the question is not a preparation-quality signal

Record the matched prior item and match rationale. Keyword overlap without a usable idea, example, or framework is `missed` or `partial`, never automatically `prepared`.

## Gap types

Use the smallest useful set:

- `relevance`: did not answer the question asked
- `judgment`: avoided prioritization or trade-off
- `structure`: ideas were hard to follow
- `evidence`: claims lacked ownership, examples, or verifiable metrics
- `depth`: could not explain mechanism, method, or follow-up layer
- `delivery`: too long, abstract, defensive, or unnatural to say aloud

## Product-learning labels

- `prediction_miss`: CareerPilot failed to anticipate a material topic
- `depth_miss`: topic was predicted but not at the required depth
- `evidence_miss`: preparation lacked facts needed to answer safely
- `framing_miss`: evidence existed but the recommended framing was weak
- `role_model_update`: interview reveals a new or corrected role expectation
- `effective_preparation`: prior preparation materially helped
- `false_confidence`: prior output looked complete but was unusable under follow-up

