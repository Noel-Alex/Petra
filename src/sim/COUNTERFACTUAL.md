# Counterfactual fork authority

## Purpose

`counterfactual.ts` owns Petra's framework-neutral deterministic fork primitive. It turns one exact simulation checkpoint into two independently advanced branches without moving biological authority into React, Pixi, or compare presentation code.

## Authority contract

- A fork begins from one parent `SimulationSnapshot`. Its trace is recomputed from the exact checkpoint + event payload through the shared `snapshotTrace.ts` contract before ancestry is accepted. The checkpoint is then deep-cloned once and restored into both branch engines.
- Branch identity (`branchId`, label, source run ID, parent trace hash) is metadata around simulation state; it never changes RNG state or biology. The historical field name `checkpointTraceHash` refers to the existing whole-snapshot trace contract (checkpoint + events), not a checkpoint-only digest.
- Both branches use the exact same checkpoint, RNG state, command count, and internal restore command. With the same ordered post-fork commands they must remain replay-identical.
- Branch command history stores authoritative command payloads, not only IDs. The current bounded contract permits mutating `advance` and `synthetic-pulse` commands; caller-controlled `restore` and `snapshot` commands are forbidden inside a branch history because they would make ancestry ambiguous.
- Command IDs must be non-empty and unique within each branch. Failed commands are not appended to branch history.
- Fork checkpoints must round-trip canonically through the current `SimulationEngine`; malformed or engine-inconsistent payloads fail closed before branch creation. A valid trace over a malformed checkpoint is therefore a checkpoint failure, while a mismatched trace over otherwise valid evidence is a provenance failure.
- All snapshots, replay bundles, checkpoints, parent event arrays, and command arrays returned to callers are copy-isolated. Mutating a returned object cannot mutate branch authority.

## Replay bundle

`CounterfactualForkReplayBundle` schema **v2** is replay-ready and independently ancestry-verifiable for the current engine substrate because it contains:

- the exact fork checkpoint payload;
- the exact parent event payload covered by the current snapshot trace;
- source-run and parent-trace ancestry identity;
- branch IDs and labels;
- ordered post-fork command payloads for both branches.

The v2 validator recomputes the canonical snapshot trace from bundled checkpoint + parent events before replay. Schema v1 did not retain the event evidence required by the trace contract and is intentionally not accepted as self-verifiable ancestry. `replayCounterfactualFork(...)` reconstructs both branches from the verified v2 payload and must reproduce the same branch snapshots and histories.

This is separate from `src/ui/compare/export.ts`, whose existing manifest remains intentionally metadata-only. Presentation code may adapt the authoritative fork state later, but must not become the fork authority.

## Current boundary

The current browser worker is still the synthetic protocol substrate. This module deliberately composes only the existing `SimulationEngine` checkpoint/command contract and does not touch `authoritative.ts`, flagship biology, renderer state, or worker migration. When #37 replaces the synthetic worker protocol, the fork layer should consume the new authoritative checkpoint/command union rather than invent a parallel simulation model.

## Verification

Required deterministic coverage:

- same parent checkpoint produces identical initial branch snapshots;
- identical ordered commands preserve equality;
- a divergent command stream produces divergent authoritative state;
- exporting then replaying the fork bundle reproduces both branches exactly;
- swapping a trace hash between valid parent snapshots or mutating bundled parent events is rejected as provenance mismatch;
- a malformed checkpoint with a recomputed valid trace still fails through checkpoint validation, distinctly from provenance mismatch;
- parent/returned-object mutation cannot alter internal branch state;
- duplicate branch IDs/command IDs and restore/snapshot branch commands fail closed;
- engine-inconsistent checkpoint payloads are rejected.

Contributor: Noel-Alex
