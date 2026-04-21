#!/usr/bin/env python3
"""Rank business and technical criticality over normalized MAGIIS cases."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


P1_KEYWORDS = {"login", "auth", "gateway", "wallet", "hold", "3ds", "charge"}
STRIPE_KEYWORDS = {"gateway", "wallet", "hold on", "hold off", "3ds", "charge"}


def infer_priority(title: str, module: str) -> str:
    haystack = f"{title} {module}".lower()
    return "P1" if any(keyword in haystack for keyword in P1_KEYWORDS) else "P2"


def infer_reason(title: str, module: str) -> str:
    haystack = f"{title} {module}".lower()
    if any(keyword in haystack for keyword in STRIPE_KEYWORDS):
        return "Stripe-related critical flow"
    if any(keyword in haystack for keyword in P1_KEYWORDS):
        return "Matches P1 priority model"
    return "Default P2 prioritization"


def main() -> int:
    parser = argparse.ArgumentParser(description="Rank critical flows from normalized MAGIIS cases")
    parser.add_argument("input_file", help="Path to the normalized cases JSON")
    parser.add_argument(
        "--output",
        default="critical-flows.json",
        help="Output path for critical flow ranking",
    )
    args = parser.parse_args()

    input_path = Path(args.input_file)
    output_path = Path(args.output)

    payload = json.loads(input_path.read_text(encoding="utf-8"))
    ranked_cases = []
    for case in payload.get("cases", []):
        priority = case.get("priority") or infer_priority(case.get("title", ""), case.get("module", ""))
        ranked_cases.append(
            {
                "test_case_id": case.get("test_case_id"),
                "module": case.get("module"),
                "portal": case.get("portal"),
                "title": case.get("title"),
                "priority": priority,
                "critical_flow": bool(case.get("critical_flow", priority == "P1")),
                "reason": infer_reason(case.get("title", ""), case.get("module", "")),
                "dependencies": case.get("dependencies", []),
                "risks_gaps": case.get("risks_gaps", []),
            }
        )

    output = {
        "status": "draft",
        "summary": {
            "total_cases": len(payload.get("cases", [])),
            "critical_flows": sum(1 for case in ranked_cases if case["critical_flow"]),
            "p1_cases": sum(1 for case in ranked_cases if case["priority"] == "P1"),
            "p2_cases": sum(1 for case in ranked_cases if case["priority"] == "P2"),
        },
        "critical_flows": ranked_cases,
        "notes": [
            "Placeholder ranking script.",
            "Extend with business weighting, bug history, and Stripe-specific boosts.",
        ],
    }

    output_path.write_text(json.dumps(output, indent=2), encoding="utf-8")
    print(f"Wrote draft critical flows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
