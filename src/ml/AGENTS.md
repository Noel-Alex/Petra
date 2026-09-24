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

## Verification

Pure dataset/split/OOD/mode-gate helpers require deterministic unit tests. Training quality, held-out metrics, latency, and accelerator claims require actual measured evidence and may not be inferred from source structure.
