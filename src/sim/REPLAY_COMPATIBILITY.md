# Replay and checkpoint compatibility contract

## Purpose

This document is the release-facing compatibility contract for Petra checkpoints,
replay bundles, and any future authoritative import/export path. The executable
policy lives in `replayCompatibility.ts`.

Petra must never reinterpret serialized scientific state under a different
engine, protocol, scenario, parameter set, configuration binding, authority
kind, or seed.

## Current policy

`REPLAY_COMPATIBILITY_POLICY_VERSION = 1` is **exact-match-only**.

There are currently **no registered replay migrations**. An incompatible
artifact is refused with a human-readable reason before authoritative state is
mutated or an old self-contained bundle is allowed to instantiate an engine.

Current runtime identity:

| Field | Current release requirement |
| --- | --- |
| engine version | `petra-ts-core/0.1.0` |
| worker protocol | `4` |
| authority kind | exact `synthetic` or `composed` match |
| scenario ID/version | exact artifact ↔ active-run match |
| parameter-set ID/version | exact artifact ↔ active-run match |
| parameter-set binding | exact canonical binding, including configuration fingerprint |
| seed | exact artifact ↔ active-run match |

Changing any row is replay-incompatible unless a future, explicitly reviewed
migration proves that scientific semantics and deterministic continuation are
preserved.

## Current flagship expo identity

The repository's flagship composed-run contract currently asserts:

- scenario ID: `ecoli-ciprofloxacin-spatial`
- scenario version: `1.4.0-research`
- parameter-set ID: `ecoli-ciprofloxacin-baseline-composed`
- parameter-set version: `1.0.0`
- engine version: `petra-ts-core/0.1.0`
- protocol version: `4`
- parameter-set binding: exact provenance-owned composed configuration fingerprint
- seed: exact seed carried by the saved run/bundle

The seed is intentionally not a single global "expo seed". Each saved demo run
keeps its own seed as replay identity. A different seed is a different run, not
a migration.

## Compatibility matrix

### Synthetic checkpoint restore

Accepted only when:

1. serialized identity is structurally valid;
2. engine and protocol equal the current build;
3. checkpoint authority is synthetic;
4. scenario, parameter set, optional binding, and seed exactly match the target
   `SimulationEngine` identity;
5. checkpoint scalar/RNG invariants pass existing restore validation.

Refusal happens before live engine state is mutated.

### Composed checkpoint restore

Accepted only when the same identity requirements above pass with
`authority: 'composed'`, followed by existing composed-state/configuration,
metric, geometry, and tick/time validation. A changed parameter-set
configuration fingerprint is incompatible even if the human-readable
parameter-set ID/version are unchanged.

### Counterfactual replay bundle

`CounterfactualForkReplayBundle` is self-contained enough to instantiate its
synthetic branch engines. Therefore bundle validation first checks the embedded
checkpoint against the **current** engine/protocol policy before constructing an
engine from that checkpoint identity. This prevents an old artifact from
self-validating against its own old version stamp.

The bundle schema version must also match its own current schema. No bundle
schema or runtime migration exists today.

### Compare export manifest

`src/ui/compare/export.ts` remains metadata-only and explicitly
`replayReady: false`. It is not an authoritative checkpoint loader and cannot
resume a run. Its version/provenance fields are audit metadata.

If that export ever gains checkpoint bytes and authoritative command payloads,
its import/replay path must call the same `replayCompatibility.ts` authority
before loading state. Presentation code may not create a weaker parallel
compatibility policy.

## Migration rule

A future migration may be added only when all of the following are true:

1. source and destination versions are explicitly named;
2. the transformation is deterministic and total over the accepted source
   artifact subset;
3. scientific meaning, replay-critical ordering, RNG continuation, and
   parameter/configuration provenance are demonstrably preserved;
4. migration emits a new destination artifact rather than silently pretending
   the source already had the destination identity;
5. deterministic fixtures prove equivalent continuation;
6. the migration and its evidence are documented here.

If any condition cannot be proven, refusal is the required behavior.

## Verification

Required regression coverage includes:

- exact-match acceptance;
- old engine refusal;
- old protocol refusal;
- authority mismatch refusal;
- scenario/parameter/binding/seed mismatch refusal;
- malformed identity refusal;
- atomic checkpoint refusal with no live-state mutation;
- self-contained counterfactual bundle refusal before old-version
  self-instantiation.

Contributor: Noel-Alex
