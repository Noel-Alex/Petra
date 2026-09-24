#!/usr/bin/env python3
"""Petra's single manual laptop experiment entrypoint.

This runner is intentionally local-only. It refuses common CI environments,
executes experiments registered in experiments/local_manifest.json, stores bulky
working artifacts under .petra_local/, writes compact evidence to
experiments/results/, and can explicitly commit/push only that evidence.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any

from tools.local_command import resolve_local_command

ROOT = Path(__file__).resolve().parent
MANIFEST = ROOT / "experiments" / "local_manifest.json"
RESULTS_ROOT = ROOT / "experiments" / "results"
LOCAL_ROOT = ROOT / ".petra_local"
DEFAULT_LOG_TAIL_BYTES = 64 * 1024
DEFAULT_MAX_GIT_FILE_BYTES = 2 * 1024 * 1024

VALID_EXPERIMENT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")

CI_ENV_KEYS = (
    "CI",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "BUILDKITE",
    "CIRCLECI",
    "TF_BUILD",
    "JENKINS_URL",
    "BUILD_BUILDID",
)


def truthy_env(name: str) -> bool:
    value = os.environ.get(name)
    return bool(value and value.strip().lower() not in {"0", "false", "no", "off"})


def refuse_ci() -> None:
    active = [name for name in CI_ENV_KEYS if truthy_env(name)]
    if active:
        raise SystemExit(
            "Refusing to run Petra local experiments in CI/hosted automation. "
            f"Detected: {', '.join(active)}"
        )


def load_manifest() -> dict[str, Any]:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    experiments = data.get("experiments")
    if not isinstance(experiments, list):
        raise ValueError("experiments/local_manifest.json must contain an experiments array")
    ids: set[str] = set()
    for item in experiments:
        if not isinstance(item, dict):
            raise ValueError("every experiment registration must be an object")
        exp_id = item.get("id")
        command = item.get("command")
        if not isinstance(exp_id, str) or not VALID_EXPERIMENT_ID.fullmatch(exp_id):
            raise ValueError(
                "every experiment id must match [A-Za-z0-9][A-Za-z0-9._-]*"
            )
        if exp_id in ids:
            raise ValueError(f"duplicate experiment id: {exp_id}")
        ids.add(exp_id)
        if not isinstance(command, list) or not command or not all(isinstance(x, str) for x in command):
            raise ValueError(f"{exp_id}: command must be a non-empty string array")
        env = item.get("env", {})
        if not isinstance(env, dict) or not all(
            isinstance(key, str) and isinstance(value, str) for key, value in env.items()
        ):
            raise ValueError(f"{exp_id}: env must map strings to strings")
        timeout_seconds = item.get("timeout_seconds", 3600)
        if not isinstance(timeout_seconds, int) or isinstance(timeout_seconds, bool) or timeout_seconds <= 0:
            raise ValueError(f"{exp_id}: timeout_seconds must be a positive integer")
    return data


def short_command(argv: list[str], timeout: int = 8) -> str | None:
    try:
        proc = subprocess.run(
            resolve_local_command(argv),
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    output = (proc.stdout or proc.stderr).strip()
    return output.splitlines()[0] if output else None


def machine_metadata() -> dict[str, Any]:
    gpu = None
    if shutil.which("nvidia-smi"):
        gpu = short_command(
            [
                "nvidia-smi",
                "--query-gpu=name,driver_version,memory.total",
                "--format=csv,noheader",
            ]
        )
    return {
        "recorded_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "os": platform.platform(),
        "system": platform.system(),
        "release": platform.release(),
        "machine": platform.machine(),
        "processor": platform.processor(),
        "logical_cpu_count": os.cpu_count(),
        "python": sys.version.splitlines()[0],
        "node": short_command(["node", "--version"]),
        "npm": short_command(["npm", "--version"]),
        "nvidia_gpu": gpu,
    }


def safe_repo_path(relative: str) -> Path:
    candidate = (ROOT / relative).resolve()
    try:
        candidate.relative_to(ROOT)
    except ValueError as exc:
        raise ValueError(f"path escapes repository: {relative}") from exc
    return candidate


def read_tail(path: Path, limit: int) -> str:
    if not path.exists():
        return ""
    size = path.stat().st_size
    with path.open("rb") as handle:
        if size > limit:
            handle.seek(size - limit)
        raw = handle.read(limit)
    return raw.decode("utf-8", errors="replace")


def run_experiment(item: dict[str, Any], run_id: str, log_tail_bytes: int) -> dict[str, Any]:
    exp_id = item["id"]
    cwd = safe_repo_path(item.get("cwd", "."))
    timeout_seconds = int(item.get("timeout_seconds", 3600))
    local_dir = LOCAL_ROOT / "runs" / run_id / exp_id
    local_dir.mkdir(parents=True, exist_ok=True)
    log_path = local_dir / "output.log"

    env = os.environ.copy()
    env["PETRA_LOCAL_RUN_ID"] = run_id
    env["PETRA_LOCAL_EXPERIMENT_ID"] = exp_id
    env["PETRA_LOCAL_ARTIFACT_DIR"] = str(local_dir / "artifacts")
    env["PETRA_LOCAL_RESULT_JSON"] = str(local_dir / "compact-result.json")
    Path(env["PETRA_LOCAL_ARTIFACT_DIR"]).mkdir(parents=True, exist_ok=True)
    for key, value in item.get("env", {}).items():
        if not isinstance(key, str) or not isinstance(value, str):
            raise ValueError(f"{exp_id}: env must map strings to strings")
        env[key] = value

    started = time.perf_counter()
    return_code: int | None = None
    status = "failed"
    error: str | None = None

    try:
        with log_path.open("wb") as log_handle:
            proc = subprocess.run(
                resolve_local_command(item["command"]),
                cwd=cwd,
                env=env,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                timeout=timeout_seconds,
                check=False,
            )
        return_code = proc.returncode
        status = "passed" if proc.returncode == 0 else "failed"
    except subprocess.TimeoutExpired:
        status = "timeout"
        error = f"timed out after {timeout_seconds}s"
    except OSError as exc:
        status = "error"
        error = str(exc)

    elapsed = time.perf_counter() - started
    compact_result = None
    compact_result_path = Path(env["PETRA_LOCAL_RESULT_JSON"])
    if compact_result_path.exists():
        try:
            compact_result = json.loads(compact_result_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            status = "failed"
            error = f"invalid compact result JSON: {exc}"

    return {
        "id": exp_id,
        "description": item.get("description", ""),
        "issues": item.get("issues", []),
        "command": item["command"],
        "cwd": str(cwd.relative_to(ROOT)),
        "status": status,
        "return_code": return_code,
        "duration_seconds": round(elapsed, 6),
        "timeout_seconds": timeout_seconds,
        "error": error,
        "log_tail": read_tail(log_path, log_tail_bytes),
        "local_artifact_dir": str((local_dir / "artifacts").relative_to(ROOT)),
        "compact_result": compact_result,
    }


def evidence_size_guard(run_dir: Path, max_bytes: int) -> None:
    oversized: list[str] = []
    for path in run_dir.rglob("*"):
        if path.is_file() and path.stat().st_size > max_bytes:
            oversized.append(f"{path.relative_to(ROOT)} ({path.stat().st_size} bytes)")
    if oversized:
        raise RuntimeError(
            "Refusing Git evidence larger than the configured per-file limit. "
            "Move bulky output to PETRA_LOCAL_ARTIFACT_DIR instead:\n- "
            + "\n- ".join(oversized)
        )


def git(args: list[str], *, capture: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["git", *args],
        cwd=ROOT,
        text=True,
        capture_output=capture,
        check=False,
    )


def commit_and_push(run_dir: Path) -> None:
    pre_staged = git(["diff", "--cached", "--name-only"], capture=True)
    if pre_staged.returncode != 0:
        raise RuntimeError(pre_staged.stderr.strip() or "could not inspect staged Git changes")
    staged = [line.strip() for line in pre_staged.stdout.splitlines() if line.strip()]
    if staged:
        raise RuntimeError(
            "Refusing --push because files are already staged. Commit/unstage them first: "
            + ", ".join(staged)
        )

    add = git(["add", "--", str(run_dir.relative_to(ROOT))], capture=True)
    if add.returncode != 0:
        raise RuntimeError(add.stderr.strip() or "git add failed")

    staged_now = git(["diff", "--cached", "--name-only"], capture=True)
    paths = [line.strip() for line in staged_now.stdout.splitlines() if line.strip()]
    if not paths:
        print("No new compact experiment evidence to commit.")
        return
    if any(not path.startswith("experiments/results/") for path in paths):
        git(["reset"], capture=True)
        raise RuntimeError("Refusing to commit anything outside experiments/results/")

    branch = git(["rev-parse", "--abbrev-ref", "HEAD"], capture=True)
    branch_name = branch.stdout.strip()
    if branch.returncode != 0 or not branch_name or branch_name == "HEAD":
        git(["reset"], capture=True)
        raise RuntimeError("Refusing --push from a detached or unknown Git branch")

    commit = git(["commit", "-m", f"Record local experiment evidence {run_dir.name}"], capture=True)
    if commit.returncode != 0:
        git(["reset"], capture=True)
        raise RuntimeError(commit.stderr.strip() or commit.stdout.strip() or "git commit failed")

    push = git(["push", "origin", "HEAD"], capture=True)
    if push.returncode != 0:
        raise RuntimeError(
            "Evidence was committed locally but push failed: "
            + (push.stderr.strip() or push.stdout.strip())
        )
    print(f"Pushed compact evidence from {run_dir.relative_to(ROOT)} on branch {branch_name}.")


def main() -> int:
    refuse_ci()

    parser = argparse.ArgumentParser(description="Run registered Petra laptop-only experiments.")
    parser.add_argument("--list", action="store_true", help="list registered experiments and exit")
    parser.add_argument(
        "--only",
        action="append",
        default=[],
        metavar="ID",
        help="run only this experiment id (repeatable)",
    )
    parser.add_argument(
        "--push",
        action="store_true",
        help="after running, commit and push only compact experiments/results evidence",
    )
    parser.add_argument(
        "--max-git-file-mb",
        type=float,
        default=DEFAULT_MAX_GIT_FILE_BYTES / (1024 * 1024),
        help="maximum size of any generated Git-tracked evidence file",
    )
    args = parser.parse_args()

    manifest = load_manifest()
    experiments: list[dict[str, Any]] = manifest["experiments"]

    if args.list:
        if not experiments:
            print("No local experiments are currently registered.")
            return 0
        for item in experiments:
            issues = ", ".join(str(x) for x in item.get("issues", [])) or "-"
            print(f"{item['id']}: {item.get('description', '')} [issues: {issues}]")
        return 0

    requested = set(args.only)
    if requested:
        known = {item["id"] for item in experiments}
        unknown = sorted(requested - known)
        if unknown:
            raise SystemExit("Unknown experiment id(s): " + ", ".join(unknown))
        experiments = [item for item in experiments if item["id"] in requested]

    if not experiments:
        print("No local experiments are currently registered.")
        return 0

    run_id = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    run_dir = RESULTS_ROOT / run_id
    run_dir.mkdir(parents=True, exist_ok=False)

    metadata = machine_metadata()
    results: list[dict[str, Any]] = []
    for item in experiments:
        print(f"==> {item['id']}")
        result = run_experiment(item, run_id, DEFAULT_LOG_TAIL_BYTES)
        results.append(result)
        (run_dir / f"{item['id']}.json").write_text(
            json.dumps(result, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )
        print(f"    {result['status']} ({result['duration_seconds']}s)")

    summary = {
        "schema_version": 1,
        "run_id": run_id,
        "manifest_version": manifest.get("schema_version", 1),
        "environment": metadata,
        "experiment_count": len(results),
        "passed": sum(result["status"] == "passed" for result in results),
        "failed": sum(result["status"] != "passed" for result in results),
        "results": [
            {
                "id": result["id"],
                "status": result["status"],
                "issues": result["issues"],
                "duration_seconds": result["duration_seconds"],
            }
            for result in results
        ],
    }
    (run_dir / "run.json").write_text(
        json.dumps(summary, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )

    max_bytes = int(args.max_git_file_mb * 1024 * 1024)
    if max_bytes <= 0:
        raise SystemExit("--max-git-file-mb must be positive")
    evidence_size_guard(run_dir, max_bytes)

    print(f"Compact evidence: {run_dir.relative_to(ROOT)}")
    print(f"Bulky/local artifacts: {(LOCAL_ROOT / 'runs' / run_id).relative_to(ROOT)}")
    if args.push:
        commit_and_push(run_dir)

    return 0 if all(result["status"] == "passed" for result in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
