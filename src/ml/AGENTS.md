# ML / surrogate DOX contract

## Purpose

Own Petra's optional learned-surrogate infrastructure without granting ML authority over biology.

## Authority boundary

- The mechanistic simulator remains authoritative and must always remain available.
- ML may accelerate or preview validated mechanistic behavior; it may not invent mutations, MICs, biological parameters, intervention outcomes, or lineage events.
- Product modes are explicit: `mechanistic` or `emulated`. Never present an emulated result as mechanistic.
- Emulated mode is feature-gated, promotion-gated, engine-version-gated, compatibility-gated, and domain-gated. A failed gate falls back to mechanistic execution with an explicit refusal reason for the UI. A model validated against an older/different engine, scenario/version, normalization profile, or input/target schema may not silently remain active.
- Model/runtime code consumes declared inputs and metadata. It does not mutate simulator state.

## Dataset integrity

- Every sample carries dataset version, engine version, parameter-set hash, scenario/version, seed, intervention fingerprint, normalization profile, explicit input/target schema identity, snapshot index, and simulation time.
- Split assignment happens at a declared parameter/scenario **group** level. All trajectories and frames in one group stay in exactly one of train/validation/test.
- ML sweep seeds are the same canonical numeric uint32 values accepted by `src/sim/seed.ts`; arbitrary text/decimal aliases are invalid. Seed remains intentionally excluded from the split-group hash, but it is part of exact trajectory/task/artifact identity.
- Never randomly split adjacent snapshots from the same trajectory.
- Split assignment policy is versioned and deterministic.
- Split **coverage** policy is separately versioned. A generation plan intended for held-out evaluation must satisfy its required group coverage before trajectory tasks are accepted; Petra never moves individual seeds/frames between splits to fill a quota.

## OOD policy

- Every promoted surrogate declares numeric ranges and categorical values used during training/validation.
- Missing, non-finite, unknown, or out-of-range required inputs are out of domain.
- OOD emulated requests are refused and routed to mechanistic mode; the caller must surface the reason.
- Do not silently extrapolate.

## Promotion

A surrogate is not product-eligible until it has a versioned dataset, leakage-safe held-out evaluation, a simple baseline comparison, declared domain envelope, visible error metrics, and a mechanistic spot-check path.

- Held-out regression evidence uses complete rows and declared targets; missing/extra targets, non-finite values, row-count mismatch, or metric overflow are invalid evidence.
- Benchmark evidence binds model id/version, dataset version, engine version, a versioned surrogate-compatibility identity, split-assignment policy version, split-coverage policy version, **evaluation-weighting policy version**, held-out split, baseline id, declared held-out group keys, requested forecast horizons, coverage counts, and per-target MAE/RMSE/count.
- Candidate and baseline predictions are paired on the exact same authoritative group/trajectory/horizon row; never compare independently sampled evaluation populations.
- The default evaluation policy permits exactly one record per trajectory × declared horizon, equal-weights horizons within each held-out group, then equal-weights held-out groups overall. Snapshot cadence or trajectory length must not silently add promotion weight.
- Evidence retains overall, per-group, per-horizon, and group×horizon metrics plus row/trajectory/group coverage. Missing strata or aggregates inconsistent with the declared weighting policy fail closed.
- Surrogate compatibility explicitly declares supported scenario/version pairs plus normalization-profile, input-schema, and target-schema versions. Multi-scenario compatibility must be enumerated; never infer it from overlapping feature names or numeric ranges.
- Parameter-set hash is deliberately not an exact runtime compatibility gate when a surrogate is designed to span a validated parameter envelope; the declared OOD domain remains authoritative for that dimension.
- Malformed or mismatched compatibility metadata is invalid promotion evidence and must fail closed to Mechanistic mode rather than throwing or silently coercing.
- A `validated` model card must carry its promotion evidence and requirements. Emulated admission re-checks that evidence rather than trusting the status label alone.
- Candidate and baseline must cover exactly the declared targets and use equal paired evaluation counts for each target and required stratum.
- The current default promotion rule requires strict improvement in both MAE and RMSE on every declared target at overall, per-group, per-horizon, and group×horizon levels. Petra does not invent a percentage margin; any future weighting, aggregation, or margin must be separately versioned and justified.
- Stale/mismatched benchmark evidence routes to mechanistic mode with an explicit `promotion-evidence-invalid` reason.

## Verification

Pure dataset/split/OOD/mode-gate/benchmark helpers require deterministic unit tests. Training quality, held-out metrics, latency, and accelerator claims require actual measured evidence and may not be inferred from source structure.


## Mechanistic sweep planning
- `src/ml/sweep.ts` plans future authoritative trajectories only; it never fabricates samples, runs surrogate inference, or substitutes for the mechanistic engine.
- Parameter-set hashes and intervention fingerprints are supplied by the authoritative scenario/runner layer. The ML planner treats them as identities and must not invent biological values.
- The leakage boundary is the scenario + parameter-set hash + intervention fingerprint. Every seed replica in that group must remain in one split.
- Equivalent parameter hashes or intervention fingerprints may not be duplicated under different display ids because that could let equivalent biological conditions cross split boundaries.
- Sweep definitions require an explicit `maxTrajectories` budget. Refuse oversized Cartesian products before execution rather than silently launching an unbounded local/cloud workload.
- The default held-out coverage gate requires at least one group in train, validation, and test. A failed gate must report observed per-split group/trajectory counts and instruct the caller to enlarge/change the declared sweep or adopt a separately versioned policy; it must never rebalance individual replicas.
- Dataset-generation manifest v4 records plan/dataset/engine/scenario identity, canonical numeric simulation seeds, explicit input/target schema identity, split-assignment policy, split-coverage policy, per-split group/trajectory counts, and stable trajectory keys. Dataset schema changes alter task identity but do not alter the biological split-group hash. These are execution provenance, not evidence that trajectories were actually simulated.
- `src/ml/generator.ts` is the post-execution authority gate: it accepts completed samples only for tasks present in the sweep plan, revalidates dataset/normalization/trajectory/split identity, requires contiguous snapshot indices + monotonic simulation time + one final non-empty termination reason, and refuses incomplete/duplicate/foreign results.
- Parallel runners may finish in any order, but dataset rows are materialized in stable sweep-task order. JSONL export canonicalizes object keys and rejects non-finite/non-JSON payloads instead of silently coercing them; use the line iterator for large artifacts rather than constructing one giant string.
- Large/backend sweeps use `src/ml/incrementalGenerator.ts`: validate one completed trajectory at a time, stream canonical rows into injected durable staging, retain only per-task integrity metadata in collector memory, and reconstruct final JSONL strictly in sweep-task order. A staged task is resumable only when its versioned exact-plan digest, trajectory identity, row count, and deterministic FNV-1a-64/UTF-8 checksum match; same-content restaging is idempotent while conflicting duplicates fail closed.
- Incremental output is **not final/promotable** until every planned task is staged, every staged segment re-verifies during canonical replay, and the final output sink publishes the completion record last. Interrupted final writes must be discarded/replaced rather than appended; absence of that completion record means incomplete output. The checksum is for truncation/corruption detection, not cryptographic authenticity.

- `src/ml/runner.ts` owns resume-safe bounded sweep orchestration. It validates the exact sweep plan, skips only trajectories already accepted by `IncrementalMechanisticDatasetCollector`, stages each successful trajectory immediately, records failures without substitution, and rebuilds the run report in canonical plan order so completion timing cannot change result identity.
- `src/ml/executionDefinition.ts` owns the bridge from sweep identity to exact mechanistic execution. `parameterSetHash` is a legacy field name: authoritative composed sweeps must populate it with the length-prefixed exact binding identity (binding schema + authority + parameter-set id/version + composed configuration fingerprint), not an opaque display hash. Use `createSweepParameterPointForBinding(...)` rather than hand-authoring it.
- Authoritative ML execution definitions require `provenance` parameter-set authority; `fixture:` bindings remain valid only for narrow infrastructure tests and cannot back product/training execution definitions.
- Intervention fingerprints are biological schedule identities, not display labels. Until #37 exposes typed authoritative intervention commands, composed ML execution supports only the explicit versioned empty schedule from `createNoInterventionExecutionDefinition(...)`; any command-bearing/non-empty schedule must fail closed rather than being inferred from an intervention family name.
- Renaming an equivalent no-intervention family must not change its intervention fingerprint. Conversely, the task's presentation `interventionFamilyId` must still match the resolved definition so provenance cannot silently relabel a run.
- The built-in composed executor constructs `ComposedSimulationEngine` directly from a resolver-supplied versioned parameter binding/configuration and deterministic tick/snapshot schedule. Resolver code owns parameter/intervention semantics; the ML runner must never derive biology from parameter display ids, intervention labels, split metadata, or learned models.
- `maxConcurrency` bounds in-process task concurrency only. Do not call that multicore evidence. A Node `worker_threads`/process adapter and durable filesystem staging remain a separate laptop-execution integration requirement and must preserve the same executor/collector authority contract.
- Dataset artifact v3 / row v3 preserve canonical numeric seed plus the exact versioned input/target schema on every sample and summary. The artifact and provenance sidecar prove collection completeness/identity only; they are not evidence that the underlying biology is validated, that a surrogate was trained, or that promotion criteria were met.
- Surrogate benchmark evidence v5 carries the generated dataset schema identity in addition to split-coverage-policy version, evaluation-policy version, and surrogate compatibility identity. Evidence construction consumes the dataset summary and refuses scenario/normalization/input/target schema relabeling, so data produced under one schema cannot silently validate another model contract.\n- `src/ml/baselines.ts` owns dependency-light aggregate reference models for the first training gate. Constant-mean and ridge regression trainers accept only exact finite declared feature/target schemas; ridge standardizes features, leaves constant features inert, uses explicit positive regularization, and emits serializable deterministic model parameters. These primitives are training infrastructure only: fitting them on fixtures is not model-quality evidence, and promotion still requires real held-out mechanistic data through the versioned benchmark contract.
