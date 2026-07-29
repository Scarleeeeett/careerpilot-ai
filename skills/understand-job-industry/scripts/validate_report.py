#!/usr/bin/env python3
"""Validate Markdown or HTML industry-research deliverables."""

from __future__ import annotations

import argparse
import html
import re
from collections import Counter
from pathlib import Path


TOPICS = {
    "industry classification": ("行业归属", "行业分类", "industry classification", "行业概览"),
    "value chain": ("产业链", "上游", "value chain"),
    "products": ("产品", "product"),
    "business model": ("商业模式", "business model"),
    "competition": ("竞争", "竞品", "competitor"),
    "role mapping": ("岗位映射", "岗位关系", "role mapping", "岗位与行业"),
    "terminology": ("术语", "名词解释", "terminology", "glossary"),
    "interview": ("面试", "interview"),
    "sources": ("数据来源", "来源与限制", "sources", "source annex"),
    "economics": ("单位经济", "tco", "经济性", "unit economics"),
    "policy": ("政策", "合规", "policy", "regulation"),
    "workflow or cases": ("业务流程", "客户案例", "workflow", "case study"),
    "claim ledger": ("claim ledger", "事实台账", "证据台账", "主张台账"),
    "open questions": ("待确认", "开放问题", "open questions", "unresolved"),
    "jd map": ("jd requirement map", "jd 需求映射", "jd解析", "jd 解析"),
}

REQUIRED = {
    "quick": ("industry classification", "value chain", "sources"),
    "standard": (
        "industry classification",
        "value chain",
        "products",
        "business model",
        "competition",
        "terminology",
        "interview",
        "sources",
    ),
    "deep": (
        "industry classification",
        "value chain",
        "products",
        "business model",
        "competition",
        "terminology",
        "interview",
        "sources",
        "economics",
        "policy",
        "workflow or cases",
        "claim ledger",
        "open questions",
    ),
}

MIN_URLS = {"quick": 3, "standard": 8, "deep": 12}


def visible_text(raw: str, suffix: str) -> str:
    if suffix.lower() not in {".html", ".htm"}:
        return raw
    without_blocks = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", " ", raw, flags=re.I | re.S)
    return html.unescape(re.sub(r"<[^>]+>", " ", without_blocks))


def has_topic(text: str, topic: str) -> bool:
    lowered = text.lower()
    return any(term.lower() in lowered for term in TOPICS[topic])


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("report", type=Path)
    parser.add_argument("--depth", choices=REQUIRED, default="standard")
    parser.add_argument("--role-required", action="store_true")
    parser.add_argument("--jd-required", action="store_true")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.report.is_file():
        print(f"ERROR: file not found: {args.report}")
        return 2

    raw = args.report.read_text(encoding="utf-8")
    text = visible_text(raw, args.report.suffix)
    warnings: list[str] = []

    required = list(REQUIRED[args.depth])
    if args.role_required:
        required.append("role mapping")
    if args.jd_required:
        required.append("jd map")

    for topic in dict.fromkeys(required):
        if not has_topic(text, topic):
            warnings.append(f"missing topic: {topic}")

    url_count = len(set(re.findall(r"https?://[^\s\"'<>)]+", raw)))
    if url_count < MIN_URLS[args.depth]:
        warnings.append(
            f"only {url_count} distinct source URL(s); "
            f"{args.depth} mode normally expects {MIN_URLS[args.depth]}"
        )

    if not re.search(r"20\d{2}[-年/.]\d{1,2}(?:[-月/.]\d{1,2})?", text):
        warnings.append("no visible data-update or source date")

    placeholders = re.findall(r"\b(?:TODO|TBD)\b|待补充|待核实", text, flags=re.I)
    if placeholders:
        warnings.append(f"contains {len(placeholders)} unresolved placeholder(s)")

    if re.search(r"(?:12|十二)\s*周", text) and "学习路线" in text:
        warnings.append("contains a study roadmap; include only when explicitly requested")

    scope_terms = ("订单", "交付", "销量", "产量", "保有量", "产能", "市场份额")
    if any(term in text for term in scope_terms) and "口径" not in text:
        warnings.append("scale figures appear without an explicit statistical-scope note")

    if any(term in text for term in ("价格", "售价", "万元", "元/年")):
        if not any(term in text for term in ("硬件", "软件", "服务费", "公开可见成本", "TCO", "总拥有成本")):
            warnings.append("prices appear without separating hardware, software, service, or TCO")

    if args.report.suffix.lower() in {".html", ".htm"}:
        ids = re.findall(r"\bid=[\"']([^\"']+)[\"']", raw, flags=re.I)
        duplicate_ids = sorted(key for key, count in Counter(ids).items() if count > 1)
        if duplicate_ids:
            warnings.append(f"duplicate HTML id(s): {', '.join(duplicate_ids)}")

        local_anchors = set(re.findall(r"\bhref=[\"']#([^\"']+)[\"']", raw, flags=re.I))
        missing_anchors = sorted(anchor for anchor in local_anchors if anchor not in set(ids))
        if missing_anchors:
            warnings.append(f"missing local anchor target(s): {', '.join(missing_anchors)}")

        for src in re.findall(r"<script\b[^>]*\bsrc=[\"']([^\"']+)[\"']", raw, flags=re.I):
            if re.match(r"^(?:https?:|data:|//)", src, flags=re.I):
                continue
            local_src = src.split("?", 1)[0].split("#", 1)[0]
            if local_src and not (args.report.parent / local_src).is_file():
                warnings.append(f"missing local script: {src}")

        nav_blocks = re.findall(r"<nav\b[^>]*>.*?</nav>", raw, flags=re.I | re.S)
        max_nav_links = max((len(re.findall(r"<a\b", block, flags=re.I)) for block in nav_blocks), default=0)
        hierarchy_markers = ("aria-expanded", "<details", "nav-group", "nav-section")
        if max_nav_links >= 10 and not any(marker in raw for marker in hierarchy_markers):
            warnings.append("HTML navigation is flat; group long reports into first- and second-level sections")

        if "<table" in raw.lower() and not re.search(r"overflow(?:-x)?\s*:\s*(?:auto|scroll)", raw, flags=re.I):
            warnings.append("HTML contains a table without an evident horizontal-overflow container")

    print(f"Checked: {args.report}")
    print(f"Depth: {args.depth}")
    print(f"Visible characters: {len(text)}")
    print(f"Distinct source URLs: {url_count}")
    if warnings:
        print("Warnings:")
        for warning in warnings:
            print(f"- {warning}")
        return 1

    print("OK: required topics, date signal, scope checks, and source coverage passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
