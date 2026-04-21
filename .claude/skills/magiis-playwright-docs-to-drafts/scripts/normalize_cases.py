#!/usr/bin/env python3
"""Normalize parsed cases into the MAGIIS automation contract."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Normalize parsed QA cases into MAGIIS contract")
    parser.add_argument("input_file", help="Path to the parsed JSON file")
    parser.add_argument(
        "--output",
        default="normalized-test-cases.json",
        help="Output path for normalized cases",
    )
    parser.add_argument(
        "--traceability-output",
        default="traceability-map.json",
        help="Output path for the traceability map",
    )
    args = parser.parse_args()

    input_path = Path(args.input_file)
    output_path = Path(args.output)
    traceability_path = Path(args.traceability_output)

    raw_payload = json.loads(input_path.read_text(encoding="utf-8"))
    normalized = {
        "status": "draft",
        "source_file": raw_payload.get("source_file"),
        "cases": [],
        "notes": [
            "Placeholder normalizer.",
            "Add column mapping, deduplication, and environment normalization rules.",
        ],
    }
    traceability = {
        "status": "draft",
        "source_file": raw_payload.get("source_file"),
        "mappings": [],
        "notes": [
            "Placeholder traceability map.",
            "Map each source row or source ID to its normalized test case ID.",
        ],
    }

    output_path.write_text(json.dumps(normalized, indent=2), encoding="utf-8")
    traceability_path.write_text(json.dumps(traceability, indent=2), encoding="utf-8")
    print(f"Wrote draft normalized cases to {output_path}")
    print(f"Wrote draft traceability map to {traceability_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
