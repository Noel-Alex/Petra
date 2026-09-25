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
- A run-initialization preset under `data/run_presets/` is engineering run-state authority, not a science-parameter pack: it must bind the current engine/protocol/scenario/composed-parameter-set identity, carry an explicit engineering classification + limitation, and keep seed, model-resource level, founder position, and founder model-biomass visibly non-physical.
- Do not average conflicting assays. Keep separate records and choose explicitly at scenario composition time.
- Engineering-normalized values must never be labeled physical measurements.
- A scenario resource field must carry an explicit `environment.resourceContext`. When physical substrate/medium/biomass mapping is unbound, expose it as dimensionless `model-resource` with engineering provenance; UI/render/runtime code must not relabel it glucose or attach physical concentration units. A later physical/calibrated binding requires a scenario-version change and compatible source context.
- The research-stage flagship may carry a versioned `executionProfile` solely to make the model-unit ecology loop executable while physical growth/resource parameters remain UNBOUND. Its units must remain `hour` / `model-resource` / `model-biomass`, its provenance must be `engineering`, and its limitation/calibration note must state that it is not a measured MG1655/physical-substrate parameter pack. Changing the selected profile is a scenario/replay identity change.
- The flagship `composedParameterSet` is separate from run-state initialization. It owns versioned mechanism/geometry/founder-channel identity and must reference the active scenario, execution profile, resource context, and loss policy. When the composed runtime binds ciprofloxacin, the parameter-set version also binds the scenario-owned reference PD curve, concentration unit, and genotype MIC table used by that loss policy. The baseline run keeps the static ciprofloxacin landscape exactly zero; non-zero/mutable intervention state must not be smuggled in as an unversioned parameter default. Initial model-resource level, inoculum position, and inoculum biomass remain explicit run-state inputs; do not freeze them into the mechanism fingerprint or hide them as defaults.
- Flagship product intervention controls are scenario authority, not React defaults or genotype-derived bounds. The ciprofloxacin control envelope must preserve its source-tested concentration domain, explicit transfer limitation, engineering interaction default, supported model-field geometry, and blend semantics. A genotype MIC outside that source domain does not widen the control range; changing this contract requires a scenario-version/replay-identity change.
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
