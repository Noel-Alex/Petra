#!/usr/bin/env python3
"""Build and run the authoritative Node worker-thread profile locally."""

from __future__ import annotations

import json
import os
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT_ID = "ml-node-authoritative-profile"


def required_path(name: str) -> Path:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise RuntimeError(f"{name} must be supplied by run_local_experiments.py")
    return Path(raw).resolve()


def write_failure(result_path: Path, stage: str, return_code: int) -> None:
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "experiment_id": EXPERIMENT_ID,
                "status": "failed",
                "stage": stage,
                "return_code": return_code,
                "evidence_boundary": (
                    "Infrastructure-only authoritative Node worker evidence; "
                    "no biological or model-promotion claim."
                ),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def run(stage: str, command: list[str], result_path: Path) -> None:
    resolved = list(command)
    executable = shutil.which(resolved[0])
    if executable is not None:
        resolved[0] = executable
    completed = subprocess.run(
        resolved,
        cwd=ROOT,
        env=os.environ.copy(),
        check=False,
    )
    if completed.returncode != 0:
        write_failure(result_path, stage, completed.returncode)
        raise SystemExit(completed.returncode)


def main() -> int:
    artifact_dir = required_path("PETRA_LOCAL_ARTIFACT_DIR")
    result_path = required_path("PETRA_LOCAL_RESULT_JSON")
    artifact_dir.mkdir(parents=True, exist_ok=True)
    bundle_dir = artifact_dir / "ml-node-authoritative-profile-bundle"

    run(
        "bundle",
        [
            "npm",
            "exec",
            "--offline",
            "--",
            "vite",
            "build",
            "--config",
            "experiments/vite.ml_node_authoritative_profile.config.ts",
        ],
        result_path,
    )
    run(
        "execute",
        ["node", str(bundle_dir / "runner.mjs")],
        result_path,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
