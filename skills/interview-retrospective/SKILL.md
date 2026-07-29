---
name: interview-retrospective
description: Extract and review real interviews from uploaded Word records (.docx) or audio recordings, then reconstruct questions and answers, diagnose truthful answer gaps, infer role signals, prepare the next round, and evaluate CareerPilot's earlier preparation. Use after an interview, between rounds, when the user uploads interview Word/audio files or asks to import, transcribe, review, compare, or iterate interview records.
---

# Interview Retrospective

Turn each real interview into three assets: a better candidate, a sharper role model, and an evaluation record for CareerPilot.

## Select the mode

- **Quick review**: Use when only rough notes are available. Extract questions, identify the top gaps, and produce immediate next actions.
- **Full review**: Use when both questions and answers are available. Review every question, rewrite answers, and prepare likely follow-ups.
- **CareerPilot evaluation**: Use when prior CareerPilot analysis or preparation is available. Compare predicted topics and prepared material with the actual interview, then output product-improvement evidence.
- **Cross-round synthesis**: Use when two or more interview rounds are available. Track repeated themes, changing interviewer depth, and unresolved gaps.

Combine modes when inputs support them. Never block the review merely because one source is missing.

## Gather and preserve inputs

Use the original artifact as the primary input:

1. Accept a Word interview record (`.docx`) or supported audio recording (`mp3`, `m4a`, `wav`, `webm`, `ogg`, `flac`, `mp4`).
2. Store the original artifact before extraction. For Word, extract text locally. For audio, transcribe it with the configured speech-to-text provider.
3. Show the extracted text and reconstructed question-answer chains for quick user correction before review.
4. Keep the original artifact reference, extracted raw text, extraction provider/model, timestamp, and user corrections in the structured record.

Do not claim an audio file was analyzed when only upload/storage succeeded. If transcription is unavailable, return `needs_configuration` or `needs_transcription` and stop before review.

Then enrich the review from these sources, in order:

1. Extracted exact transcript or contemporaneous Word notes
2. User corrections to reconstructed questions and answers
3. JD, submitted resume, portfolio, and job metadata
4. CareerPilot's saved job analysis, predicted questions, preparation plan, self-introduction, and risk notes
5. Interviewer feedback or outcome

Keep raw questions and answers unchanged in the structured record. Distinguish:

- `explicit`: stated in a source
- `inferred`: reasoned from question sequence or answer content
- `unknown`: insufficient evidence

Do not present an inferred interviewer opinion as feedback. Do not invent missing metrics, ownership, implementation details, or business results.

When implementing or debugging the CareerPilot product flow, read [runtime-chain.md](references/runtime-chain.md) for the trigger conditions, orchestration stages, state transitions, fallbacks, and persistence rules.

## Run the workflow

### 1. Reconstruct the interview

Normalize the material into rounds and individual question items. Separate interviewer prompts, candidate answers, follow-up prompts, and later reflections. If notes merge several follow-ups, keep them as a question chain rather than pretending they were independent questions.

Tag each question with one or two categories from [review-rubric.md](references/review-rubric.md). Preserve unusual questions instead of forcing a weak category.

### 2. Review each answer

For every substantive question, produce:

- what the interviewer was likely testing, marked as inference
- what the answer did well, using direct evidence
- the main gap: relevance, judgment, structure, evidence, depth, or delivery
- a readiness score and evidence score using the rubric
- a stronger answer that uses only verified experience
- likely second- and third-layer follow-ups
- facts or examples the candidate must supply before using the answer

Prefer **judgment → reasons → evidence → reflection** for product questions. Prefer **problem → decision/trade-off → action → result → reflection** for project questions. Do not polish a weak factual foundation into false confidence; add `[请补真实信息：…]` placeholders instead.

### 3. Update the role model

Treat question selection and follow-up depth as new evidence about the role. Separate:

- hypotheses validated by the interview
- new role signals not obvious in the JD
- earlier assumptions weakened or contradicted
- likely expectations for the next round

Base inferences on question clusters and follow-up behavior, not isolated wording. Explain the evidence chain briefly.

### 4. Audit prior preparation

When CareerPilot preparation exists, compare every actual question with the saved preparation snapshot—not with a rewritten hindsight version.

Assign one status:

- `prepared`: a directly relevant predicted question, concept, or story existed and was usable
- `partial`: a related competency or story existed but the actual angle, depth, or evidence was missing
- `missed`: no materially useful preparation existed
- `unassessable`: no reliable prior snapshot exists or the item is administrative

For each match, name the exact prior item and explain why it helped or failed. Do not count keyword overlap alone as coverage.

Read [careerpilot-contract.md](references/careerpilot-contract.md) when CareerPilot data is present or integration output is requested. After assigning statuses and scores, use the deterministic scorer. In CareerPilot's Node runtime call `scoreInterviewReview` from `src/server/tools/interview-retrospective.js`; for offline artifacts or contract checks run:

```powershell
python scripts/score_review.py review-input.json --output review-metrics.json
```

Both implementations use the same formula. Do not manually alter computed metrics.

### 5. Prepare the next round

Prioritize by `likelihood × consequence × current weakness`. Produce:

- three things to remember
- revised self-introduction only when the interview exposed a positioning problem
- two or three flagship answer scripts
- a ranked question bank with follow-up chains
- evidence-filling tasks
- role/product knowledge to research
- two or three informed questions for the interviewer
- a short rehearsal plan

Do not turn every gap into generic studying. Convert it into an observable action such as “verify the sample size,” “rewrite the trade-off sentence,” or “simulate three tool-failure cases.”

### 6. Create the CareerPilot learning record

Produce one structured record per interview round using the contract. Include:

- preparation coverage and answer readiness metrics
- missed topics and unexpectedly deep questions
- preparation items that proved useful
- false-confidence items that existed but were unusable
- recommended changes to job analysis, question generation, evidence auditing, or answer coaching

Keep product-evaluation findings separate from candidate coaching. A weak answer does not necessarily mean CareerPilot missed the topic; a predicted topic does not count as effective preparation if it lacked usable evidence or depth.

## Output

Default to both:

1. A concise Markdown report the candidate can rehearse
2. A JSON record compatible with CareerPilot

For Quick review without integration needs, Markdown alone is acceptable. For CareerPilot evaluation, JSON is mandatory.

Order the Markdown report as:

1. Three conclusions
2. Interview signal summary
3. Question-level review
4. Role-understanding update
5. Preparation coverage audit
6. Next-round preparation
7. CareerPilot product-learning backlog
8. Facts the user must verify

## Quality gate

Before finishing, verify:

- every claimed interview fact is traceable to an input
- interviewer intent and likely evaluation are labeled as inference
- improved answers contain no invented experience or numbers
- each actual question has a preparation status when a prior snapshot exists
- coverage is based on useful semantic preparation, not keyword overlap
- candidate coaching and CareerPilot evaluation are reported separately
- next actions are concrete and prioritized
- JSON preserves raw source text and follows the contract
