# CareerPilot interview-review runtime chain

## 1. Trigger layer

### File-first trigger

Make `Word 面试记录 / 面试音频` the primary entry. Run:

```text
upload and persist original
  -> extract Word text / transcribe audio
  -> preview extracted text and reconstructed Q&A
  -> user correction
  -> interview-retrospective
```

Do not enter review when an audio artifact is stored but transcription is unavailable. Keep the asset and use `needs_configuration` or `needs_transcription`.

Show a `运行本轮面试复盘` action when all conditions are true:

- a job is selected
- an interview round exists
- at least one question title is non-empty

Allow the run when answers are missing, but label it `question-only review`; do not calculate answer scores.

### Paste/import fallback

Allow the user to paste an existing transcript when no file is available. Parse it into question chains and show the same correction surface. Treat this as a fallback, not the primary call path.

### Cross-round trigger

Show `对比多轮` when at least two rounds contain substantive questions. Run the same core review for each round, then synthesize repeated themes, depth changes, and unresolved gaps.

### Rerun trigger

Allow reruns after the user edits notes or verifies facts. Never silently replace an earlier AI review; move it to `round.aiReviewHistory` first.

## 2. Frontend request

Build the request from the selected CareerPilot job and round:

```json
{
  "mode": ["full_review", "careerpilot_evaluation", "next_round"],
  "job": {},
  "candidate": {},
  "priorPreparation": {},
  "interviewRound": {},
  "previousRounds": [],
  "options": {
    "outputLanguage": "zh-CN",
    "preserveRawText": true,
    "generateImprovedAnswers": true
  }
}
```

`interviewRound.sourceMaterial` must carry the stored asset reference, extraction status, provider/model, exact raw text, and extraction timestamp. Preserve it even when question reconstruction fails.

Before the first run, save an immutable `round.preparationSnapshot` from the preparation that existed before the interview. Include `generatedAt` and either the content or a stable content hash.

## 3. API and orchestration

Recommended endpoint:

```text
POST /api/review-interview
```

Run these stages in order:

1. **Validate**: require job, round, and at least one question; reject malformed IDs and oversized text.
2. **Normalize**: reconstruct question chains, preserve raw wording, and separate answers, follow-ups, reflections, and interviewer feedback.
3. **Review questions**: classify each question, infer likely intent, score visible answers, identify gaps, draft truthful improved answers, and generate follow-ups.
4. **Update role model**: extract validated, new, weakened, and next-round role hypotheses from question clusters and follow-up depth.
5. **Compare preparation**: link every actual question to exact prior preparation items and assign `prepared`, `partial`, `missed`, or `unassessable`.
6. **Plan next round**: rank evidence, knowledge, answer, and rehearsal tasks by likelihood, consequence, and weakness.
7. **Write product learning**: separate prediction misses, depth misses, evidence misses, framing misses, effective preparation, and false confidence.
8. **Score deterministically**: in the CareerPilot server pass `questionReviews` to `scoreInterviewReview`; use `scripts/score_review.py` for offline parity checks; attach the result under `preparationAudit.metrics`.
9. **Validate output**: verify raw text preservation, enum values, score ranges, traceability, and absence of invented claims.
10. **Persist**: write the validated result; do not persist a partially invalid completed review.

## 4. Runtime modules

| Module | Input | Output | Failure behavior |
|---|---|---|---|
| Intake Normalizer | raw round notes and question items | normalized question chains | preserve raw notes; ask user to confirm ambiguous splits |
| Question Reviewer | normalized questions, resume, JD | question-level reviews | use `null` scores when answer evidence is absent |
| Role Signal Miner | JD and question clusters | role insight updates | mark weak signals as inferred, never factual feedback |
| Preparation Comparator | immutable preparation snapshot and actual questions | status and matched items | return `unassessable` without a trustworthy snapshot |
| Next-Round Planner | reviews and role insights | ranked preparation actions | do not generate generic tasks without a linked gap |
| Product Learning Writer | comparison and answer review | CareerPilot improvement backlog | keep product misses separate from candidate failures |
| Deterministic Scorer | structured question reviews | numeric metrics | fail the metric stage on invalid enums or scores |

## 5. State machine

```text
DRAFT
  -> READY            selected job + round + at least one question
  -> REVIEWING        request accepted
  -> NEEDS_CONFIRM    ambiguous transcript split or missing factual boundary
  -> SCORING          structured model output accepted
  -> COMPLETED        validation and deterministic scoring passed
  -> SAVED            result persisted and rendered

REVIEWING / SCORING
  -> FAILED           API, schema, or scorer error; keep raw inputs and last valid review

SAVED
  -> REVIEWING        explicit rerun; archive current result first
```

## 6. Persistence

Store without overwriting user input:

```text
job.reviewRounds[n]
├── questionItems[]          raw user records
├── preparationSnapshot     immutable pre-interview comparison source
├── aiReview                latest valid result
└── aiReviewHistory[]       previous valid results

job.interviewLearning       cross-round synthesis
```

Each review must include `schemaVersion`, `generatedAt`, `comparisonConfidence`, and `evidenceLimitations`. A preparation snapshot must also record `captureTiming` as `round-creation` or `first-review`; the latter cannot receive high comparison confidence.

## 7. User-facing output

Render six sections:

1. **本轮结论**: three conclusions, strengths, and highest-risk gaps
2. **逐题复盘**: original question and answer, inferred intent, scores, gap, improved answer, follow-ups, facts to verify
3. **岗位认知更新**: validated, new, and weakened hypotheses plus next-round expectations
4. **准备覆盖度**: coverage, direct hit rate, answer readiness, evidence readiness, missed topics, effective preparation, false-confidence items
5. **下一轮作战单**: three things to remember, ranked questions, evidence tasks, knowledge tasks, rehearsal tasks, interviewer questions
6. **CareerPilot 学习记录**: product-learning labels and concrete changes to analysis, question generation, evidence auditing, and answer coaching

Do not hide the distinction between:

- CareerPilot predicted the topic
- CareerPilot produced usable depth and evidence
- the candidate delivered the prepared material well

## 8. Metrics

Use the bundled scorer:

```text
preparation coverage = (prepared + 0.5 × partial) / assessable questions
direct hit rate = prepared / assessable questions
strong answer rate = answerScore >= 3 / scored answers
evidence-ready rate = evidenceScore >= 3 / evidence-scored answers
```

Return `null`, not zero, when no item is assessable.

## 9. Fallbacks

- **No prior preparation**: complete the candidate and role review; set preparation metrics to `null` and comparison confidence to `unassessable`.
- **Questions but no answers**: review question intent and next-round implications; set answer and evidence scores to `null`.
- **Sparse or reconstructed notes**: preserve qualifiers and lower evidence confidence.
- **API failure**: retain raw inputs and the last valid AI review; allow explicit retry.
- **Scorer/schema failure**: show the qualitative draft only as an unsaved preview and mark metrics pending.
- **Post-interview preparation was overwritten**: do not calculate historical coverage unless a pre-interview snapshot exists.

## 10. End-to-end acceptance criteria

- One click from a valid interview round starts the review.
- Raw questions and answers remain unchanged.
- Every actual question has a traceable preparation status when a prior snapshot exists.
- Numeric metrics come only from the deterministic scorer.
- Improved answers contain no invented evidence.
- The next-round plan links every task to a diagnosed gap or role signal.
- Product-learning output distinguishes prediction, depth, evidence, framing, and delivery failures.
- A rerun preserves review history and uses the original pre-interview snapshot for fair comparison.
