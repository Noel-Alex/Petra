# Evolution simulation DOX contract

## Purpose
`src/sim/evolution/` owns mutation sampling, lineage ancestry/event identity, and replay-sensitive evolutionary authority.

## Mutation opportunity boundary
- `sampleDivisionMutations(divisions, targets, rng)` consumes a **non-negative safe-integer count of reviewed discrete division/event opportunities**.
- `src/sim/ecology/**` currently reports `divisionBiomass` as continuous aggregate flux. It is not an integer birth count and must never be rounded, scaled, or passed directly into the exact mutation sampler.
- The continuous-biomass → discrete-event bridge is intentionally unresolved until #5/#37 land an implementation and validation contract. Do not choose a convenience conversion inside composition code.
- Mutation targets/probabilities are scenario + provenance inputs. The current mutation sampler has no antibiotic/selective-pressure input.
- Antibiotic may change survival, growth, or lineage frequency through sourced mechanisms; it must not directly raise mutation probability unless a separately researched mechanism is intentionally introduced and versioned.

## Exact and accelerated sampling
- The current per-division categorical path is the bounded reference sampler: each opportunity creates at most one mutually exclusive child class, so mutant births cannot exceed opportunities.
- A future binomial/multinomial/Poisson/tau-leap acceleration must preserve target exclusivity/bounds and be validated statistically against the exact reference over representative small and rare-event cases.
- Do not “fix” unsafe accelerated draws by clamping negative populations or excess mutant counts after the fact; use bounded sampling/step control.

## RNG and replay
- All stochastic evolution consumes an explicit `SimulationRng`; never call `Math.random()`.
- RNG consumption order is replay-sensitive model state. Changing target iteration, draw order, or accelerated sampling can change trajectories and requires engine/version + deterministic-test review.
- Checkpoint/restore must preserve enough RNG state and evolution state to continue exactly under the same engine/scenario/ordered commands.

## Lineage authority
- Lineage creation/extinction is simulation authority. React, Pixi, renderer samples, animation callbacks, story beats, and UI events may display authoritative lineage events but cannot create or delete biological lineages.
- Parent lineage identity, genotype, origin time/location, mutation class, and extinction time are authoritative lineage metadata.
- Current lineage IDs are deterministic from creation order. Creation order therefore affects replay identity.
- `LineageRegistry.checkpoint()` / `LineageRegistry.restore()` own the versioned serializable ancestry/extinction/event + next-ID allocator boundary. Restoring only visible records while resetting the allocator would corrupt future identity.
- Presentation layers may aggregate or sample lineages visually, but must not imply decorative glyph count equals simulated cell count.

## Scientific provenance
- Curated mutation edges/target classes come from scenario-owned records. Aggregate selected appearance rates must not be silently converted into one exact edge probability.
- Genotype fitness and mutation supply remain separate concepts; mutation count is not a generic fitness penalty.
- Selection changes frequencies among variants; it does not choose useful mutations.

## Verification
Deterministic tests for this subtree should cover zero opportunities, probability bounds/exclusivity, mutant-count ≤ opportunities, identical-seed sequence replay, parent/lineage validation, extinction ordering, checkpoint isolation, allocator round-trip, corrupted-checkpoint rejection, and post-restore lineage/event continuation.

Any accelerated sampler additionally requires many-seed distribution comparison against the exact bounded reference path.

## Coordination
- #5 owns mutation/evolution semantics and the reviewed discrete-event bridge.
- #37 must consume this contract when authoritative composition connects ecology to evolution.
- Renderer/UI work consumes emitted lineage state/events only.
