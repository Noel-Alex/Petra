#!/usr/bin/env python3
"""Run Petra's first authoritative aggregate constant/ridge benchmark locally."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT_ID = "ml-aggregate-benchmark"
GENERATION_EXPERIMENT_ID = "ml-mechanistic-dataset"
PACKAGE_ID = "flagship-first-aggregate-no-intervention-v2"
OUTPUT_BASE_NAME = "flagship-first-aggregate-mechanistic-v2"
BUNDLE_DIR_NAME = "ml-aggregate-benchmark-bundle"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.local_command import resolve_local_command  # noqa: E402


def required_path(name: str) -> Path:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise RuntimeError(f"{name} must be supplied by run_local_experiments.py")
    return Path(raw).resolve()


def write_compact(result_path: Path, payload: dict[str, Any]) -> None:
    result_path.parent.mkdir(parents=True, exist_ok=True)
    temporary = result_path.with_suffix(result_path.suffix + ".partial")
    temporary.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    temporary.replace(result_path)


def compact_generation_is_eligible(path: Path) -> bool:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    if not isinstance(payload, dict):
        return False
    if (
        payload.get("schema_version") != 1
        or payload.get("experiment_id") != GENERATION_EXPERIMENT_ID
        or payload.get("package_id") != PACKAGE_ID
    ):
        return False
    evidence = payload.get("generation_evidence")
    if not isinstance(evidence, dict):
        return False
    source = evidence.get("source")
    return (
        evidence.get("status") == "complete"
        and evidence.get("artifactIntegrityVerified") is True
        and evidence.get("promotionEvidence") is False
        and isinstance(evidence.get("dataset"), dict)
        and isinstance(source, dict)
        and source.get("repositoryDirty") is False
        and source.get("sourceStateMatchesCommit") is True
    )


def candidate_run_ids() -> list[str]:
    runs_root = ROOT / ".petra_local" / "runs"
    current = os.environ.get("PETRA_LOCAL_RUN_ID", "").strip()
    observed = (
        sorted(
            (
                path.name
                for path in runs_root.iterdir()
                if path.is_dir()
            ),
            reverse=True,
        )
        if runs_root.is_dir()
        else []
    )
    if current and current in observed:
        return [current, *[run_id for run_id in observed if run_id != current]]
    return observed


def find_dataset_source() -> tuple[str, Path, Path, Path] | None:
    runs_root = ROOT / ".petra_local" / "runs"
    for run_id in candidate_run_ids():
        generation_dir = runs_root / run_id / GENERATION_EXPERIMENT_ID
        compact = generation_dir / "compact-result.json"
        if not compact_generation_is_eligible(compact):
            continue
        output = (
            generation_dir
            / "artifacts"
            / PACKAGE_ID
            / "output"
        )
        dataset = output / f"{OUTPUT_BASE_NAME}.jsonl"
        finalization = output / f"{OUTPUT_BASE_NAME}.finalization.json"
        if dataset.is_file() and finalization.is_file():
            return run_id, dataset.resolve(), finalization.resolve(), compact.resolve()
    return None


def write_blocked(result_path: Path) -> None:
    write_compact(
        result_path,
        {
            "schema_version": 1,
            "experiment_id": EXPERIMENT_ID,
            "status": "blocked",
            "blocked_on": [594],
            "reason": (
                "No clean, integrity-verified first-aggregate v2 dataset produced by "
                "the registered ml-mechanistic-dataset experiment exists under "
                ".petra_local. Generate it through python run_local_experiments.py "
                "after #594 local worker verification; do not supply an ad-hoc JSONL."
            ),
            "promotion_evidence": False,
            "evidence_boundary": (
                "Preparation/availability signal only; no model-quality, biological-"
                "validation, or promotion claim."
            ),
        },
    )


def write_failure(
    result_path: Path,
    stage: str,
    return_code: int | None,
    message: str,
) -> None:
    write_compact(
        result_path,
        {
            "schema_version": 1,
            "experiment_id": EXPERIMENT_ID,
            "status": "failed",
            "stage": stage,
            "return_code": return_code,
            "message": message,
            "promotion_evidence": False,
            "evidence_boundary": (
                "Benchmark launcher/runtime failure only; no biological-validation "
                "or model-promotion claim."
            ),
        },
    )


def run_command(
    stage: str,
    command: list[str],
    env: dict[str, str],
    result_path: Path,
    *,
    preserve_result_on_failure: bool = False,
) -> None:
    try:
        completed = subprocess.run(
            resolve_local_command(command, env=env),
            cwd=ROOT,
            env=env,
            check=False,
        )
    except OSError as exc:
        write_failure(result_path, stage, None, str(exc))
        raise
    if completed.returncode != 0:
        if not preserve_result_on_failure or not result_path.is_file():
            write_failure(
                result_path,
                stage,
                completed.returncode,
                f"{stage} exited with code {completed.returncode}",
            )
        raise SystemExit(completed.returncode)


def main() -> int:
    artifact_dir = required_path("PETRA_LOCAL_ARTIFACT_DIR")
    result_path = required_path("PETRA_LOCAL_RESULT_JSON")
    artifact_dir.mkdir(parents=True, exist_ok=True)

    source = find_dataset_source()
    if source is None:
        write_blocked(result_path)
        print(
            "ml-aggregate-benchmark is prepared but no eligible finalized "
            "first-aggregate v2 dataset is available locally.",
            file=sys.stderr,
        )
        return 2

    source_run_id, dataset, finalization, generation_evidence = source
    env = os.environ.copy()
    env["PETRA_ML_BENCHMARK_SOURCE_RUN_ID"] = source_run_id
    env["PETRA_ML_BENCHMARK_DATASET_PATH"] = str(dataset)
    env["PETRA_ML_BENCHMARK_FINALIZATION_PATH"] = str(finalization)
    env["PETRA_ML_BENCHMARK_GENERATION_EVIDENCE_PATH"] = str(generation_evidence)

    run_command(
        "bundle",
        [
            "npm",
            "exec",
            "--offline",
            "--",
            "vite",
            "build",
            "--config",
            "experiments/vite.ml_aggregate_benchmark.config.ts",
        ],
        env,
        result_path,
    )

    runner = artifact_dir / BUNDLE_DIR_NAME / "runner.mjs"
    if not runner.is_file():
        write_failure(result_path, "bundle", None, "benchmark runner bundle was not produced")
        raise RuntimeError(f"benchmark runner bundle was not produced: {runner}")

    run_command(
        "execute",
        ["node", str(runner)],
        env,
        result_path,
        preserve_result_on_failure=True,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
