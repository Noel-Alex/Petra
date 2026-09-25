#!/usr/bin/env python3
"""Build and run one repository-owned authoritative mechanistic dataset package."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT_ID = "ml-mechanistic-dataset"
BUNDLE_DIR_NAME = "ml-mechanistic-dataset-bundle"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.local_command import resolve_local_command  # noqa: E402


def required_path(name: str) -> Path:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise RuntimeError(f"{name} must be supplied by run_local_experiments.py")
    return Path(raw).resolve()


def repository_file(raw: str, label: str) -> Path:
    candidate = (ROOT / raw).resolve()
    try:
        candidate.relative_to(ROOT)
    except ValueError as exc:
        raise ValueError(f"{label} must stay inside the repository") from exc
    if not candidate.is_file():
        raise ValueError(f"{label} does not exist: {candidate.relative_to(ROOT)}")
    return candidate


def positive_integer(raw: str) -> int:
    value = int(raw)
    if value < 1:
        raise argparse.ArgumentTypeError("worker count must be positive")
    return value


def write_failure(result_path: Path, stage: str, return_code: int | None, message: str) -> None:
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "experiment_id": EXPERIMENT_ID,
                "status": "failed",
                "stage": stage,
                "return_code": return_code,
                "message": message,
                "evidence_boundary": (
                    "Dataset launcher/runtime failure only; no biological-validation "
                    "or model-promotion claim."
                ),
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )


def run_command(stage: str, command: list[str], env: dict[str, str], result_path: Path) -> None:
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
        write_failure(
            result_path,
            stage,
            completed.returncode,
            f"{stage} exited with code {completed.returncode}",
        )
        raise SystemExit(completed.returncode)


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Build and execute one repository-owned Petra mechanistic dataset "
            "package through the generic durable Node worker runtime."
        )
    )
    parser.add_argument(
        "--package-entry",
        required=True,
        help="repository-relative TypeScript module exporting createNodeMechanisticDatasetPackage()",
    )
    parser.add_argument(
        "--worker-entry",
        required=True,
        help="repository-relative worker module exporting executeMechanisticTask(task, data)",
    )
    parser.add_argument(
        "--workers",
        type=positive_integer,
        help="maximum local worker_threads count (defaults to the runtime CPU-aware policy)",
    )
    args = parser.parse_args()

    artifact_dir = required_path("PETRA_LOCAL_ARTIFACT_DIR")
    result_path = required_path("PETRA_LOCAL_RESULT_JSON")
    package_entry = repository_file(args.package_entry, "--package-entry")
    worker_entry = repository_file(args.worker_entry, "--worker-entry")
    artifact_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["PETRA_ML_DATASET_PACKAGE_ENTRY"] = str(package_entry.relative_to(ROOT))
    env["PETRA_ML_DATASET_WORKER_ENTRY"] = str(worker_entry.relative_to(ROOT))
    if args.workers is not None:
        env["PETRA_ML_DATASET_WORKERS"] = str(args.workers)

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
            "experiments/vite.ml_mechanistic_dataset_runtime.config.ts",
        ],
        env,
        result_path,
    )

    bundle_dir = artifact_dir / BUNDLE_DIR_NAME
    runner = bundle_dir / "runner.mjs"
    package_module = bundle_dir / "package.mjs"
    worker_module = bundle_dir / "worker.mjs"
    for path, label in (
        (runner, "runner bundle"),
        (package_module, "package bundle"),
        (worker_module, "worker bundle"),
    ):
        if not path.is_file():
            write_failure(result_path, "bundle", None, f"{label} was not produced")
            raise RuntimeError(f"{label} was not produced: {path}")

    env["PETRA_ML_DATASET_PACKAGE_MODULE_URL"] = package_module.resolve().as_uri()
    env["PETRA_ML_DATASET_WORKER_MODULE_URL"] = worker_module.resolve().as_uri()
    run_command("execute", ["node", str(runner)], env, result_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
