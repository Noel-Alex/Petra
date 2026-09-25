#!/usr/bin/env python3
"""Build and run one repository-owned authoritative mechanistic dataset package."""

from __future__ import annotations

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


def required_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(
            f"{name} must be configured by experiments/local_manifest.json"
        )
    return value


def main() -> int:
    artifact_dir = required_path("PETRA_LOCAL_ARTIFACT_DIR")
    result_path = required_path("PETRA_LOCAL_RESULT_JSON")
    package_entry = repository_file(
        required_env("PETRA_ML_DATASET_PACKAGE_ENTRY"),
        "PETRA_ML_DATASET_PACKAGE_ENTRY",
    )
    artifact_dir.mkdir(parents=True, exist_ok=True)

    env = os.environ.copy()
    env["PETRA_ML_DATASET_PACKAGE_ENTRY"] = str(package_entry.relative_to(ROOT))

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
    worker_host_module = bundle_dir / "host.mjs"
    for path, label in (
        (runner, "runner bundle"),
        (package_module, "package bundle"),
        (worker_module, "fixed composed worker bundle"),
        (worker_host_module, "fixed worker host bundle"),
    ):
        if not path.is_file():
            write_failure(result_path, "bundle", None, f"{label} was not produced")
            raise RuntimeError(f"{label} was not produced: {path}")

    env["PETRA_ML_DATASET_PACKAGE_MODULE_URL"] = package_module.resolve().as_uri()
    env["PETRA_ML_DATASET_WORKER_MODULE_URL"] = worker_module.resolve().as_uri()
    env["PETRA_ML_DATASET_WORKER_HOST_MODULE_URL"] = (
        worker_host_module.resolve().as_uri()
    )
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
