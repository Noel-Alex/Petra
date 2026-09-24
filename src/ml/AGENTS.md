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
- Split policy is versioned and deterministic.

## OOD policy

- Every promoted surrogate declares numeric ranges and categorical values used during training/validation.
- Missing, non-finite, unknown, or out-of-range required inputs are out of domain.
- OOD emulated requests are refused and routed to mechanistic mode; the caller must surface the reason.
- Do not silently extrapolate.

## Promotion

A surrogate is not product-eligible until it has a versioned dataset, leakage-safe held-out evaluation, a simple baseline comparison, declared domain envelope, visible error metrics, and a mechanistic spot-check path.

- Held-out regression evidence uses complete rows and declared targets; missing/extra targets, non-finite values, row-count mismatch, or metric overflow are invalid evidence.
- Benchmark evidence binds model id/version, dataset version, engine version, split-policy version, held-out split, baseline id, and per-target MAE/RMSE/count.
- A `validated` model card must carry its promotion evidence and requirements. Emulated admission re-checks that evidence rather than trusting the status label alone.
- Candidate and baseline must cover exactly the declared targets and use equal evaluation counts for each target.
- The current default promotion rule requires strict improvement in both MAE and RMSE on every declared target. Petra does not invent a percentage margin; any future margin must be separately versioned and justified.
- Stale/mismatched benchmark evidence routes to mechanistic mode with an explicit `promotion-evidence-invalid` reason.

## Verification

Pure dataset/split/OOD/mode-gate/benchmark helpers require deterministic unit tests. Training quality, held-out metrics, latency, and accelerator claims require actual measured evidence and may not be inferred from source structure.


## Mechanistic sweep planning
- `src/ml/sweep.ts` plans future authoritative trajectories only; it never fabricates samples, runs surrogate inference, or substitutes for the mechanistic engine.
- Parameter-set hashes and intervention fingerprints are supplied by the authoritative scenario/runner layer. The ML planner treats them as identities and must not invent biological values.
- The leakage boundary is the scenario + parameter-set hash + intervention fingerprint. Every seed replica in that group must remain in one split.
- Equivalent parameter hashes or intervention fingerprints may not be duplicated under different display ids because that could let equivalent biological conditions cross split boundaries.
- Sweep definitions require an explicit `maxTrajectories` budget. Refuse oversized Cartesian products before execution rather than silently launching an unbounded local/cloud workload.
- Dataset-generation manifests record plan/dataset/engine/scenario/split-policy identity plus stable trajectory keys. They are execution provenance, not evidence that the trajectories were actually simulated.
