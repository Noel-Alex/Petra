# Counterfactual fork authority

## Purpose

`counterfactual.ts` owns Petra's framework-neutral deterministic fork primitive. It turns one exact simulation checkpoint into two independently advanced branches without moving biological authority into React, Pixi, or compare presentation code.

## Authority contract

- A fork begins from one parent `SimulationSnapshot`. The checkpoint is deep-cloned once and restored into both branch engines.
- Branch identity (`branchId`, label, source run ID, parent trace hash) is metadata around simulation state; it never changes RNG state or biology.
- Parent trace identity is accepted only after `snapshotTrace.ts` recomputes the exact checkpoint + event trace. A swapped/forged trace is a distinct provenance failure and is rejected before branch construction.
- Both branches use the exact same checkpoint, RNG state, command count, and internal restore command. With the same ordered post-fork commands they must remain replay-identical.
- Branch command history stores authoritative command payloads, not only IDs. The current bounded contract permits mutating `advance` and `synthetic-pulse` commands; caller-controlled `restore` and `snapshot` commands are forbidden inside a branch history because they would make ancestry ambiguous.
- Command IDs must be non-empty and unique within each branch. Failed commands are not appended to branch history.
- Fork checkpoints must pass the shared release compatibility gate and round-trip canonically through the current `SimulationEngine`; malformed, stale engine/protocol, or engine-inconsistent payloads fail closed before branch creation.
- All snapshots, replay bundles, checkpoints, and command arrays returned to callers are copy-isolated. Mutating a returned object cannot mutate branch authority.

## Replay bundle

`CounterfactualForkReplayBundle` schema v2 is replay-ready and independently ancestry-verifiable because it contains:

- the exact fork checkpoint payload;
- the exact parent event payload used by Petra's snapshot trace contract;
- source-run and parent-trace ancestry identity;
- branch IDs and labels;
- ordered post-fork command payloads for both branches.

`replayCounterfactualFork(...)` first recomputes the parent trace from the bundled checkpoint + parent events, then validates current-runtime compatibility/checkpoint canonicality, reconstructs both branches, and must reproduce the same branch snapshots and histories. A bundle cannot preserve ancestry by carrying an unverifiable trace string alone. The shared `snapshotTrace.ts` helper owns the stable serialization + FNV regression identity for both synthetic and composed engine snapshots.

This is separate from `src/ui/compare/export.ts`, whose existing manifest remains intentionally metadata-only. Presentation code may adapt the authoritative fork state later, but must not become the fork authority.

## Current boundary

The counterfactual controller remains deliberately synthetic-only even though the worker/runtime can now carry composed authority. This module composes only the existing `SimulationEngine` synthetic checkpoint/command contract and does not widen composed biology, renderer state, or worker protocol. A future composed-fork slice must consume the existing authoritative composed checkpoint/command contracts rather than invent a parallel simulation model.

## Verification

Required deterministic coverage:

- same parent checkpoint produces identical initial branch snapshots;
- identical ordered commands preserve equality;
- a divergent command stream produces divergent authoritative state;
- exporting then replaying the fork bundle reproduces both branches exactly;
- parent/returned-object mutation cannot alter internal branch state;
- duplicate branch IDs/command IDs and restore/snapshot branch commands fail closed;
- engine-inconsistent checkpoint payloads are rejected;
- stale engine/protocol replay identities are rejected before branch engines are constructed;
- swapped parent trace hashes and modified bundled parent events are rejected as provenance failures;
- malformed checkpoints whose trace has been recomputed still fail through checkpoint validation, distinct from provenance mismatch.

Contributor: Noel-Alex
