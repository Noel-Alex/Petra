#!/usr/bin/env python3
"""Truthful placeholder for registered Petra laptop experiments blocked on prerequisites.

This helper exists so long-lead experiment IDs can be registered before their
implementation prerequisites land without pretending that a placeholder run is
scientific evidence. It writes a compact machine-readable blocked result to the
runner-provided result path, prints the exact GitHub blockers, and exits nonzero.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Report an intentionally blocked Petra local experiment."
    )
    parser.add_argument("--experiment-id", required=True)
    parser.add_argument(
        "--blocked-on",
        action="append",
        required=True,
        type=int,
        metavar="ISSUE",
        help="GitHub issue number that must land before this experiment can run",
    )
    parser.add_argument("--reason", required=True)
    args = parser.parse_args()

    blockers = sorted(set(args.blocked_on))
    result = {
        "schema_version": 1,
        "experiment_id": args.experiment_id,
        "status": "blocked",
        "blocked_on_issues": blockers,
        "reason": args.reason,
        "next_action": (
            "Land the listed prerequisite issue(s), then replace this gate command "
            "with the real experiment helper while preserving the stable experiment id."
        ),
    }

    result_path = os.environ.get("PETRA_LOCAL_RESULT_JSON")
    if result_path:
        path = Path(result_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    blockers_text = ", ".join(f"#{issue}" for issue in blockers)
    print(f"{args.experiment_id}: BLOCKED on {blockers_text}")
    print(args.reason)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
