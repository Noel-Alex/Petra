# ML / surrogate DOX contract

## Purpose

Own Petra's optional learned-surrogate infrastructure without granting ML authority over biology.

## Authority boundary

- The mechanistic simulator remains authoritative and must always remain available.
- ML may accelerate or preview validated mechanistic behavior; it may not invent mutations, MICs, biological parameters, intervention outcomes, or lineage events.
- Product modes are explicit: `mechanistic` or `emulated`. Never present an emulated result as mechanistic.
- Emulated mode is feature-gated, promotion-gated, engine-version-gated, and domain-gated. A failed gate falls back to mechanistic execution with an explicit refusal reason for the UI. A model validated against an older/different engine may not silently remain active.
- Model/runtime code consumes declared inputs and metadata. It does not mutate simulator state.

## Dataset integrity

- Every sample carries dataset version, engine version, parameter-set hash, scenario/version, seed, intervention fingerprint, normalization profile, snapshot index, and simulation time.
- Split assignment happens at a declared parameter/scenario **group** level. All trajectories and frames in one group stay in exactly one of train/validation/test.
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
- Benchmark evidence binds model id/version, dataset version, engine version, split-assignment policy version, split-coverage policy version, **evaluation-weighting policy version**, held-out split, baseline id, declared held-out group keys, requested forecast horizons, coverage counts, and per-target MAE/RMSE/count.
- Promotion evaluation uses paired authoritative rows: candidate and baseline predictions share the same group/trajectory/horizon target record. Do not compare independently sampled candidate/baseline populations.
- The default v3 evaluation contract permits exactly one evaluation record per trajectory × declared horizon, equal-weights requested horizons inside each held-out group, and equal-weights held-out groups overall. Snapshot cadence or trajectory length must not silently add promotion weight.
- Evidence must retain overall, per-group, per-horizon, and group×horizon metrics plus group/trajectory/row coverage. Missing required strata fail closed.
- A `validated` model card must carry its promotion evidence and requirements. Emulated admission re-checks that evidence rather than trusting the status label alone.
- Candidate and baseline must cover exactly the declared targets and use equal paired evaluation counts for each target and required stratum.
- The current default promotion rule requires strict improvement in both MAE and RMSE on every declared target at overall, per-group, per-horizon, and group×horizon levels. Petra does not invent a percentage margin; any future aggregation/threshold change must be separately versioned and justified.
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
- Dataset-generation manifest v2 records plan/dataset/engine/scenario identity, split-assignment policy, split-coverage policy, per-split group/trajectory counts, and stable trajectory keys. These are execution provenance, not evidence that trajectories were actually simulated.
- Surrogate benchmark evidence v3 and promotion requirements carry the same split-coverage-policy and evaluation-policy versions so evidence produced under older coverage/weighting contracts cannot be silently reinterpreted.
