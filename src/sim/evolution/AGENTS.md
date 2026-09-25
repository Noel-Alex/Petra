# Evolution simulation DOX contract

## Purpose
`src/sim/evolution/` owns mutation sampling, lineage ancestry/event identity, and replay-sensitive evolutionary authority.

## Mutation opportunity boundary
- `sampleDivisionMutations(divisions, targets, rng)` consumes a **non-negative safe-integer count of reviewed discrete division/event opportunities**.
- `src/sim/ecology/**` currently reports `divisionBiomass` as continuous aggregate flux. It is not an integer birth count and must never be rounded, scaled, or passed directly into the exact mutation sampler.
- `../populationAuthority.ts` is the reviewed shared continuous-biomass → discrete-event bridge. Mutation composition consumes its non-negative safe-integer per-lineage/per-cell division opportunities; it must never independently round/scale `divisionBiomass`. Fractional division supply is carried explicitly in replay-critical residual state.
- `spatialMutation.ts` is the pure replay-safe consumer of those per-lineage/per-cell opportunities. It resolves targets only through the curated graph, preserves source lineage/genotype/cell + mutation-class/citation identity, and wraps the **entire spatial batch** in one Petra RNG transaction. A later sampling-policy refusal must leave caller RNG unchanged. Per-cell sampling still obeys the existing operation-local `SamplingExecutionPolicy` budgets; this adapter does not invent a new grid-wide threshold. This handoff does not create lineage IDs or mutate biomass; authoritative child-lineage/state materialization remains a higher-level #5/#37 transaction.
- Mutation targets/probabilities are scenario + provenance inputs. The current mutation sampler has no antibiotic/selective-pressure input.
- Antibiotic may change survival, growth, or lineage frequency through sourced mechanisms; it must not directly raise mutation probability unless a separately researched mechanism is intentionally introduced and versioned.


## Curated mutation graph
- `graph.ts` is the strict scenario→evolution adapter for curated genotype nodes and mutation transitions. Composition/worker code should consume it rather than re-parsing raw preset JSON or re-implementing transition validation.
- Genotype relative fitness, edge probability, domain mutation classification, citation key, and optional note remain scenario-owned inputs. The graph adapter may validate/preserve them but must not infer new biology from MIC, drug concentration, evidence badges, or aggregate selected appearance rates.
- Transition array order is replay-sensitive because `sampleDivisionMutations` interprets target probabilities cumulatively in supplied order. Reordering curated edges is an engine/scenario replay change, not cosmetic JSON cleanup.
- Duplicate source→target edges are rejected while the exact sampler identifies mutually exclusive outputs by target genotype. Supporting multiple mechanistic classes to the same target requires a deliberate sampler/state contract, not silent edge merging.
- Per-source transition probability mass must remain ≤ 1. A missing outgoing edge set means no curated mutation target from that genotype; an unknown genotype lookup is an error rather than an empty fallback.

## Exact and accelerated sampling
- `sampleDivisionMutations(...)` remains the trial-by-trial reference sampler: each opportunity creates at most one mutually exclusive child class, so mutant births cannot exceed opportunities. Runtime composition must not use this reference path for arbitrary large counts.
- `sampleDivisionMutationsWithPolicy(...)` is the bounded runtime entrypoint. Counts at or below the caller-owned exact budget replay the reference sampler unchanged; larger eligible counts use `exact-sparse-binomial-v1` through sequential conditional binomials, which preserves the exact multinomial law and target order.
- Sampling budgets and algorithm choice come only from the versioned `SamplingExecutionPolicy`; they are numerical/runtime policy, never biological thresholds or probability retuning.
- Accelerated mutation sampling is transactional over Petra RNG state. Expected/hard draw-budget refusal is explicit `sampling-policy-refusal` and must leave the caller RNG unchanged.
- The returned diagnostics include canonical sampling-policy identity, mode, and RNG-draw count. That policy identity is replay-critical and must join any authoritative configuration fingerprint before this sampler participates in checkpointed composition.
- Do not “fix” unsafe accelerated draws by clamping negative populations or excess mutant counts after the fact; use bounded exact sampling or explicit refusal. See `../SAMPLING.md`.

## Baseline non-drug lineage loss authority
- `baselineLossPolicy.ts` owns the versioned static authority for the non-drug first-order loss assigned to an active genotype. The only current rule is an explicit genotype table with per-entry provenance; it never derives background loss from relative fitness, MIC, ciprofloxacin exposure, parent-lineage state, or genotype names.
- Missing genotype authority fails closed. Engineering entries may intentionally use values such as zero only when the policy explicitly carries engineering classification, context, and limitation; such values are model policy, not measured mortality.
- Transferred/calibrated entries require source keys. Duplicate genotype entries, invalid hazards, malformed provenance, and non-canonical identities are refused.
- Policy identity is semantic and replay-stable: genotype/source ordering does not create a different identity, while numerical or provenance changes do. A composed runtime that activates dynamic mutation children must bind the selected policy identity into static run configuration before using it and checkpoint the resolved child parameter with dynamic lineage state.

## RNG and replay
- All stochastic evolution consumes an explicit `SimulationRng`; never call `Math.random()`.
- RNG consumption order is replay-sensitive model state. Changing target iteration, draw order, or accelerated sampling can change trajectories and requires engine/version + deterministic-test review.
- Checkpoint/restore must preserve enough RNG state and evolution state to continue exactly under the same engine/scenario/ordered commands.

## Founder lineage registry genesis
- `founderLineageRegistry.ts` is the deterministic bridge from ordered static founder definitions to runtime `LineageRegistry` identity. Scenario/config founder IDs remain static definition identity; they are not reused as runtime lineage IDs.
- Runtime founder lineage IDs come only from registry creation order (`L1`, `L2`, ...), with genesis time `0`, no parent, no mutation class, and no single origin cell. The returned binding preserves the exact founder-definition → runtime-lineage mapping for composed initialization.
- Restoring the returned checkpoint must preserve allocator continuity so later mutation children continue at the next deterministic registry ID. Duplicate/non-canonical founder definition identity and sparse founder arrays fail closed.

## Composed dynamic-lineage authority seam
- `composedLineageAuthority.ts` owns replay-critical dynamic-lineage alignment: ordered runtime lineage IDs, ordered genotype IDs, persisted baseline non-drug loss values, optional exact ordered lineage→taxon authority, and the exact `LineageRegistryCheckpoint`.
- Configured founder definitions are validated as the registry genesis prefix produced by `founderLineageRegistry.ts`; later runtime records must be parented children. Extra runtime roots, founder-prefix drift, channel/registry cardinality drift, registry-order drift, or configured taxon-registry/content-version drift fail closed.
- Taxon-authoritative founders require exact `taxonId + taxonContentVersion` against the caller-owned registry. Mutation children inherit the exact parent taxon in the same append-only authority transaction; a child taxon cannot be inferred from genotype, mutation target, renderer metadata, or labels. Legacy callers that omit the registry must omit taxon mappings entirely rather than receiving an implicit organism default.
- Runtime-child persisted baseline loss must equal the selected `baselineLossPolicy.ts` authority exactly. Missing policy/genotype authority or persisted hazard drift refuses; no parent inheritance, fitness conversion, MIC inference, or default is allowed.
- `appendMaterializedMutationLineagesToAuthority(...)` accepts only an already-reviewed `materializeMutationLineages.ts` result whose registry checkpoint preserves all prior records/events as an exact prefix. It extends detached lineage identity/parameter/taxon authority only; biomass reassignment, population-authority expansion, RNG publication, and composed-state publication remain the higher-level atomic transaction.

## Explicit lineage-origin checkpoint migration target
- `lineageOriginCheckpoint.ts` owns the strict **v2 target schema** for replay-critical lineage origin identity: `configured-founder`, `mutation-child`, and `external-inoculation`. Creation events repeat the exact origin kind/source metadata and extinction events repeat the origin kind so record/event corruption cannot silently change ancestry semantics.
- This module is deliberately **not yet the live Worker/checkpoint schema** while #918 owns the current protocol/replay version migration. Current `LineageRegistryCheckpoint` v1 remains live until a coordinated protocol/composed-state bump adopts v2; do not silently emit required v2 fields under the current protocol version.
- The explicit v1→v2 migration accepts only a caller-supplied configured-founder prefix followed by unambiguous parented mutation children. A later parentless v1 root is refused because v1 cannot prove whether it was a configured founder or external inoculation; never guess that provenance.
- In v2, configured founders are a genesis-only prefix with time 0, no parent/source cell/mutation class. Mutation children require an existing parent, authoritative source cell, non-empty mutation class, and parent-lifetime consistency. External inoculation is a parentless runtime root with an authoritative source cell/time and no mutation class; it may become a parent of later mutation children.
- `appendRuntimeLineageOriginV2(...)` rejects configured founders and is runtime lineage/replay allocation only; live founder creation must remain routed through `founderLineageRegistry.ts`. It does not authorize external-inoculation support, move biomass, append taxon/growth/loss/population channels, or emit a Worker command; those atomic composed-state responsibilities remain #980 after the wire migration lands.
- Any future new biological origin class requires an intentional schema/version extension; do not overload one of these origin kinds to encode HGT, phage, or another mechanism.

## Lineage authority
- Lineage creation/extinction is simulation authority. React, Pixi, renderer samples, animation callbacks, story beats, and UI events may display authoritative lineage events but cannot create or delete biological lineages.
- Parent lineage identity, genotype, origin time/location, mutation class, and extinction time are authoritative lineage metadata.
- A child creation time must stay within its parent's authoritative lifetime: never before parent creation and never strictly after parent extinction. Equal timestamps remain valid and deterministic event insertion order is authoritative.
- Retroactive parent extinction must not precede any already-recorded child creation; live mutation and checkpoint restore enforce the same lifetime bound.
- Current lineage IDs are deterministic from creation order. Creation order therefore affects replay identity.
- Authoritative lineage event sequence is chronological: `timeHours` must be non-decreasing in insertion/serialized order. Equal timestamps are valid and retain deterministic insertion order; live calls and restore both reject backdating.
- `LineageRegistry.checkpoint()` / `LineageRegistry.restore()` own the versioned serializable ancestry/extinction/event + next-ID allocator boundary. Serialized `records` and `events` must be dense arrays with every index explicitly present; sparse holes are corrupt authority and must fail before restore. Restoring only visible records while resetting the allocator would corrupt future identity.
- Public lineage reads (`create`, `get`, `list`, and `eventLog`) return isolated projections. Consumer mutation must never alter registry authority; extinction mutation is owned by `markExtinct()`.
- Presentation layers may aggregate or sample lineages visually, but must not imply decorative glyph count equals simulated cell count.

## Lineage compaction planning
- `lineageCompaction.ts` is a pure, versioned planner for **dense per-lineage state retention only**. It validates the complete `LineageRegistryCheckpoint` through the canonical restore boundary and emits release eligibility in deterministic checkpoint creation order.
- Extant lineages are never release-eligible. Extinct dense state becomes eligible only when the explicit non-negative biological-time retention window has elapsed; the exact boundary is deterministic.
- Compaction planning never deletes or rewrites lineage records, ancestry, events, extinction times, or the next-ID allocator. Those remain replay/explanation authority even when an external dense grid channel may eventually be released.
- The planner is not enabled in `ComposedSimulationEngine` yet. Any future integration that changes checkpoint storage/state shape must first prove checkpoint/replay/metric equivalence, coordinate protocol/schema identity where required, bind the versioned policy into the relevant configuration/checkpoint contract, and preserve atomic refusal semantics.
- A release-eligible plan is not performance evidence. Memory/throughput savings and any retention-window choice must be justified by #558 long-soak measurements rather than guessed from presentation needs.

## Scientific provenance
- Curated mutation edges/target classes come from scenario-owned records. Aggregate selected appearance rates must not be silently converted into one exact edge probability.
- Genotype fitness and mutation supply remain separate concepts; mutation count is not a generic fitness penalty.
- `fitness.ts` is the strict composition boundary from active lineage `{lineageId, genotypeId}` identity to scenario-owned relative fitness. Composition must preserve active lineage channel order, bind against the exact scenario id/version of the curated graph, and reject unknown genotypes/duplicate lineage IDs instead of re-entering or defaulting fitness values. Drug/MIC/death-hazard state is not a fitness input.
- Selection changes frequencies among variants; it does not choose useful mutations.

## Verification
Deterministic tests for this subtree should cover zero opportunities, probability bounds/exclusivity, mutant-count ≤ opportunities, identical-seed sequence replay, parent/lineage validation, extinction ordering and parent-lifetime chronology, checkpoint isolation, allocator round-trip, corrupted-checkpoint rejection, and post-restore lineage/event continuation.

Any accelerated sampler additionally requires many-seed distribution comparison against the exact bounded reference path.

## Coordination
- #5 owns mutation/evolution semantics and consumes the shared discrete-event authority from #562 / `../populationAuthority.ts`.
- #37 must consume this contract when authoritative composition connects ecology to evolution.
- Renderer/UI work consumes emitted lineage state/events only.

## Lineage analysis projection
- `analysis.ts` is a read-only authority join over a replay-critical `LineageRegistryCheckpoint`, one exact composed checkpoint, the matching curated evolution graph, and explicit genotype evidence descriptors.
- Active composed lineage IDs/genotype IDs must match registry records exactly. Extant registry records missing from active abundance authority are an error; extinct records may project zero abundance only after an authoritative extinction time at or before the checkpoint time.
- Relative fitness is resolved from the curated mutation graph. Labels/source/assumption keys come only from explicit evidence records. Never infer phenotype, resistance, MIC, citation, or evidence class from genotype names, renderer color, tree layout, or abundance.
- Optional ciprofloxacin lineage evidence is transported only when the explicit genotype evidence descriptor supplies a finite positive MIC in `mg/L` and, when present, a finite positive MIC-ratio response shift plus canonical reference-genotype identity. `analysis.ts` must not derive MIC or response shift from genotype names, relative fitness, drug concentration, or mutation class.
- This projection does not create lineage history. When composed mutation authority is enabled, replay-critical ancestry/evolution state is already carried by the checkpoint's canonical lineage registry and aligned dynamic lineage channels; analysis must consume that authority exactly rather than reconstructing lineage history from abundance, renderer events, or labels.


## Mutation child-lineage materialization
- `materializeMutationLineages.ts` is the transaction boundary from already-sampled `SpatialMutationBatchResult` births into deterministic `LineageRegistry` child identity. It must never resample mutation probability, consume continuous biomass directly, or infer births from renderer/UI state.
- Every sampled mutant birth creates one child lineage in deterministic supplied batch/cell/target/birth order. Parent lineage, source genotype, target genotype, source cell, biological creation time, mutation class, and sampled citation key remain explicit in the returned handoff.
- Materialization runs against a restored registry checkpoint clone. Validation failure or runtime work-ceiling refusal returns no new lineage authority and cannot partially mutate the caller checkpoint.
- Source lineage/genotype identity must match an extant registry record at the child creation time. Unknown, genotype-mismatched, or already-extinct parents fail closed.
- The materialization work ceiling is runtime safety only. It does not alter mutation probabilities or biology; refusal requires a separately budgeted execution path rather than truncating sampled births.
- `materializeMutationLineages.ts` itself still does not allocate composed biomass or add child channels. The higher-level composed transaction in `../authoritative.ts` performs that integration atomically: append replay-critical lineage/genotype/baseline-loss/exact inherited taxon authority, conservatively reassign one calibrated cell-equivalent of parent biomass per accepted child in the authoritative source cell, complete spread, extend/reconcile discrete population authority, validate the full candidate state, and only then publish state plus the caller-owned detached RNG. A refusal at any stage publishes none of those changes.
