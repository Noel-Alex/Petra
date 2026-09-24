# Data DOX contract

## Purpose
Machine-readable science and scenario configuration.

## Ownership
- Parameter records and citations.
- Scenario/preset files.
- JSON schemas and versioning.
- Validation fixtures derived from published or explicitly synthetic cases.

## Local contracts
- Values that affect simulation authority must carry units and provenance or an explicit engineering/synthetic classification.
- A preset must declare an engine/schema version and warning/usage scope.
- Do not average conflicting assays. Keep separate records and choose explicitly at scenario composition time.
- Engineering-normalized values must never be labeled physical measurements.
- A scenario resource field must carry an explicit `environment.resourceContext`. When physical substrate/medium/biomass mapping is unbound, expose it as dimensionless `model-resource` with engineering provenance; UI/render/runtime code must not relabel it glucose or attach physical concentration units. A later physical/calibrated binding requires a scenario-version change and compatible source context.
- The research-stage flagship may carry a versioned `executionProfile` solely to make the model-unit ecology loop executable while physical growth/resource parameters remain UNBOUND. Its units must remain `hour` / `model-resource` / `model-biomass`, its provenance must be `engineering`, and its limitation/calibration note must state that it is not a measured MG1655/physical-substrate parameter pack. Changing the selected profile is a scenario/replay identity change.
- Changes to a science preset require matching research/claim-ledger review.

## Work guidance
Prefer normalized IDs and source keys so UI, simulator, validation, and explanation layers resolve the same records.

## Verification
JSON must parse; schemas/presets must pass the repository verifier. Science-mode presets must contain citations for measured/transferred values.

## Child DOX index
- `phage/AGENTS.md` — canonical published phage evidence, measured-row integrity, and unresolved unit/transport boundaries.

## Record-level presentation provenance
- Science records exposed to UI may carry a nested `provenance` object with an explicit presentation evidence classification, source key(s), and any record-specific context/transfer/calibration/limitation metadata.
- Preserve domain-specific scientific classifications such as mutation target classes; do not overwrite them just to satisfy UI vocabulary.
- A nested `provenance.classification` is owned by data/science, not inferred by React from citations, field names, evidence tiers, or paper count.
- Flagship records required by the Sources/Assumptions UI must fail visibly when required source/transfer/limitation metadata is missing.
