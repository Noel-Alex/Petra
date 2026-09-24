# Counterfactual fork authority

## Purpose

`counterfactual.ts` owns Petra's framework-neutral deterministic fork primitive. It turns one exact simulation checkpoint into two independently advanced branches without moving biological authority into React, Pixi, or compare presentation code.

## Authority contract

- A fork begins from one parent `SimulationSnapshot`. The checkpoint is deep-cloned once and restored into both branch engines.
- Branch identity (`branchId`, label, source run ID, parent trace hash) is metadata around simulation state; it never changes RNG state or biology.
- Both branches use the exact same checkpoint, RNG state, command count, and internal restore command. With the same ordered post-fork commands they must remain replay-identical.
- Branch command history stores authoritative command payloads, not only IDs. The current bounded contract permits mutating `advance` and `synthetic-pulse` commands; caller-controlled `restore` and `snapshot` commands are forbidden inside a branch history because they would make ancestry ambiguous.
- Command IDs must be non-empty and unique within each branch. Failed commands are not appended to branch history.
- Fork checkpoints must round-trip canonically through the current `SimulationEngine`; malformed or engine-inconsistent payloads fail closed before branch creation.
- All snapshots, replay bundles, checkpoints, and command arrays returned to callers are copy-isolated. Mutating a returned object cannot mutate branch authority.

## Replay bundle

`CounterfactualForkReplayBundle` is versioned and replay-ready for the current engine substrate because it contains:

- the exact fork checkpoint payload;
- source-run and parent-trace ancestry identity;
- branch IDs and labels;
- ordered post-fork command payloads for both branches.

`replayCounterfactualFork(...)` reconstructs both branches from that payload and must reproduce the same branch snapshots and histories.

This is separate from `src/ui/compare/export.ts`, whose existing manifest remains intentionally metadata-only. Presentation code may adapt the authoritative fork state later, but must not become the fork authority.

## Current boundary

Protocol v3 introduces an explicit composed-authority checkpoint variant, but this fork controller still owns only the legacy synthetic `SimulationEngine` contract. Its public replay payload is therefore typed to `SyntheticSimulationCheckpoint`, and construction from a composed snapshot fails closed rather than pretending composed branch/replay semantics exist.

A later #9/#37 integration must add a composed fork engine that preserves the complete composed checkpoint/configuration identity (including ordered lineage/genotype channels) and only then widen the fork/replay bundle. Do not adapt composed checkpoints through the synthetic engine or `synthetic-pulse`.

## Verification

Required deterministic coverage:

- same parent checkpoint produces identical initial branch snapshots;
- identical ordered commands preserve equality;
- a divergent command stream produces divergent authoritative state;
- exporting then replaying the fork bundle reproduces both branches exactly;
- parent/returned-object mutation cannot alter internal branch state;
- duplicate branch IDs/command IDs and restore/snapshot branch commands fail closed;
- engine-inconsistent checkpoint payloads are rejected.

Contributor: Noel-Alex
