# CareerPilot integration contract

## Purpose

Attach AI review outputs to CareerPilot without overwriting the candidate's raw interview record. Preserve the preparation snapshot used for comparison so later product evaluation is not contaminated by hindsight edits.

## Input mapping

Build an input object from existing CareerPilot state:

```json
{
  "schemaVersion": "1.0",
  "job": {
    "id": "job-id",
    "company": "Company",
    "title": "Role",
    "type": "AI Product",
    "jd": "raw JD",
    "status": "interview"
  },
  "candidate": {
    "resumeId": "resume-id",
    "resume": "submitted resume text",
    "projects": "project notes"
  },
  "priorPreparation": {
    "generatedAt": "ISO timestamp",
    "analysis": {},
    "analysisModules": {},
    "selfIntroductionSkill": {},
    "riskQuestions": [],
    "prepSuggestions": []
  },
  "interviewRound": {
    "id": "round-id",
    "title": "一面",
    "date": "ISO timestamp",
    "format": "视频",
    "interviewer": "业务面试官",
    "notes": "raw round notes",
    "sourceMaterial": {
      "asset": {
        "id": "file-asset-id",
        "fileName": "interview.docx",
        "fileType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "sourceType": "document"
      },
      "extraction": {
        "status": "extracted",
        "provider": "local",
        "model": "",
        "charCount": 3200,
        "extractedAt": "ISO timestamp"
      },
      "rawText": "exact extracted or transcribed text"
    },
    "nextSteps": "",
    "questionItems": [
      {
        "id": "question-id",
        "title": "exact question",
        "answer": "exact recorded answer",
        "thinking": "candidate reflection",
        "gap": "candidate-entered gap",
        "nextAnswer": "candidate draft"
      }
    ]
  },
  "previousRounds": []
}
```

Use `job.analysis` and `job.analysisModules` as the preparation source. Snapshot them at interview creation or first review. If the saved analysis was regenerated after the interview, mark comparison confidence as low.

## Output shape

Store the full result under `round.aiReview`; do not replace `questionItems` or user-entered fields.

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "ISO timestamp",
  "comparisonConfidence": "high|medium|low|unassessable",
  "evidenceLimitations": ["string"],
  "summary": {
    "threeConclusions": ["string"],
    "overallAssessment": "string",
    "topStrengths": ["string"],
    "topGaps": ["string"]
  },
  "questionReviews": [
    {
      "questionId": "question-id",
      "rawQuestion": "exact source text",
      "rawAnswer": "exact source text",
      "primaryCategory": "product_judgment",
      "secondaryCategory": "data_strategy",
      "interviewerIntent": {
        "text": "inference",
        "evidenceStatus": "inferred"
      },
      "strengths": ["string"],
      "gapTypes": ["judgment"],
      "mainGap": "string",
      "answerScore": 2,
      "evidenceScore": 2,
      "preparationStatus": "partial",
      "matchedPreparationItems": ["exact prior item"],
      "matchRationale": "string",
      "improvedAnswer": "string",
      "followUpQuestions": ["string"],
      "factsToVerify": ["string"]
    }
  ],
  "roleInsights": {
    "validatedHypotheses": ["string"],
    "newSignals": ["string"],
    "weakenedAssumptions": ["string"],
    "nextRoundHypotheses": ["string"]
  },
  "preparationAudit": {
    "metrics": {},
    "missedTopics": ["string"],
    "effectivePreparation": ["string"],
    "falseConfidenceItems": ["string"]
  },
  "nextRoundPlan": {
    "rememberThree": ["string"],
    "priorityQuestions": ["string"],
    "evidenceTasks": ["string"],
    "knowledgeTasks": ["string"],
    "rehearsalTasks": ["string"],
    "questionsForInterviewer": ["string"]
  },
  "careerpilotLearning": {
    "labels": ["depth_miss"],
    "analysisImprovements": ["string"],
    "questionGenerationImprovements": ["string"],
    "evidenceAuditImprovements": ["string"],
    "answerCoachingImprovements": ["string"]
  }
}
```

## Persistence recommendation

- `round.preparationSnapshot`: immutable copy or content hash plus timestamp and `captureTiming` (`round-creation` or `first-review`) of the preparation used for comparison
- `round.aiReview`: latest review result
- `round.aiReviewHistory`: optional earlier versions when rerunning the review
- `job.interviewLearning`: cross-round synthesis derived from all `round.aiReview` records

Keep source inputs and generated review versions separate. Never let a post-interview rewritten answer silently become the “prepared answer” used to calculate coverage.

## Metric interpretation

- Preparation coverage measures whether prior preparation materially supported actual questions.
- Answer readiness measures the observed answer quality, not CareerPilot prediction quality.
- Evidence readiness measures whether claims can survive verification and follow-up.
- A topic can be `prepared` while the answer score is low; this suggests rehearsal or delivery failure.
- A topic can be `missed` while the answer score is high; this suggests candidate strength outside CareerPilot preparation.

CareerPilot's Node runtime uses the equivalent `scoreInterviewReview` function. Use `scripts/score_review.py` for offline validation and parity checks.
