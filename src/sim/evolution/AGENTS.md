# Evolution simulation DOX contract

## Purpose
`src/sim/evolution/` owns mutation sampling, lineage ancestry/event identity, and replay-sensitive evolutionary authority.

## Mutation opportunity boundary
- `sampleDivisionMutations(divisions, targets, rng)` consumes a **non-negative safe-integer count of reviewed discrete division/event opportunities**.
- `src/sim/ecology/**` currently reports `divisionBiomass` as continuous aggregate flux. It is not an integer birth count and must never be rounded, scaled, or passed directly into the exact mutation sampler.
- `../populationAuthority.ts` is the reviewed shared continuous-biomass → discrete-event bridge. Mutation composition consumes its non-negative safe-integer per-lineage/per-cell division opportunities; it must never independently round/scale `divisionBiomass`. Fractional division supply is carried explicitly in replay-critical residual state.
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

## RNG and replay
- All stochastic evolution consumes an explicit `SimulationRng`; never call `Math.random()`.
- RNG consumption order is replay-sensitive model state. Changing target iteration, draw order, or accelerated sampling can change trajectories and requires engine/version + deterministic-test review.
- Checkpoint/restore must preserve enough RNG state and evolution state to continue exactly under the same engine/scenario/ordered commands.

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
- This projection does not create lineage history and does not make the current composed checkpoint lineage-registry-complete. #5/#37 still own integrating replay-critical ancestry/evolution state into the composed runtime before product lineage analysis can be considered end-to-end authoritative.
