#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import subprocess
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / "tools" / "verification_registry.json"
SCENARIO_SCHEMA = ROOT / "data" / "schemas" / "scenario.schema.json"

PRESENTATION_EVIDENCE_CLASSES = {
    "measured",
    "derived",
    "transferred",
    "calibrated",
    "mechanistic_approximation",
    "engineering",
    "visual_only",
    "hypothesis_experimental",
    "transferred_mechanistic_approximation",
}
SOURCE_REQUIRED_EVIDENCE_CLASSES = {
    "measured",
    "derived",
    "transferred",
    "mechanistic_approximation",
    "transferred_mechanistic_approximation",
}

REQUIRED = [
    "AGENTS.md", "README.md", "research/AGENTS.md", "research/CLAIM_LEDGER.md",
    "docs/AGENTS.md", "docs/TEAM_BOARD.md", "docs/ORCHESTRATOR_COMMUNICATION.md",
    "data/AGENTS.md", "src/AGENTS.md", "tools/AGENTS.md",
]


def load_json(path: Path) -> Any:
    def reject_nonfinite(token: str) -> None:
        raise ValueError(f"non-finite JSON number {token!r} is not allowed")

    return json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_nonfinite)


def contract() -> int:
    missing = [path for path in REQUIRED if not (ROOT / path).exists()]
    if missing:
        print("missing required repository contract files:", ", ".join(missing))
        return 1
    print(f"repository contract: {len(REQUIRED)} required files present")
    return 0


def json_check() -> int:
    files = list((ROOT / "data").rglob("*.json")) + [REGISTRY]
    errors = []
    for path in files:
        try:
            load_json(path)
        except Exception as exc:
            errors.append(f"{path.relative_to(ROOT)}: {exc}")
    if errors:
        print("\n".join(errors))
        return 1
    print(f"structured data: strictly parsed {len(files)} JSON files")
    return 0


def provenance() -> int:
    bad = []
    presets = (ROOT / "data" / "presets").glob("*.json") if (ROOT / "data" / "presets").exists() else []
    for path in presets:
        obj = load_json(path)
        if not obj.get("warning"):
            bad.append(f"{path.name}: missing warning")
        citations = obj.get("citations", {})
        if not isinstance(citations, dict) or not citations:
            bad.append(f"{path.name}: missing citation map")
    if bad:
        print("\n".join(bad))
        return 1
    print("provenance basics: preset warning/citation maps present")
    return 0


def _matches_json_type(value: Any, expected: str) -> bool:
    if expected == "object":
        return isinstance(value, dict)
    if expected == "array":
        return isinstance(value, list)
    if expected == "string":
        return isinstance(value, str)
    if expected == "boolean":
        return isinstance(value, bool)
    if expected == "null":
        return value is None
    if expected == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if expected == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
    return True


def _citation_references(value: Any, path: str = "$") -> list[tuple[str, Any]]:
    refs: list[tuple[str, Any]] = []
    if isinstance(value, dict):
        if "citation" in value:
            refs.append((f"{path}.citation", value["citation"]))
        if "citations" in value:
            citations = value["citations"]
            if isinstance(citations, list):
                for index, source_key in enumerate(citations):
                    refs.append((f"{path}.citations[{index}]", source_key))
            else:
                refs.append((f"{path}.citations", citations))
        for key, child in value.items():
            if key not in {"citation", "citations"}:
                refs.extend(_citation_references(child, f"{path}.{key}"))
    elif isinstance(value, list):
        for index, child in enumerate(value):
            refs.extend(_citation_references(child, f"{path}[{index}]"))
    return refs


def _nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _validate_presentation_provenance(
    record: Any,
    path: str,
    errors: list[str],
    *,
    require_context: bool = False,
) -> None:
    if not isinstance(record, dict):
        errors.append(f"{path} must be an object")
        return

    provenance = record.get("provenance")
    if not isinstance(provenance, dict):
        errors.append(f"{path}.provenance must be an object")
        return

    classification = provenance.get("classification")
    if not _nonempty_string(classification):
        errors.append(f"{path}.provenance.classification must be a non-empty string")
        return
    if classification not in PRESENTATION_EVIDENCE_CLASSES:
        errors.append(
            f"{path}.provenance.classification {classification!r} is not a supported presentation evidence class"
        )

    source_keys: list[Any] = []
    if "citation" in provenance:
        source_keys.append(provenance["citation"])
    if "citations" in provenance:
        citations = provenance["citations"]
        if isinstance(citations, list):
            source_keys.extend(citations)
        else:
            errors.append(f"{path}.provenance.citations must be an array of citation keys")

    if classification in SOURCE_REQUIRED_EVIDENCE_CLASSES and not source_keys:
        errors.append(f"{path}.provenance requires at least one citation key for {classification}")

    for index, source_key in enumerate(source_keys):
        if not _nonempty_string(source_key):
            errors.append(f"{path}.provenance source key {index} must be a non-empty string")

    if require_context and not _nonempty_string(provenance.get("context")):
        errors.append(f"{path}.provenance.context must be a non-empty string")

    if classification in {"transferred", "transferred_mechanistic_approximation"}:
        if not _nonempty_string(provenance.get("transferNote")):
            errors.append(f"{path}.provenance.transferNote is required for transferred evidence")

    if classification in {"mechanistic_approximation", "transferred_mechanistic_approximation"}:
        if not _nonempty_string(provenance.get("limitation")):
            errors.append(f"{path}.provenance.limitation is required for model approximations")

    if classification == "derived" and not _nonempty_string(provenance.get("transformation")):
        errors.append(f"{path}.provenance.transformation is required for derived evidence")

    for field in (
        "context",
        "transformation",
        "uncertainty",
        "transferNote",
        "calibrationNote",
        "limitation",
    ):
        if field in provenance and not _nonempty_string(provenance[field]):
            errors.append(f"{path}.provenance.{field} must be a non-empty string when supplied")


def scenario_contracts() -> int:
    schema = load_json(SCENARIO_SCHEMA)
    required = schema.get("required", [])
    properties = schema.get("properties", {})
    preset_dir = ROOT / "data" / "presets"
    preset_paths = sorted(preset_dir.glob("*.json")) if preset_dir.exists() else []
    errors: list[str] = []
    reference_count = 0

    for path in preset_paths:
        obj = load_json(path)
        prefix = path.name

        if not isinstance(obj, dict):
            errors.append(f"{prefix}: preset root must be an object")
            continue

        for key in required:
            if key not in obj:
                errors.append(f"{prefix}: missing schema-required field {key!r}")

        for key, spec in properties.items():
            if key not in obj or not isinstance(spec, dict):
                continue
            value = obj[key]
            expected = spec.get("type")
            allowed_types = expected if isinstance(expected, list) else [expected] if isinstance(expected, str) else []
            if allowed_types and not any(_matches_json_type(value, item) for item in allowed_types):
                errors.append(f"{prefix}: field {key!r} does not match declared type {expected!r}")
                continue
            if "const" in spec and value != spec["const"]:
                errors.append(f"{prefix}: field {key!r} must equal {spec['const']!r}")
            if "enum" in spec and value not in spec["enum"]:
                errors.append(f"{prefix}: field {key!r} must be one of {spec['enum']!r}")
            if isinstance(value, str) and "minLength" in spec and len(value) < int(spec["minLength"]):
                errors.append(f"{prefix}: field {key!r} is shorter than minLength={spec['minLength']}")
            if isinstance(value, dict) and "minProperties" in spec and len(value) < int(spec["minProperties"]):
                errors.append(f"{prefix}: field {key!r} has fewer than minProperties={spec['minProperties']}")

        drug = obj.get("drug")
        if isinstance(drug, dict) and "resourceDrugCompositionPolicy" in drug:
            policy = drug["resourceDrugCompositionPolicy"]
            policy_path = f"{prefix}: drug.resourceDrugCompositionPolicy"
            if not isinstance(policy, dict):
                errors.append(f"{policy_path} must be an object")
            else:
                for key in ("id", "classification", "equation", "stationaryPhaseCalibration"):
                    value = policy.get(key)
                    if not isinstance(value, str) or not value.strip():
                        errors.append(f"{policy_path}.{key} must be a non-empty string")
                zero_loss = policy.get("zeroDrugIncrementalLoss")
                if not isinstance(zero_loss, (int, float)) or isinstance(zero_loss, bool) or not math.isfinite(zero_loss):
                    errors.append(f"{policy_path}.zeroDrugIncrementalLoss must be a finite number")
                elif zero_loss != 0:
                    errors.append(f"{policy_path}.zeroDrugIncrementalLoss must be exactly 0")

        citations = obj.get("citations", {})
        if not isinstance(citations, dict) or not citations:
            continue

        for source_key, source in citations.items():
            if not isinstance(source, dict):
                errors.append(f"{prefix}: citation {source_key!r} must be an object")
                continue
            if not isinstance(source.get("title"), str) or not source["title"].strip():
                errors.append(f"{prefix}: citation {source_key!r} is missing a title")
            has_locator = any(isinstance(source.get(key), str) and source[key].strip() for key in ("doi", "url"))
            if not has_locator:
                errors.append(f"{prefix}: citation {source_key!r} needs a DOI or URL")

        if obj.get("id") == "ecoli-ciprofloxacin-spatial":
            environment = obj.get("environment")
            resource_context = (
                environment.get("resourceContext")
                if isinstance(environment, dict)
                else None
            )
            if not isinstance(resource_context, dict):
                errors.append(f"{prefix}: flagship environment.resourceContext must be an object")
            else:
                for key in (
                    "version",
                    "bindingStatus",
                    "representation",
                    "concentrationUnit",
                    "boundary",
                    "initialCondition",
                    "biomassMapping",
                ):
                    if not _nonempty_string(resource_context.get(key)):
                        errors.append(
                            f"{prefix}: environment.resourceContext.{key} must be a non-empty string"
                        )

                binding_status = resource_context.get("bindingStatus")
                if binding_status not in {
                    "unbound",
                    "calibrated",
                    "measured_or_transferred",
                }:
                    errors.append(
                        f"{prefix}: environment.resourceContext.bindingStatus is invalid"
                    )

                if binding_status == "unbound":
                    if resource_context.get("representation") != "dimensionless_model_resource":
                        errors.append(
                            f"{prefix}: unbound resource context must use dimensionless_model_resource"
                        )
                    if resource_context.get("concentrationUnit") != "model-resource":
                        errors.append(
                            f"{prefix}: unbound resource context must use model-resource units"
                        )
                    if resource_context.get("limitingSubstrate") is not None:
                        errors.append(
                            f"{prefix}: unbound resource context must not name a physical limiting substrate"
                        )
                    if resource_context.get("medium") is not None:
                        errors.append(
                            f"{prefix}: unbound resource context must not name a physical medium"
                        )

                reference_temperature = resource_context.get("referenceTemperatureC")
                organism = obj.get("organism")
                organism_temperature = (
                    organism.get("referenceTemperatureC")
                    if isinstance(organism, dict)
                    else None
                )
                if reference_temperature != organism_temperature:
                    errors.append(
                        f"{prefix}: resource context referenceTemperatureC must match organism referenceTemperatureC"
                    )

                if (
                    isinstance(environment, dict)
                    and resource_context.get("boundary") != environment.get("boundary")
                ):
                    errors.append(
                        f"{prefix}: resource context boundary must match environment boundary"
                    )

                _validate_presentation_provenance(
                    {"provenance": resource_context.get("provenance")},
                    f"{prefix}: environment.resourceContext",
                    errors,
                    require_context=True,
                )
                provenance_record = resource_context.get("provenance")
                if (
                    binding_status == "unbound"
                    and isinstance(provenance_record, dict)
                    and provenance_record.get("classification") != "engineering"
                ):
                    errors.append(
                        f"{prefix}: unbound resource context must be classified engineering"
                    )
                if (
                    binding_status == "unbound"
                    and isinstance(provenance_record, dict)
                    and not _nonempty_string(provenance_record.get("limitation"))
                ):
                    errors.append(
                        f"{prefix}: unbound resource context requires an explicit limitation"
                    )

            genotypes = obj.get("genotypes")
            if not isinstance(genotypes, list) or not genotypes:
                errors.append(f"{prefix}: flagship genotypes must be a non-empty array")
            else:
                for index, genotype in enumerate(genotypes):
                    _validate_presentation_provenance(
                        genotype,
                        f"{prefix}: genotypes[{index}]",
                        errors,
                        require_context=True,
                    )

            transitions = obj.get("mutationTransitions")
            if not isinstance(transitions, list) or not transitions:
                errors.append(f"{prefix}: flagship mutationTransitions must be a non-empty array")
            else:
                for index, transition in enumerate(transitions):
                    _validate_presentation_provenance(
                        transition,
                        f"{prefix}: mutationTransitions[{index}]",
                        errors,
                        require_context=True,
                    )

            policy = obj.get("drug", {}).get("resourceDrugCompositionPolicy") if isinstance(obj.get("drug"), dict) else None
            _validate_presentation_provenance(
                policy,
                f"{prefix}: drug.resourceDrugCompositionPolicy",
                errors,
                require_context=True,
            )

        for ref_path, source_key in _citation_references(obj):
            reference_count += 1
            if not isinstance(source_key, str) or not source_key.strip():
                errors.append(f"{prefix}: {ref_path} must be a non-empty citation key")
            elif source_key not in citations:
                errors.append(f"{prefix}: {ref_path} references unknown citation key {source_key!r}")

    if errors:
        print("\n".join(errors))
        return 1

    print(
        f"scenario contracts: validated {len(preset_paths)} preset(s), "
        f"top-level schema constraints, and {reference_count} citation reference(s)"
    )
    return 0


def orchestrate(mode: str, list_only: bool = False) -> int:
    reg = load_json(REGISTRY)
    selected = [check for check in reg["checks"] if mode in check["modes"]]
    if list_only:
        for check in selected:
            print(check["id"])
        return 0

    result = 0
    for check in selected:
        proc = subprocess.run(check["command"], cwd=ROOT, text=True, capture_output=True)
        state = "PASS" if proc.returncode == 0 else "FAIL"
        print(f"[{state}] {check['id']}")
        output = (proc.stdout + proc.stderr).strip()
        if output:
            print(output)
        result = max(result, proc.returncode)
    return result


def main() -> int:
    args = sys.argv[1:]
    if args == ["_contract"]:
        return contract()
    if args == ["_json"]:
        return json_check()
    if args == ["_provenance"]:
        return provenance()
    if args == ["_scenario"]:
        return scenario_contracts()

    list_only = False
    if args and args[0] == "--list":
        list_only = True
        args = args[1:]

    mode = args[0] if args else "quick"
    if mode not in {"quick", "premerge"}:
        print("usage: python tools/verify.py [--list] {quick|premerge}", file=sys.stderr)
        return 2
    return orchestrate(mode, list_only)


if __name__ == "__main__":
    raise SystemExit(main())
