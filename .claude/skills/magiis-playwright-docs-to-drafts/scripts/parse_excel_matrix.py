#!/usr/bin/env python3
"""Create a draft parsed representation from a MAGIIS QA Excel matrix."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(description="Parse MAGIIS QA Excel matrix into draft JSON")
    parser.add_argument("input_file", help="Path to the source .xlsx file")
    parser.add_argument(
        "--output",
        default="parsed-excel-matrix.json",
        help="Output path for the parsed draft JSON",
    )
    args = parser.parse_args()

    input_path = Path(args.input_file)
    output_path = Path(args.output)

    payload = {
        "source_type": "xlsx",
        "source_file": input_path.name,
        "status": "draft",
        "notes": [
            "Base parser placeholder.",
            "Implement sheet discovery, column mapping, and source ID extraction before production use.",
        ],
        "rows": [],
    }

    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote draft parsed matrix to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
