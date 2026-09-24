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
    run_preset_dir = ROOT / "data" / "run_presets"
    run_preset_paths = (
        sorted(run_preset_dir.glob("*.json")) if run_preset_dir.exists() else []
    )
    errors: list[str] = []
    reference_count = 0
    scenario_index: dict[tuple[str, str], dict[str, Any]] = {}

    for path in preset_paths:
        obj = load_json(path)
        prefix = path.name

        if not isinstance(obj, dict):
            errors.append(f"{prefix}: preset root must be an object")
            continue

        scenario_id = obj.get("id")
        scenario_version = obj.get("version")
        if _nonempty_string(scenario_id) and _nonempty_string(scenario_version):
            identity = (scenario_id, scenario_version)
            if identity in scenario_index:
                errors.append(
                    f"{prefix}: duplicate scenario identity {scenario_id}@{scenario_version}"
                )
            else:
                scenario_index[identity] = obj

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

            execution_profile = obj.get("executionProfile")
            profile_path = f"{prefix}: executionProfile"
            if not isinstance(execution_profile, dict):
                errors.append(f"{profile_path} must be an object")
            else:
                if execution_profile.get("schemaVersion") != 1:
                    errors.append(f"{profile_path}.schemaVersion must equal 1")
                for key in ("id", "version", "scenarioId", "scenarioVersion", "resourceContextVersion"):
                    if not _nonempty_string(execution_profile.get(key)):
                        errors.append(f"{profile_path}.{key} must be a non-empty string")
                if execution_profile.get("scenarioId") != obj.get("id"):
                    errors.append(f"{profile_path}.scenarioId must match scenario id")
                if execution_profile.get("scenarioVersion") != obj.get("version"):
                    errors.append(f"{profile_path}.scenarioVersion must match scenario version")
                if (
                    isinstance(resource_context, dict)
                    and execution_profile.get("resourceContextVersion") != resource_context.get("version")
                ):
                    errors.append(
                        f"{profile_path}.resourceContextVersion must match environment.resourceContext.version"
                    )
                if execution_profile.get("classification") != "engineering":
                    errors.append(f"{profile_path}.classification must be engineering")

                units = execution_profile.get("units")
                expected_units = {
                    "time": "hour",
                    "resource": "model-resource",
                    "biomass": "model-biomass",
                }
                if units != expected_units:
                    errors.append(
                        f"{profile_path}.units must equal {expected_units!r}"
                    )

                hours_per_tick = execution_profile.get("hoursPerTick")
                if (
                    not isinstance(hours_per_tick, (int, float))
                    or isinstance(hours_per_tick, bool)
                    or not math.isfinite(hours_per_tick)
                    or hours_per_tick <= 0
                ):
                    errors.append(f"{profile_path}.hoursPerTick must be positive and finite")

                growth = execution_profile.get("growth")
                if not isinstance(growth, dict):
                    errors.append(f"{profile_path}.growth must be an object")
                else:
                    expected_growth_keys = {
                        "maxDivisionRate",
                        "halfSaturation",
                        "biomassYield",
                        "localCapacity",
                        "spreadRate",
                    }
                    if set(growth) != expected_growth_keys:
                        errors.append(
                            f"{profile_path}.growth must contain exactly {sorted(expected_growth_keys)!r}"
                        )
                    for key in expected_growth_keys:
                        value = growth.get(key)
                        if (
                            not isinstance(value, (int, float))
                            or isinstance(value, bool)
                            or not math.isfinite(value)
                        ):
                            errors.append(f"{profile_path}.growth.{key} must be finite")
                            continue
                        if key in {"halfSaturation", "biomassYield", "localCapacity"}:
                            if value <= 0:
                                errors.append(f"{profile_path}.growth.{key} must be positive")
                        elif value < 0:
                            errors.append(f"{profile_path}.growth.{key} must be non-negative")
                    spread_rate = growth.get("spreadRate")
                    if (
                        isinstance(spread_rate, (int, float))
                        and not isinstance(spread_rate, bool)
                        and math.isfinite(spread_rate)
                        and isinstance(hours_per_tick, (int, float))
                        and not isinstance(hours_per_tick, bool)
                        and math.isfinite(hours_per_tick)
                        and hours_per_tick > 0
                        and spread_rate * hours_per_tick > 0.25
                    ):
                        errors.append(
                            f"{profile_path}: spreadRate * hoursPerTick must be <= 0.25"
                        )

                expected_targets = {
                    "positive-early-growth",
                    "resource-depletion",
                    "zero-resource-no-growth",
                    "capacity-bound",
                    "conservative-neighbour-spread",
                }
                targets = execution_profile.get("behaviorTargets")
                valid_target_list = (
                    isinstance(targets, list)
                    and all(isinstance(target, str) for target in targets)
                )
                if (
                    not valid_target_list
                    or len(targets) != len(expected_targets)
                    or set(targets) != expected_targets
                ):
                    errors.append(
                        f"{profile_path}.behaviorTargets must contain exactly the flagship engineering target set"
                    )

                _validate_presentation_provenance(
                    execution_profile,
                    profile_path,
                    errors,
                    require_context=True,
                )
                profile_provenance = execution_profile.get("provenance")
                if isinstance(profile_provenance, dict):
                    if profile_provenance.get("classification") != "engineering":
                        errors.append(
                            f"{profile_path}.provenance.classification must be engineering"
                        )
                    if not _nonempty_string(profile_provenance.get("calibrationNote")):
                        errors.append(
                            f"{profile_path}.provenance.calibrationNote is required"
                        )
                    if not _nonempty_string(profile_provenance.get("limitation")):
                        errors.append(
                            f"{profile_path}.provenance.limitation is required"
                        )

            engineering_defaults = (
                environment.get("engineeringDefaults")
                if isinstance(environment, dict)
                else None
            )
            defaults_path = f"{prefix}: environment.engineeringDefaults"
            if not isinstance(engineering_defaults, dict):
                errors.append(f"{defaults_path} must be an object")
            else:
                if (
                    not isinstance(engineering_defaults.get("gridSize"), int)
                    or isinstance(engineering_defaults.get("gridSize"), bool)
                    or engineering_defaults.get("gridSize") < 3
                ):
                    errors.append(f"{defaults_path}.gridSize must be an integer >= 3")
                for key in ("dishRadiusCells", "cellSize"):
                    value = engineering_defaults.get(key)
                    if (
                        not isinstance(value, (int, float))
                        or isinstance(value, bool)
                        or not math.isfinite(value)
                        or value <= 0
                    ):
                        errors.append(f"{defaults_path}.{key} must be positive and finite")
                if engineering_defaults.get("cellSizeUnit") != "model-grid-cell":
                    errors.append(
                        f"{defaults_path}.cellSizeUnit must equal 'model-grid-cell'"
                    )

            composed_set = obj.get("composedParameterSet")
            composed_path = f"{prefix}: composedParameterSet"
            if not isinstance(composed_set, dict):
                errors.append(f"{composed_path} must be an object")
            else:
                if composed_set.get("schemaVersion") != 1:
                    errors.append(f"{composed_path}.schemaVersion must equal 1")
                for key in (
                    "id",
                    "version",
                    "scenarioId",
                    "scenarioVersion",
                    "executionProfileId",
                    "executionProfileVersion",
                    "resourceContextVersion",
                    "lossPolicyId",
                ):
                    if not _nonempty_string(composed_set.get(key)):
                        errors.append(f"{composed_path}.{key} must be a non-empty string")

                if composed_set.get("scenarioId") != obj.get("id"):
                    errors.append(f"{composed_path}.scenarioId must match scenario id")
                if composed_set.get("scenarioVersion") != obj.get("version"):
                    errors.append(
                        f"{composed_path}.scenarioVersion must match scenario version"
                    )
                if composed_set.get("geometrySource") != "environment.engineeringDefaults":
                    errors.append(
                        f"{composed_path}.geometrySource must equal 'environment.engineeringDefaults'"
                    )

                if isinstance(execution_profile, dict):
                    if composed_set.get("executionProfileId") != execution_profile.get("id"):
                        errors.append(
                            f"{composed_path}.executionProfileId must match executionProfile.id"
                        )
                    if composed_set.get("executionProfileVersion") != execution_profile.get("version"):
                        errors.append(
                            f"{composed_path}.executionProfileVersion must match executionProfile.version"
                        )
                if isinstance(resource_context, dict):
                    if composed_set.get("resourceContextVersion") != resource_context.get("version"):
                        errors.append(
                            f"{composed_path}.resourceContextVersion must match environment.resourceContext.version"
                        )

                drug = obj.get("drug")
                active_policy = (
                    drug.get("resourceDrugCompositionPolicy")
                    if isinstance(drug, dict)
                    else None
                )
                if not isinstance(active_policy, dict):
                    errors.append(
                        f"{prefix}: drug.resourceDrugCompositionPolicy must be an object"
                    )
                else:
                    if composed_set.get("lossPolicyId") != active_policy.get("id"):
                        errors.append(
                            f"{composed_path}.lossPolicyId must match active drug loss policy"
                        )
                    if active_policy.get("zeroDrugIncrementalLoss") != 0:
                        errors.append(
                            f"{composed_path}: baseline loss policy requires exact zeroDrugIncrementalLoss"
                        )

                genotype_ids = set()
                raw_genotypes = obj.get("genotypes")
                if isinstance(raw_genotypes, list):
                    for genotype in raw_genotypes:
                        if isinstance(genotype, dict) and _nonempty_string(genotype.get("id")):
                            genotype_ids.add(genotype["id"])

                lineages = composed_set.get("lineages")
                if not isinstance(lineages, list) or not lineages:
                    errors.append(f"{composed_path}.lineages must be a non-empty array")
                else:
                    seen_lineage_ids: set[str] = set()
                    for index, lineage in enumerate(lineages):
                        lineage_path = f"{composed_path}.lineages[{index}]"
                        if not isinstance(lineage, dict):
                            errors.append(f"{lineage_path} must be an object")
                            continue
                        lineage_id = lineage.get("id")
                        genotype_id = lineage.get("genotypeId")
                        if not _nonempty_string(lineage_id):
                            errors.append(f"{lineage_path}.id must be a non-empty string")
                        elif lineage_id in seen_lineage_ids:
                            errors.append(f"{lineage_path}.id must be unique")
                        else:
                            seen_lineage_ids.add(lineage_id)
                        if not _nonempty_string(genotype_id):
                            errors.append(
                                f"{lineage_path}.genotypeId must be a non-empty string"
                            )
                        elif genotype_id not in genotype_ids:
                            errors.append(
                                f"{lineage_path}.genotypeId references an unknown genotype"
                            )
                        hazard = lineage.get("deathHazardPerHour")
                        if (
                            not isinstance(hazard, (int, float))
                            or isinstance(hazard, bool)
                            or not math.isfinite(hazard)
                            or hazard < 0
                        ):
                            errors.append(
                                f"{lineage_path}.deathHazardPerHour must be finite and non-negative"
                            )
                        elif hazard != 0:
                            errors.append(
                                f"{lineage_path}.deathHazardPerHour must remain zero for the baseline inactive drug-loss set"
                            )
                        _validate_presentation_provenance(
                            lineage,
                            lineage_path,
                            errors,
                            require_context=True,
                        )
                        lineage_provenance = lineage.get("provenance")
                        if isinstance(lineage_provenance, dict):
                            if lineage_provenance.get("classification") != "engineering":
                                errors.append(
                                    f"{lineage_path}.provenance.classification must be engineering"
                                )
                            if not _nonempty_string(lineage_provenance.get("limitation")):
                                errors.append(
                                    f"{lineage_path}.provenance.limitation is required"
                                )

                _validate_presentation_provenance(
                    composed_set,
                    composed_path,
                    errors,
                    require_context=True,
                )
                composed_provenance = composed_set.get("provenance")
                if isinstance(composed_provenance, dict):
                    if composed_provenance.get("classification") != "engineering":
                        errors.append(
                            f"{composed_path}.provenance.classification must be engineering"
                        )
                    if not _nonempty_string(composed_provenance.get("limitation")):
                        errors.append(
                            f"{composed_path}.provenance.limitation is required"
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

    for path in run_preset_paths:
        preset = load_json(path)
        prefix = path.name
        preset_path = f"{prefix}: run preset"

        if not isinstance(preset, dict):
            errors.append(f"{preset_path} root must be an object")
            continue

        expected_keys = {
            "schemaVersion",
            "id",
            "version",
            "scenarioId",
            "scenarioVersion",
            "parameterSetId",
            "parameterSetVersion",
            "classification",
            "seed",
            "initialResourceLevel",
            "inocula",
            "provenance",
        }
        if set(preset) != expected_keys:
            errors.append(
                f"{preset_path} must contain exactly {sorted(expected_keys)!r}"
            )

        if preset.get("schemaVersion") != 1:
            errors.append(f"{preset_path}.schemaVersion must equal 1")
        for key in (
            "id",
            "version",
            "scenarioId",
            "scenarioVersion",
            "parameterSetId",
            "parameterSetVersion",
        ):
            if not _nonempty_string(preset.get(key)):
                errors.append(f"{preset_path}.{key} must be a non-empty string")

        if preset.get("classification") != "engineering":
            errors.append(f"{preset_path}.classification must be engineering")

        seed = preset.get("seed")
        if (
            not isinstance(seed, int)
            or isinstance(seed, bool)
            or seed < 0
            or seed > 0xFFFF_FFFF
        ):
            errors.append(
                f"{preset_path}.seed must be an unsigned 32-bit integer"
            )

        resource_level = preset.get("initialResourceLevel")
        if (
            not isinstance(resource_level, (int, float))
            or isinstance(resource_level, bool)
            or not math.isfinite(resource_level)
            or resource_level < 0
        ):
            errors.append(
                f"{preset_path}.initialResourceLevel must be finite and non-negative"
            )

        _validate_presentation_provenance(
            preset,
            preset_path,
            errors,
            require_context=True,
        )
        preset_provenance = preset.get("provenance")
        if isinstance(preset_provenance, dict):
            if preset_provenance.get("classification") != "engineering":
                errors.append(
                    f"{preset_path}.provenance.classification must be engineering"
                )
            if not _nonempty_string(preset_provenance.get("limitation")):
                errors.append(
                    f"{preset_path}.provenance.limitation is required"
                )

        identity = (preset.get("scenarioId"), preset.get("scenarioVersion"))
        scenario = scenario_index.get(identity)
        if scenario is None:
            errors.append(
                f"{preset_path} references unknown scenario "
                f"{preset.get('scenarioId')}@{preset.get('scenarioVersion')}"
            )
            continue

        composed_set = scenario.get("composedParameterSet")
        if not isinstance(composed_set, dict):
            errors.append(
                f"{preset_path} referenced scenario has no composedParameterSet"
            )
            continue
        if preset.get("parameterSetId") != composed_set.get("id"):
            errors.append(
                f"{preset_path}.parameterSetId must match scenario composedParameterSet.id"
            )
        if preset.get("parameterSetVersion") != composed_set.get("version"):
            errors.append(
                f"{preset_path}.parameterSetVersion must match scenario composedParameterSet.version"
            )

        environment = scenario.get("environment")
        defaults = (
            environment.get("engineeringDefaults")
            if isinstance(environment, dict)
            else None
        )
        if not isinstance(defaults, dict):
            errors.append(
                f"{preset_path} referenced scenario has no engineeringDefaults"
            )
            continue

        grid_size = defaults.get("gridSize")
        radius = defaults.get("dishRadiusCells")
        lineages = composed_set.get("lineages")
        lineage_ids = {
            lineage.get("id")
            for lineage in lineages
            if isinstance(lineages, list)
            for lineage in lineages
            if isinstance(lineage, dict) and _nonempty_string(lineage.get("id"))
        } if isinstance(lineages, list) else set()

        inocula = preset.get("inocula")
        if not isinstance(inocula, list):
            errors.append(f"{preset_path}.inocula must be an array")
            continue

        for index, inoculum in enumerate(inocula):
            inoculum_path = f"{preset_path}.inocula[{index}]"
            if not isinstance(inoculum, dict):
                errors.append(f"{inoculum_path} must be an object")
                continue
            expected_inoculum_keys = {"lineageId", "x", "y", "biomass"}
            if set(inoculum) != expected_inoculum_keys:
                errors.append(
                    f"{inoculum_path} must contain exactly "
                    f"{sorted(expected_inoculum_keys)!r}"
                )

            lineage_id = inoculum.get("lineageId")
            if not _nonempty_string(lineage_id):
                errors.append(f"{inoculum_path}.lineageId must be a non-empty string")
            elif lineage_id not in lineage_ids:
                errors.append(
                    f"{inoculum_path}.lineageId references an unknown baseline lineage"
                )

            x = inoculum.get("x")
            y = inoculum.get("y")
            if (
                not isinstance(x, int)
                or isinstance(x, bool)
                or not isinstance(y, int)
                or isinstance(y, bool)
            ):
                errors.append(
                    f"{inoculum_path} coordinates must be integers"
                )
            elif (
                not isinstance(grid_size, int)
                or isinstance(grid_size, bool)
                or x < 0
                or y < 0
                or x >= grid_size
                or y >= grid_size
            ):
                errors.append(
                    f"{inoculum_path} coordinates must lie inside the scenario grid"
                )
            elif isinstance(radius, (int, float)) and math.isfinite(radius):
                center = (grid_size - 1) / 2
                dx = x - center
                dy = y - center
                if dx * dx + dy * dy > radius * radius:
                    errors.append(
                        f"{inoculum_path} must lie inside the authoritative circular dish"
                    )

            biomass = inoculum.get("biomass")
            if (
                not isinstance(biomass, (int, float))
                or isinstance(biomass, bool)
                or not math.isfinite(biomass)
                or biomass <= 0
            ):
                errors.append(
                    f"{inoculum_path}.biomass must be positive and finite"
                )

    if errors:
        print("\n".join(errors))
        return 1

    print(
        f"scenario contracts: validated {len(preset_paths)} scenario preset(s), "
        f"{len(run_preset_paths)} run preset(s), top-level schema constraints, "
        f"and {reference_count} citation reference(s)"
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
