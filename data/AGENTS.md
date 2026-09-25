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
- The flagship ciprofloxacin transfer must carry an explicit `resourceDrugCompositionPolicy.parameterCompatibility` declaration. The Regoes CAB1/LB reference context and the MG1655/model-resource target are separate compatibility groups; organism background, physical-medium status, assay convention, and model convention are explicit transferred dimensions, while the target physical medium remains visibly UNBOUND rather than being relabelled LB. `flagshipComposition.ts` must reject declaration/source/policy drift through the #651 compatibility authority.
- Named scientific/product compositions must bind exact biological taxon identity rather than relying on lineage/genotype/display labels. For the bundled flagship, `organism.authoritativeTaxon` owns the source-backed MG1655 biological identity and every composed founder channel records its exact `taxonId + taxonContentVersion`; changing either requires a composed-parameter-set revision because the binding is replay/fingerprint authority. Presentation morphology remains separate under `data/presentation/**` and never supplies this biological identity.
- Flagship product intervention controls are scenario authority, not React defaults or genotype-derived bounds. A source-domain ciprofloxacin guardrail must preserve its cited tested concentration range, explicit transfer limitation, engineering interaction default, supported model-field geometry, and blend semantics; changing it requires a scenario-identity change.
- Changes to a science preset require matching research/claim-ledger review.
- Biological content-pack manifests are inert exact-reference registries governed by `data/schemas/content_pack_manifest.schema.json` and `src/sim/contentPackManifest.ts`: they bind versioned science/content records, source keys, declared maturity, and explicit limitations, but may not embed executable code or scientific parameter literals. Pack existence/maturity never proves organism×intervention×environment support (#879) or grounded Science Mode admission (`scienceModeAdmission.ts`).
- `data/content_support/v1.json` is the fail-closed product-availability matrix above those inert manifests. An enabled entry must bind an exact repository scenario/version and exact environment/intervention/presentation authority; research availability is not grounded Science-Mode admission. Future organisms, fungi, antimicrobials, or pairwise interactions remain blocked queue entries carrying only owning Issue dependencies/reasons until their science pack is approved—never placeholder parameters.

## Work guidance
Prefer normalized IDs and source keys so UI, simulator, validation, and explanation layers resolve the same records.

## Verification
JSON must parse; schemas/presets must pass the repository verifier. Science-mode presets must contain citations for measured/transferred values.

## Child DOX index
- `phage/AGENTS.md` — canonical published phage evidence, measured-row integrity, and unresolved unit/transport boundaries.
- `environments/AGENTS.md` — source-context environment evidence, calibrated-vs-unbound resource bridges, and spatial-transfer gates.

## Record-level presentation provenance
- Science records exposed to UI may carry a nested `provenance` object with an explicit presentation evidence classification, source key(s), and any record-specific context/transfer/calibration/limitation metadata.
- Preserve domain-specific scientific classifications such as mutation target classes; do not overwrite them just to satisfy UI vocabulary.
- A nested `provenance.classification` is owned by data/science, not inferred by React from citations, field names, evidence tiers, or paper count.
- Flagship records required by the Sources/Assumptions UI must fail visibly when required source/transfer/limitation metadata is missing.
- `data/presentation/**` records are presentation evidence only. A validated organism-presentation record may authorize a coarse representative silhouette, but it must not enter simulation/checkpoint/replay identity or supply physical dimensions, population counts, orientation/division dynamics, or other biological parameters. Morphology must be explicit and source-backed; UI/renderer code must never infer it from taxon text, lineage IDs, colors, or density.
- `data/analysis/flagship_metric_authority_v1.json` is the repository-owned analysis-policy record for the bundled flagship. It pins exact scenario + composed-parameter-set identity, an explicit elevated-ciprofloxacin-MIC-relative-to-founder cohort, and a versioned metric sampling policy. Cohort membership must validate exhaustively against the scenario genotype MIC table; it is a derived within-scenario analysis cohort, not a clinical susceptibility breakpoint. Sampling cadence is engineering analysis policy and must not be reused as biological stepping or renderer cadence.
