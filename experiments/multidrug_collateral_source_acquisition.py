#!/usr/bin/env python3
"""Acquire exact Allen 2021 Dryad source tables for Petra issue #573.

This helper is deliberately source-acquisition only. It inventories the pinned
published Dryad deposit and, when the public download endpoints permit it,
stores the small schema/genotype/phenotype tables under PETRA_LOCAL_ARTIFACT_DIR.
It never converts the paper's group-level effects into isolate parameters and
never authorizes a simultaneous multi-drug composition rule.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

EXPERIMENT_ID = "multidrug-collateral-source-acquisition"
DRYAD_ORIGIN = "https://datadryad.org"
DATASET_DOI = "10.5061/dryad.6m905qg16"
ARTICLE_DOI = "10.1128/mSystems.01055-21"
ENCODED_DATASET_ID = urllib.parse.quote(f"doi:{DATASET_DOI}", safe="")
DATASET_PATH = f"/api/v2/datasets/{ENCODED_DATASET_ID}"
MAX_JSON_BYTES = 4 * 1024 * 1024
MAX_SOURCE_FILE_BYTES = 4 * 1024 * 1024
EXPECTED_FILES = {
    "00_Readme.txt",
    "01_Mutant_wells.csv",
    "02_MG1655_Ancestor.gff3",
    "03_Sequence_Data.csv",
    "04_Optical_Densities.csv",
    "05_Phenotypes.csv",
}
ACQUIRE_FILES = {
    "00_Readme.txt",
    "01_Mutant_wells.csv",
    "03_Sequence_Data.csv",
    "04_Optical_Densities.csv",
    "05_Phenotypes.csv",
}


def required_path(name: str) -> Path:
    raw = os.environ.get(name, "").strip()
    if not raw:
        raise RuntimeError(f"{name} must be supplied by run_local_experiments.py")
    return Path(raw).resolve()


def absolute_url(href: str) -> str:
    if href.startswith("https://") or href.startswith("http://"):
        return href
    return urllib.parse.urljoin(DRYAD_ORIGIN, href)


def request_bytes(url: str, *, max_bytes: int) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json, text/plain, text/csv, */*",
            "User-Agent": "Petra-source-audit/1 (#573; public Dryad research deposit)",
        },
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        raw = response.read(max_bytes + 1)
    if len(raw) > max_bytes:
        raise RuntimeError(f"response exceeded {max_bytes} byte safety cap: {url}")
    return raw


def request_json(url: str) -> tuple[bytes, dict[str, Any]]:
    raw = request_bytes(url, max_bytes=MAX_JSON_BYTES)
    decoded = json.loads(raw.decode("utf-8"))
    if not isinstance(decoded, dict):
        raise RuntimeError(f"Dryad JSON response was not an object: {url}")
    return raw, decoded


def link_href(payload: dict[str, Any], rel: str) -> str:
    links = payload.get("_links")
    if not isinstance(links, dict):
        raise RuntimeError(f"Dryad payload missing _links for {rel}")
    link = links.get(rel)
    if not isinstance(link, dict) or not isinstance(link.get("href"), str):
        raise RuntimeError(f"Dryad payload missing link {rel}")
    return link["href"]


def parse_file_id(item: dict[str, Any]) -> int:
    value = item.get("id")
    if isinstance(value, int) and not isinstance(value, bool):
        return value
    self_href = link_href(item, "self")
    tail = self_href.rstrip("/").rsplit("/", 1)[-1]
    try:
        return int(tail)
    except ValueError as exc:
        raise RuntimeError(f"Dryad file self link has no integer id: {self_href}") from exc


def normalize_file(item: dict[str, Any]) -> dict[str, Any]:
    path = item.get("path")
    size = item.get("size")
    if not isinstance(path, str) or not path:
        raise RuntimeError("Dryad file entry is missing path")
    if not isinstance(size, int) or isinstance(size, bool) or size < 0:
        raise RuntimeError(f"Dryad file {path!r} has invalid size")
    return {
        "id": parse_file_id(item),
        "path": path,
        "size_bytes": size,
        "mime_type": item.get("mimeType"),
        "status": item.get("status"),
        "digest": item.get("digest"),
        "digest_type": item.get("digestType"),
        "download_href": link_href(item, "stash:download"),
    }


def list_files(files_href: str) -> tuple[list[dict[str, Any]], list[str]]:
    url: str | None = absolute_url(files_href)
    files: list[dict[str, Any]] = []
    response_hashes: list[str] = []
    seen_urls: set[str] = set()
    while url:
        if url in seen_urls:
            raise RuntimeError("Dryad file pagination loop detected")
        seen_urls.add(url)
        raw, payload = request_json(url)
        response_hashes.append(hashlib.sha256(raw).hexdigest())
        embedded = payload.get("_embedded")
        if not isinstance(embedded, dict):
            raise RuntimeError("Dryad files response missing _embedded")
        items = embedded.get("stash:files")
        if not isinstance(items, list):
            raise RuntimeError("Dryad files response missing stash:files")
        for item in items:
            if not isinstance(item, dict):
                raise RuntimeError("Dryad file inventory contains a non-object entry")
            files.append(normalize_file(item))
        links = payload.get("_links")
        next_link = links.get("next") if isinstance(links, dict) else None
        href = next_link.get("href") if isinstance(next_link, dict) else None
        url = absolute_url(href) if isinstance(href, str) and href else None
    files.sort(key=lambda item: (item["path"].casefold(), item["id"]))
    return files, response_hashes


def csv_shape(raw: bytes) -> dict[str, Any]:
    text = raw.decode("utf-8-sig")
    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        return {"row_count_including_header": 0, "header": []}
    return {
        "row_count_including_header": len(rows),
        "header": rows[0],
    }


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def compact_result(
    result_path: Path,
    *,
    message: str,
    inventory_ready: bool,
    source_bytes_ready: bool,
    details: dict[str, Any] | None = None,
) -> int:
    payload: dict[str, Any] = {
        "schema_version": 1,
        "experiment_id": EXPERIMENT_ID,
        "status": "blocked",
        "stage": "exact-row-extraction",
        "blocked_on_issues": [573],
        "message": message,
        "source_inventory_ready": inventory_ready,
        "source_bytes_ready": source_bytes_ready,
        "scientific_pack_authorized": False,
        "simultaneous_multidrug_composition_authorized": False,
        "article_doi": ARTICLE_DOI,
        "dataset_doi": DATASET_DOI,
        "evidence_boundary": (
            "Source acquisition only. No figure digitization, group-effect-to-isolate "
            "conversion, IC90-to-PD conversion, or multi-drug composition is authorized."
        ),
    }
    if details:
        payload["details"] = details
    write_json(result_path, payload)
    print(f"{EXPERIMENT_ID}: BLOCKED at exact row review")
    print(message)
    return 2


def main() -> int:
    artifact_dir = required_path("PETRA_LOCAL_ARTIFACT_DIR")
    result_path = required_path("PETRA_LOCAL_RESULT_JSON")
    artifact_dir.mkdir(parents=True, exist_ok=True)

    try:
        dataset_raw, dataset = request_json(absolute_url(DATASET_PATH))
        identifier = dataset.get("identifier")
        if identifier != f"doi:{DATASET_DOI}":
            raise RuntimeError(
                f"Dryad dataset identity mismatch: expected doi:{DATASET_DOI}, got {identifier!r}"
            )
        if dataset.get("visibility") not in (None, "public"):
            raise RuntimeError(f"Dryad dataset is not public: {dataset.get('visibility')!r}")

        version_href = link_href(dataset, "stash:version")
        version_raw, version = request_json(absolute_url(version_href))
        files_href = link_href(version, "stash:files")
        files, file_page_hashes = list_files(files_href)

        names = {item["path"] for item in files}
        if names != EXPECTED_FILES:
            raise RuntimeError(
                "Dryad file-set drift: expected "
                f"{sorted(EXPECTED_FILES)!r}, got {sorted(names)!r}"
            )

        inventory = {
            "schema_version": 1,
            "article_doi": ARTICLE_DOI,
            "dataset_doi": DATASET_DOI,
            "dataset_identifier": identifier,
            "dataset_title": dataset.get("title"),
            "dataset_version_number": dataset.get("versionNumber"),
            "dataset_status": dataset.get("versionStatus"),
            "dataset_license": dataset.get("license"),
            "dataset_metadata_sha256": hashlib.sha256(dataset_raw).hexdigest(),
            "version_metadata_sha256": hashlib.sha256(version_raw).hexdigest(),
            "file_page_sha256": file_page_hashes,
            "files": [
                {key: value for key, value in item.items() if key != "download_href"}
                for item in files
            ],
        }
        inventory_path = artifact_dir / "allen_2021_dryad_inventory.json"
        write_json(inventory_path, inventory)

        downloaded: list[dict[str, Any]] = []
        failures: list[dict[str, str]] = []
        by_path = {item["path"]: item for item in files}
        for path in sorted(ACQUIRE_FILES):
            item = by_path[path]
            try:
                raw = request_bytes(
                    absolute_url(item["download_href"]),
                    max_bytes=MAX_SOURCE_FILE_BYTES,
                )
                if len(raw) != item["size_bytes"]:
                    raise RuntimeError(
                        f"size mismatch: metadata={item['size_bytes']} downloaded={len(raw)}"
                    )
                local_path = artifact_dir / path
                local_path.write_bytes(raw)
                entry: dict[str, Any] = {
                    "path": path,
                    "file_id": item["id"],
                    "size_bytes": len(raw),
                    "sha256": hashlib.sha256(raw).hexdigest(),
                    "local_artifact": local_path.name,
                }
                if path.endswith(".csv"):
                    entry["csv_shape"] = csv_shape(raw)
                downloaded.append(entry)
            except (OSError, RuntimeError, urllib.error.URLError) as exc:
                failures.append({"path": path, "error": str(exc)})

        source_ready = len(downloaded) == len(ACQUIRE_FILES)
        if source_ready:
            message = (
                "Exact Dryad inventory and the five small schema/genotype/phenotype/"
                "dose-response source files were acquired. Review the readme and exact "
                "03_Sequence_Data.csv + 05_Phenotypes.csv row join before promoting one "
                "isolate. This helper intentionally stops before choosing or interpreting "
                "a numeric collateral-sensitivity record."
            )
        else:
            message = (
                "Exact Dryad inventory was acquired, but one or more source files could "
                "not be downloaded through the public API in this environment. Preserve "
                "the reported file ids/digests and resolve source-byte access before any "
                "numeric pack is authored."
            )
        return compact_result(
            result_path,
            message=message,
            inventory_ready=True,
            source_bytes_ready=source_ready,
            details={
                "local_inventory_file": inventory_path.name,
                "downloaded": downloaded,
                "download_failures": failures,
                "required_row_join": {
                    "genotype_source": "03_Sequence_Data.csv",
                    "phenotype_source": "05_Phenotypes.csv",
                    "schema_source": "00_Readme.txt",
                    "dose_response_source": "04_Optical_Densities.csv",
                    "target_context": {
                        "organism": "Escherichia coli K-12 MG1655",
                        "assay_environment": "basal",
                        "medium": "LB buffered to pH 7.0",
                        "temperature_celsius": 37,
                        "candidate_selection_drug": "streptomycin",
                        "candidate_paired_drug": "tetracycline",
                    },
                },
                "next_action": (
                    "Select one exact sequenced isolate only after matching sample identity "
                    "across genotype and phenotype tables, preserving replicate-level basal "
                    "IC90 values, source concentration units/domain, and antibiotic-free "
                    "growth. Keep per-drug PD shape and simultaneous-composition authority "
                    "separate."
                ),
            },
        )
    except (OSError, RuntimeError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
        return compact_result(
            result_path,
            message=f"Could not validate the exact Allen Dryad source deposit: {exc}",
            inventory_ready=False,
            source_bytes_ready=False,
        )


if __name__ == "__main__":
    raise SystemExit(main())
