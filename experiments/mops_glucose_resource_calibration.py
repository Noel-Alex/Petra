#!/usr/bin/env python3
"""Acquire and probe authoritative Knapp Dataverse sources for #938.

The helper verifies the immutable dataset inventory, then downloads one exact,
checksum-pinned 37 C D-glucose analysis script into the local artifact area.
It statically extracts only schema/file references; it never executes MATLAB,
digitizes figures, fits parameters, or promotes physical spatial authority.
"""

from __future__ import annotations

import hashlib
import json
import os
import posixpath
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
EXPERIMENT_ID = "mops-glucose-resource-calibration"
ENVIRONMENT_RECORD = (
    ROOT / "data" / "environments" / "ecoli_mg1655_mops_glucose_37c_v1.json"
)
DATAVERSE_ORIGIN = "https://dataverse.harvard.edu"
EXPECTED_DATASET_VERSION = (1, 0)
EXPECTED_FILE_COUNT = 713
EXPECTED_DATASET_UNF = "UNF:6:z2Eszn30yn1HR7lMASu3Ug=="
MAX_RESPONSE_BYTES = 25 * 1024 * 1024
MAX_PROBE_BYTES = 256 * 1024
MAX_COMPACT_CANDIDATES = 40
SOURCE_SCHEMA_PROBE = {
    "id": 10434201,
    "path": (
        "MonodLaw_Data/20211209_sugars_amino_acids/"
        "analysis_37C/analysis/monod_fit_glucose.m"
    ),
    "size_bytes": 997,
    "content_type": "text/x-matlab",
    "checksum_type": "MD5",
    "checksum": "0cb4918469c753bf034b9d52e54ed8a8",
}

KEYWORD_WEIGHTS = {
    "glucose": 12,
    "mops": 8,
    "fig9": 10,
    "fig_9": 10,
    "fig-9": 10,
    "figure9": 10,
    "figure_9": 10,
    "figure-9": 10,
    "michaelis": 6,
    "substrate": 5,
    "liquid": 4,
    "growth": 4,
    "nutrient": 3,
    "temperature": 1,
}
TABULAR_OR_ANALYSIS_SUFFIXES = {
    ".csv",
    ".tab",
    ".tsv",
    ".xlsx",
    ".xls",
    ".mat",
    ".m",
    ".txt",
}
MATLAB_FILE_REFERENCE_RE = re.compile(
    r"""(?ix)
    \b(?:load|readmatrix|readtable|importdata|xlsread)\s*
    (?:\(\s*)?
    ["']([^"']+)["']
    """
)
MATLAB_COMMAND_LOAD_RE = re.compile(r"(?im)^\s*load\s+([^\s;%]+)")
MATLAB_QUOTED_DATA_FILE_RE = re.compile(
    r"""(?i)["']([^"']+\.(?:mat|csv|tab|tsv|txt|xls|xlsx))["']"""
)
MATLAB_NUMERIC_VECTOR_RE = re.compile(
    r"""(?ms)^\s*([A-Za-z]\w*)\s*=\s*\[([^\]]+)\]\s*;"""
)
NUMBER_RE = re.compile(
    r"""(?x)
    [-+]?
    (?:
        (?:\d+(?:\.\d*)?)
        |
        (?:\.\d+)
    )
    (?:[eE][-+]?\d+)?
    """
)


def required_path(name: str) -> Path:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise RuntimeError(f"{name} must be supplied by run_local_experiments.py")
    return Path(raw).resolve()


def write_result(result_path: Path, payload: dict[str, Any]) -> None:
    result_path.parent.mkdir(parents=True, exist_ok=True)
    result_path.write_text(
        json.dumps(payload, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def fail_closed(
    result_path: Path,
    *,
    stage: str,
    message: str,
    source_inventory_ready: bool = False,
    details: dict[str, Any] | None = None,
) -> int:
    payload: dict[str, Any] = {
        "schema_version": 1,
        "experiment_id": EXPERIMENT_ID,
        "status": "blocked",
        "stage": stage,
        "blocked_on_issues": [938],
        "message": message,
        "source_inventory_ready": source_inventory_ready,
        "spatial_promotion_authorized": False,
        "calibration_fit_authorized": False,
        "evidence_boundary": (
            "Source acquisition/schema probing only. No figure digitization, parameter "
            "fit, physical spatial transport, or Science-Mode promotion is established."
        ),
    }
    if details:
        payload["details"] = details
    write_result(result_path, payload)
    print(f"{EXPERIMENT_ID}: BLOCKED after {stage}")
    print(message)
    return 2


def load_environment_record() -> dict[str, Any]:
    data = json.loads(ENVIRONMENT_RECORD.read_text(encoding="utf-8"))
    evidence = data.get("wellMixedGrowthResponseEvidence")
    if not isinstance(evidence, dict):
        raise ValueError("environment record is missing wellMixedGrowthResponseEvidence")
    persistent_id = evidence.get("datasetPersistentId")
    if persistent_id != "doi:10.7910/DVN/SC2KXZ":
        raise ValueError(
            "environment record must pin Knapp dataset doi:10.7910/DVN/SC2KXZ"
        )
    if evidence.get("temperatureCelsius") != 37:
        raise ValueError("environment record must pin the 37 C target")
    substrate = evidence.get("substrate")
    if not isinstance(substrate, dict) or substrate.get("id") != "D-glucose":
        raise ValueError("environment record must pin D-glucose")
    measured_range = substrate.get("measuredRange")
    if not isinstance(measured_range, dict) or measured_range != {
        "minimum": 0.17,
        "maximum": 11,
    }:
        raise ValueError("environment record must pin the published 0.17-11 mM range")
    if evidence.get("replicatesPerConcentration") != 3:
        raise ValueError("environment record must pin three biological replicates")
    return data


def fetch_limited(url: str, *, limit: int, accept: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": accept,
            "User-Agent": "Petra-source-audit/2 (#938; public research dataset source)",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        if response.status != 200:
            raise RuntimeError(f"Dataverse request returned HTTP {response.status}")
        raw = response.read(limit + 1)
    if len(raw) > limit:
        raise RuntimeError(f"Dataverse response exceeded {limit} byte safety cap")
    return raw


def fetch_dataset_metadata(persistent_id: str) -> tuple[bytes, dict[str, Any]]:
    encoded = urllib.parse.quote(persistent_id, safe="")
    url = (
        f"{DATAVERSE_ORIGIN}/api/datasets/:persistentId/"
        f"?persistentId={encoded}"
    )
    raw = fetch_limited(url, limit=MAX_RESPONSE_BYTES, accept="application/json")
    decoded = json.loads(raw.decode("utf-8"))
    if not isinstance(decoded, dict) or decoded.get("status") != "OK":
        raise RuntimeError("Dataverse metadata response did not report status=OK")
    data = decoded.get("data")
    if not isinstance(data, dict):
        raise RuntimeError("Dataverse metadata response is missing data")
    return raw, data


def fetch_data_file(file_id: int) -> bytes:
    url = f"{DATAVERSE_ORIGIN}/api/access/datafile/{file_id}?format=original"
    return fetch_limited(url, limit=MAX_PROBE_BYTES, accept="*/*")


def dataset_persistent_id(data: dict[str, Any], latest: dict[str, Any]) -> str:
    direct = latest.get("datasetPersistentId")
    if isinstance(direct, str):
        return direct
    protocol = data.get("protocol")
    authority = data.get("authority")
    identifier = data.get("identifier")
    if all(isinstance(value, str) and value for value in (protocol, authority, identifier)):
        return f"{protocol}:{authority}/{identifier}"
    raise RuntimeError("Dataverse metadata does not expose a canonical persistent id")


def citation_title(latest: dict[str, Any]) -> str | None:
    blocks = latest.get("metadataBlocks")
    if not isinstance(blocks, dict):
        return None
    citation = blocks.get("citation")
    if not isinstance(citation, dict):
        return None
    fields = citation.get("fields")
    if not isinstance(fields, list):
        return None
    for field in fields:
        if (
            isinstance(field, dict)
            and field.get("typeName") == "title"
            and isinstance(field.get("value"), str)
        ):
            return field["value"]
    return None


def normalized_files(latest: dict[str, Any]) -> list[dict[str, Any]]:
    files = latest.get("files")
    if not isinstance(files, list):
        raise RuntimeError("Dataverse latestVersion.files is not an array")

    normalized: list[dict[str, Any]] = []
    for item in files:
        if not isinstance(item, dict):
            raise RuntimeError("Dataverse file inventory contains a non-object entry")
        data_file = item.get("dataFile")
        if not isinstance(data_file, dict):
            raise RuntimeError("Dataverse file inventory entry is missing dataFile")
        file_id = data_file.get("id")
        filename = data_file.get("filename")
        filesize = data_file.get("filesize")
        if (
            not isinstance(file_id, int)
            or isinstance(file_id, bool)
            or not isinstance(filename, str)
            or not filename
            or not isinstance(filesize, int)
            or isinstance(filesize, bool)
            or filesize < 0
        ):
            raise RuntimeError("Dataverse file inventory contains malformed identity/size")

        directory = item.get("directoryLabel")
        if directory is None:
            directory = ""
        if not isinstance(directory, str):
            raise RuntimeError("Dataverse directoryLabel must be text when present")

        checksum = data_file.get("checksum")
        checksum_type = None
        checksum_value = None
        if isinstance(checksum, dict):
            if isinstance(checksum.get("type"), str):
                checksum_type = checksum["type"]
            if isinstance(checksum.get("value"), str):
                checksum_value = checksum["value"]

        normalized.append(
            {
                "id": file_id,
                "filename": filename,
                "directory": directory,
                "path": f"{directory}/{filename}" if directory else filename,
                "size_bytes": filesize,
                "content_type": data_file.get("contentType"),
                "checksum_type": checksum_type,
                "checksum": checksum_value,
            }
        )

    normalized.sort(key=lambda item: (item["path"].casefold(), item["id"]))
    return normalized


def candidate_score(file_record: dict[str, Any]) -> int:
    haystack = str(file_record["path"]).casefold()
    score = sum(weight for keyword, weight in KEYWORD_WEIGHTS.items() if keyword in haystack)
    suffix = Path(str(file_record["filename"])).suffix.casefold()
    if suffix in TABULAR_OR_ANALYSIS_SUFFIXES:
        score += 2
    return score


def candidate_inventory(files: list[dict[str, Any]]) -> tuple[int, list[dict[str, Any]]]:
    scored: list[tuple[int, dict[str, Any]]] = []
    for item in files:
        score = candidate_score(item)
        if score <= 2:
            continue
        scored.append((score, item))

    scored.sort(key=lambda pair: (-pair[0], pair[1]["path"].casefold(), pair[1]["id"]))
    compact = [
        {
            "score": score,
            "id": item["id"],
            "path": item["path"],
            "size_bytes": item["size_bytes"],
            "content_type": item["content_type"],
            "checksum_type": item["checksum_type"],
            "checksum": item["checksum"],
        }
        for score, item in scored[:MAX_COMPACT_CANDIDATES]
    ]
    return len(scored), compact


def require_probe_file(files: list[dict[str, Any]]) -> dict[str, Any]:
    matches = [item for item in files if item["path"] == SOURCE_SCHEMA_PROBE["path"]]
    if len(matches) != 1:
        raise RuntimeError(
            "verified Dataverse inventory must contain exactly one pinned 37 C "
            "D-glucose analysis probe"
        )
    item = matches[0]
    for key in ("id", "size_bytes", "content_type", "checksum_type", "checksum"):
        if item.get(key) != SOURCE_SCHEMA_PROBE[key]:
            raise RuntimeError(
                f"pinned source-schema probe drift for {key}: "
                f"expected {SOURCE_SCHEMA_PROBE[key]!r}, got {item.get(key)!r}"
            )
    return item


def checksum_digest(raw: bytes, checksum_type: str) -> str:
    normalized = checksum_type.strip().casefold().replace("-", "")
    algorithm = {"md5": "md5", "sha1": "sha1", "sha256": "sha256"}.get(normalized)
    if algorithm is None:
        raise RuntimeError(f"unsupported Dataverse checksum type {checksum_type!r}")
    return hashlib.new(algorithm, raw).hexdigest()


def verify_download(raw: bytes, source: dict[str, Any]) -> None:
    if len(raw) != source["size_bytes"]:
        raise RuntimeError(
            f"downloaded source size drift: expected {source['size_bytes']}, got {len(raw)}"
        )
    checksum_type = source.get("checksum_type")
    expected_checksum = source.get("checksum")
    if not isinstance(checksum_type, str) or not isinstance(expected_checksum, str):
        raise RuntimeError("source-schema probe is missing a verifiable checksum")
    actual_checksum = checksum_digest(raw, checksum_type)
    if actual_checksum.casefold() != expected_checksum.casefold():
        raise RuntimeError(
            "downloaded source checksum mismatch: "
            f"expected {expected_checksum}, got {actual_checksum}"
        )


def matlab_schema_probe(raw: bytes) -> dict[str, Any]:
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RuntimeError("source-schema probe script is not UTF-8 text") from exc

    references: set[str] = set()
    for match in MATLAB_FILE_REFERENCE_RE.finditer(text):
        reference = match.group(1).strip()
        if reference:
            references.add(reference)
    for match in MATLAB_COMMAND_LOAD_RE.finditer(text):
        reference = match.group(1).strip().strip("\"'")
        if reference:
            references.add(reference)
    for match in MATLAB_QUOTED_DATA_FILE_RE.finditer(text):
        reference = match.group(1).strip()
        if reference:
            references.add(reference)

    numeric_vectors = []
    for match in MATLAB_NUMERIC_VECTOR_RE.finditer(text):
        values = NUMBER_RE.findall(match.group(2))
        if values:
            numeric_vectors.append(
                {"identifier": match.group(1), "numeric_value_count": len(values)}
            )
    numeric_vectors.sort(key=lambda item: item["identifier"].casefold())

    return {
        "source_references": sorted(references, key=str.casefold),
        "numeric_vector_assignments": numeric_vectors,
    }


def normalize_reference(script_path: str, reference: str) -> str:
    reference = reference.replace("\\", "/").strip()
    if not reference:
        return ""
    if reference.startswith("/"):
        return posixpath.normpath(reference.lstrip("/"))
    return posixpath.normpath(posixpath.join(posixpath.dirname(script_path), reference))


def resolve_source_reference(
    files: list[dict[str, Any]],
    *,
    script_path: str,
    reference: str,
) -> dict[str, Any]:
    by_path = {item["path"].casefold(): item for item in files}
    normalized = normalize_reference(script_path, reference)
    variants = [normalized]
    if normalized and not Path(normalized).suffix:
        variants.append(f"{normalized}.mat")

    for variant in variants:
        item = by_path.get(variant.casefold())
        if item is not None:
            return {
                "reference": reference,
                "status": "resolved-exact-path",
                "id": item["id"],
                "path": item["path"],
                "size_bytes": item["size_bytes"],
                "content_type": item["content_type"],
                "checksum_type": item["checksum_type"],
                "checksum": item["checksum"],
            }

    basename = posixpath.basename(normalized).casefold()
    basename_matches = [
        item for item in files if item["filename"].casefold() == basename
    ]
    if not basename_matches and basename and not Path(basename).suffix:
        basename_matches = [
            item for item in files if item["filename"].casefold() == f"{basename}.mat"
        ]
    if len(basename_matches) == 1:
        item = basename_matches[0]
        return {
            "reference": reference,
            "status": "resolved-unique-basename",
            "id": item["id"],
            "path": item["path"],
            "size_bytes": item["size_bytes"],
            "content_type": item["content_type"],
            "checksum_type": item["checksum_type"],
            "checksum": item["checksum"],
        }
    if len(basename_matches) > 1:
        return {
            "reference": reference,
            "status": "ambiguous-basename",
            "candidate_paths": sorted(
                (item["path"] for item in basename_matches),
                key=str.casefold,
            )[:12],
            "candidate_count": len(basename_matches),
        }
    return {"reference": reference, "status": "unresolved"}


def source_probe_details(
    *,
    artifact_dir: Path,
    files: list[dict[str, Any]],
) -> dict[str, Any]:
    probe = require_probe_file(files)
    raw = fetch_data_file(probe["id"])
    verify_download(raw, probe)

    local_dir = artifact_dir / "knapp_source_schema_probe"
    local_dir.mkdir(parents=True, exist_ok=True)
    local_file = local_dir / f"{probe['id']}-{probe['filename']}"
    local_file.write_bytes(raw)

    schema = matlab_schema_probe(raw)
    resolved = [
        resolve_source_reference(
            files,
            script_path=probe["path"],
            reference=reference,
        )
        for reference in schema["source_references"]
    ]
    return {
        "probe": {
            "id": probe["id"],
            "path": probe["path"],
            "size_bytes": probe["size_bytes"],
            "content_type": probe["content_type"],
            "checksum_type": probe["checksum_type"],
            "checksum": probe["checksum"],
            "sha256": hashlib.sha256(raw).hexdigest(),
            "local_artifact_file": str(local_file.relative_to(artifact_dir)),
        },
        "static_schema": schema,
        "resolved_references": resolved,
        "exact_numeric_source_schema_ready": False,
        "limitation": (
            "The checksum-verified MATLAB script is inspected as text only. "
            "References and vector shapes do not establish variable semantics, "
            "replicate identity, uncertainty, or authorize a numerical fit."
        ),
    }


def main() -> int:
    artifact_dir = required_path("PETRA_LOCAL_ARTIFACT_DIR")
    result_path = required_path("PETRA_LOCAL_RESULT_JSON")
    artifact_dir.mkdir(parents=True, exist_ok=True)

    try:
        environment = load_environment_record()
        evidence = environment["wellMixedGrowthResponseEvidence"]
        persistent_id = evidence["datasetPersistentId"]
        raw_metadata, dataset = fetch_dataset_metadata(persistent_id)

        latest = dataset.get("latestVersion")
        if not isinstance(latest, dict):
            raise RuntimeError("Dataverse metadata is missing latestVersion")

        actual_persistent_id = dataset_persistent_id(dataset, latest)
        if actual_persistent_id != persistent_id:
            raise RuntimeError(
                "Dataverse persistent id mismatch: "
                f"expected {persistent_id!r}, got {actual_persistent_id!r}"
            )

        version = (latest.get("versionNumber"), latest.get("versionMinorNumber"))
        if version != EXPECTED_DATASET_VERSION:
            raise RuntimeError(
                "Dataverse dataset version drift: "
                f"expected {EXPECTED_DATASET_VERSION[0]}.{EXPECTED_DATASET_VERSION[1]}, "
                f"got {version[0]}.{version[1]}"
            )
        if latest.get("versionState") != "RELEASED":
            raise RuntimeError("Dataverse latest version is not RELEASED")

        actual_unf = latest.get("UNF") or latest.get("unf")
        if actual_unf is not None and actual_unf != EXPECTED_DATASET_UNF:
            raise RuntimeError(
                f"Dataverse UNF mismatch: expected {EXPECTED_DATASET_UNF}, got {actual_unf}"
            )

        files = normalized_files(latest)
        if len(files) != EXPECTED_FILE_COUNT:
            raise RuntimeError(
                f"Dataverse V1 file-count mismatch: expected {EXPECTED_FILE_COUNT}, got {len(files)}"
            )

        inventory = {
            "schema_version": 1,
            "dataset_persistent_id": persistent_id,
            "dataset_version": "1.0",
            "dataset_unf": actual_unf,
            "dataset_title": citation_title(latest),
            "metadata_sha256": hashlib.sha256(raw_metadata).hexdigest(),
            "file_count": len(files),
            "files": files,
        }
        inventory_path = artifact_dir / "knapp_sc2kxz_v1_file_inventory.json"
        inventory_path.write_text(
            json.dumps(inventory, indent=2, sort_keys=True) + "\n",
            encoding="utf-8",
        )

        candidate_count, candidates = candidate_inventory(files)
        if candidate_count == 0:
            return fail_closed(
                result_path,
                stage="source-inventory",
                message=(
                    "Exact Dataverse V1 metadata was acquired, but filename/directory "
                    "metadata did not expose a plausible glucose-growth candidate. "
                    "Inspect the local full inventory before defining any parser."
                ),
                source_inventory_ready=True,
                details={
                    "dataset_persistent_id": persistent_id,
                    "dataset_version": "1.0",
                    "dataset_unf": actual_unf,
                    "metadata_sha256": inventory["metadata_sha256"],
                    "file_count": len(files),
                    "candidate_count": 0,
                    "local_inventory_file": inventory_path.name,
                    "target_semantics": {
                        "organism": "Escherichia coli K-12 MG1655",
                        "medium": "MOPS minimal medium",
                        "substrate": "D-glucose",
                        "temperature_celsius": 37,
                        "concentration_range_mM": [0.17, 11],
                        "replicates_per_concentration": 3,
                    },
                },
            )

        probe_details = source_probe_details(artifact_dir=artifact_dir, files=files)
        return fail_closed(
            result_path,
            stage="source-schema-probe",
            message=(
                "Verified the exact Knapp Dataverse inventory and checksum-pinned "
                "37 C D-glucose MATLAB analysis script, then extracted only static "
                "source/schema references. Resolve and validate the referenced numeric "
                "source variables, replicate identity, and uncertainty representation "
                "before enabling any #657 fit."
            ),
            source_inventory_ready=True,
            details={
                "dataset_persistent_id": persistent_id,
                "dataset_version": "1.0",
                "dataset_unf": actual_unf,
                "metadata_sha256": inventory["metadata_sha256"],
                "file_count": len(files),
                "candidate_count": candidate_count,
                "candidate_list_truncated": candidate_count > len(candidates),
                "candidates": candidates,
                "local_inventory_file": inventory_path.name,
                "source_schema_probe": probe_details,
                "target_semantics": {
                    "organism": "Escherichia coli K-12 MG1655",
                    "medium": "MOPS minimal medium",
                    "substrate": "D-glucose",
                    "temperature_celsius": 37,
                    "concentration_range_mM": [0.17, 11],
                    "replicates_per_concentration": 3,
                    "response": "maximum growth rate (1/h)",
                    "uncertainty": (
                        "three biological replicate maximum-growth values; "
                        "published summary reports mean +/- 1 SD"
                    ),
                },
                "next_action": (
                    "Use the checksum-verified probe references to identify the exact "
                    "numeric source variables/table and preserve replicate-level values "
                    "plus uncertainty. Only then add the #657 fit/hold-out objective. "
                    "Physical 2-D dish/agar transport remains independently unbound."
                ),
            },
        )
    except (OSError, ValueError, RuntimeError, urllib.error.URLError, json.JSONDecodeError) as exc:
        return fail_closed(
            result_path,
            stage="source-acquisition",
            message=f"Could not validate/probe the exact Knapp Dataverse source: {exc}",
            source_inventory_ready=False,
        )


if __name__ == "__main__":
    raise SystemExit(main())
