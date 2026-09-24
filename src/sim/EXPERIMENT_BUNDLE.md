# Experiment export / import bundle

`src/sim/experimentBundle.ts` owns Petra's compact replayable experiment
interchange. It is simulation authority, not presentation export.

## Version 1 authority

A v1 bundle carries:

- exact serialized `RunIdentity`;
- explicit authority kind (`synthetic` or `composed`);
- one exact authoritative origin checkpoint;
- ordered accepted mutating commands after that checkpoint;
- the exact composed configuration when the authority is composed;
- compact authoritative events/metric samples when supplied;
- canonical provenance/source identity strings.

The replay payload is checkpoint + ordered command authority. Events, metrics and
source IDs are evidence/audit context only; they never substitute for state or
commands.

Imports use `replayCompatibility.ts`. Petra currently registers no migrations,
so engine/protocol/run identity and authority must satisfy the exact-match replay
policy before an engine is instantiated from a bundle.

## Composed runs

Composed bundles must carry their exact `ComposedSimulationConfig`. Validation
requires:

1. the run's versioned parameter-set binding to own that configuration;
2. the origin checkpoint's configuration fingerprint to match it;
3. a restore into a fresh `ComposedSimulationEngine` to succeed before replay.

This includes every field already participating in
`composedConfigurationFingerprint(...)`, including replay-critical numerical
execution policy. The bundle must not reconstruct configuration from friendly
labels.

## Replay history

Only accepted mutating commands belong in v1 replay history:

- `advance`;
- `synthetic-pulse` for synthetic infrastructure authority only.

`restore` and `snapshot` are not post-origin biological history and are
rejected. Command IDs remain ordered replay metadata and must be unique inside
the exported suffix.

Replaying a bundle starts a new replay scope by restoring the exported origin and
then applying its command suffix. The resulting authoritative state is
reproducible under the exact compatibility policy. The bundle does **not** claim
that the new replay's restore event/trace hash is byte-identical to the original
historical stream.

## Deliberate exclusions

Version 1 explicitly excludes:

- renderer/Pixi state or interpolation;
- raw ML datasets or large trace artifacts;
- counterfactual ancestry.

Counterfactual ancestry remains disabled until #438 provides independently
verifiable parent snapshot trace identity. A caller cannot add ancestry metadata
to v1 and have Petra ignore it; validation refuses the bundle.

Unknown top-level, replay, evidence, capability and command fields are also
rejected. New required semantics must use a new schema version rather than
silently extending v1.

## Evidence

Optional authoritative metric samples must belong to the exact bundle identity
and use the current metric sampling contract. Synthetic infrastructure bundles
cannot claim composed biological metric samples.

Provenance source IDs are compact references only. The bundle does not embed
whole papers, raw datasets or presentation assets.

## Compatibility/refusal

Import failures are typed `ExperimentBundleError` values with stable categories
such as runtime incompatibility, identity mismatch, configuration-binding
mismatch, invalid checkpoint/history, invalid evidence, or unsupported ancestry.
Callers should surface the refusal; never silently approximate, migrate, change
seed, or swap parameter sets.

## Verification expectations

Deterministic fixtures should cover at minimum:

- synthetic checkpoint + command round-trip;
- composed checkpoint/config + command round-trip;
- canonical serialize/parse stability;
- configuration drift refusal;
- old/unsupported runtime refusal;
- illegal history command refusal;
- unknown-field refusal;
- ancestry refusal until #438 is resolved.

Browser/share UI and filesystem download/upload affordances are downstream
presentation concerns. They must consume this authority rather than define their
own replay format.
