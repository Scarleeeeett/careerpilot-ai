#!/usr/bin/env python3
"""Compute deterministic CareerPilot interview-review metrics."""

from __future__ import annotations

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any


VALID_PREPARATION = {"prepared", "partial", "missed", "unassessable"}
VALID_SCORES = {0, 1, 2, 3, 4}


def pct(numerator: float, denominator: int) -> float | None:
    if denominator == 0:
        return None
    return round(numerator * 100 / denominator, 1)


def validate_question(item: dict[str, Any], index: int) -> None:
    status = item.get("preparationStatus")
    if status not in VALID_PREPARATION:
        raise ValueError(f"questionReviews[{index}].preparationStatus is invalid: {status!r}")
    for key in ("answerScore", "evidenceScore"):
        value = item.get(key)
        if value is not None and value not in VALID_SCORES:
            raise ValueError(f"questionReviews[{index}].{key} must be 0-4 or null")


def compute(question_reviews: list[dict[str, Any]]) -> dict[str, Any]:
    for index, item in enumerate(question_reviews):
        validate_question(item, index)

    status_counts = {key: 0 for key in sorted(VALID_PREPARATION)}
    category_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    answer_scores: list[int] = []
    evidence_scores: list[int] = []

    for item in question_reviews:
        status_counts[item["preparationStatus"]] += 1
        category_rows[item.get("primaryCategory") or "uncategorized"].append(item)
        if item.get("answerScore") is not None:
            answer_scores.append(item["answerScore"])
        if item.get("evidenceScore") is not None:
            evidence_scores.append(item["evidenceScore"])

    assessable = status_counts["prepared"] + status_counts["partial"] + status_counts["missed"]
    weighted_hits = status_counts["prepared"] + 0.5 * status_counts["partial"]

    by_category: dict[str, Any] = {}
    for category, rows in sorted(category_rows.items()):
        category_assessable = [row for row in rows if row["preparationStatus"] != "unassessable"]
        category_weighted = sum(
            1 if row["preparationStatus"] == "prepared" else 0.5 if row["preparationStatus"] == "partial" else 0
            for row in category_assessable
        )
        category_answers = [row["answerScore"] for row in rows if row.get("answerScore") is not None]
        by_category[category] = {
            "questionCount": len(rows),
            "preparationCoveragePct": pct(category_weighted, len(category_assessable)),
            "averageAnswerScore": round(sum(category_answers) / len(category_answers), 2) if category_answers else None,
        }

    return {
        "questionCount": len(question_reviews),
        "assessablePreparationQuestionCount": assessable,
        "preparationStatusCounts": status_counts,
        "preparationCoveragePct": pct(weighted_hits, assessable),
        "directPreparationHitRatePct": pct(status_counts["prepared"], assessable),
        "averageAnswerScore": round(sum(answer_scores) / len(answer_scores), 2) if answer_scores else None,
        "strongAnswerRatePct": pct(sum(score >= 3 for score in answer_scores), len(answer_scores)),
        "averageEvidenceScore": round(sum(evidence_scores) / len(evidence_scores), 2) if evidence_scores else None,
        "evidenceReadyRatePct": pct(sum(score >= 3 for score in evidence_scores), len(evidence_scores)),
        "byCategory": by_category,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="JSON file containing questionReviews or a raw question-review array")
    parser.add_argument("--output", type=Path, help="Optional output JSON path; stdout is always populated")
    args = parser.parse_args()

    try:
        payload = json.loads(args.input.read_text(encoding="utf-8-sig"))
        reviews = payload.get("questionReviews", []) if isinstance(payload, dict) else payload
        if not isinstance(reviews, list):
            raise ValueError("questionReviews must be an array")
        result = compute(reviews)
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2

    rendered = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered + "\n", encoding="utf-8")
    print(rendered)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
