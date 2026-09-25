# PETRA Architecture

This document separates **what is implemented on current `main`** from the **target competition architecture**. When they differ, the versioned source types and nearest `AGENTS.md` contracts are authoritative.

## Competition stack

- React + TypeScript + Vite for the accessible application shell.
- Authoritative simulation work in a dedicated Web Worker.
- Flat typed arrays / data-oriented state for spatial numerical kernels.
- Explicit serializable seeded PRNG for biological stochasticity.
- PixiJS/WebGL for the live 2D/2.5D dish; DOM/SVG for accessible controls, text, charts, and provenance.
- Rust/WASM only after profiling identifies a stable hot kernel where compute savings justify transfer/interop complexity.

The frontend explains and controls the model. It does not become the model.

## Current implementation boundary

Current `main` already contains a real composed-worker capability alongside the narrow synthetic infrastructure fixture path. `src/sim/protocol.ts` is protocol v6, `src/worker/simulation.worker.ts` selects `ComposedSimulationEngine` when an explicit `composedConfig` is supplied, and composed checkpoints/snapshots carry `authority: 'composed'`.

That does **not** mean the flagship product path is complete. Issue #37 now owns the remaining product/flagship activation and integration work rather than the existence of a composed worker loop:

- protocol v6 keeps synthetic and composed authority explicitly distinct; omitted `composedConfig` is the infrastructure/test fixture path, not product biology;
- composed runs require a validated parameter-set binding in `RunIdentity`, tying the friendly parameter-set ID/version to the exact deterministic composed-configuration fingerprint;
- `syntheticPopulation` and `synthetic-pulse` remain explicitly synthetic fixtures and must never be presented or adapted as real biology/interventions;
- protocol v6 now supplies one real flagship intervention mutation, `apply-ciprofloxacin`; reviewed continuous-biomass → discrete evolution authority, remaining intervention families, and product-default flagship activation remain separate #37/#626 gates;
- product UI must not invent scientific readouts when the active runtime does not supply the required authoritative records;
- renderer demo fixtures remain presentation-only and visibly disclosed.

## Domain and state layout

The target spatial model uses a square numerical grid with a circular dish mask.

Grid resolution is **scenario/engineering configuration**, not a biological constant. Architecture code must not hard-code a universal `128×128` (or any other) scientific default. The active preset may choose a resolution for performance/visual calibration, and that choice must remain identifiable as engineering configuration unless separately physically calibrated.

Target authoritative fields include:

- limiting resource / nutrient;
- ciprofloxacin concentration;
- optional future mechanism fields such as phage.

Lineages use compact metadata plus aggregate spatial biomass/density channels. Avoid one JavaScript object per bacterium. Representative rendered cells are visual proxies unless a future model explicitly establishes one-to-one simulated individuals.

## Worker protocol

### Implemented protocol v6 on current main

The current versioned types in `src/sim/protocol.ts` define:

Main → worker:

- `initialize` with a versioned `RunIdentity` plus optional `composedConfig`; supplying composed configuration selects composed biological authority, while omission retains only the synthetic infrastructure fixture;
- `command` carrying one of:
  - `advance`;
  - `apply-ciprofloxacin` with schema-versioned exact `mg/L`, `set|add`, and global/radial/stripe/paint geometry (**composed authority only**);
  - `synthetic-pulse` (**infrastructure fixture only**);
  - `restore`;
  - `snapshot`.

Timeline-worthy `SimulationEvent` records carry exact `simulationTimeHours` stamped by simulation authority when the event is emitted. UI/history consumers project that value directly rather than reconstructing old event time from a newer checkpoint.

Worker → main:

- `ready`;
- `snapshot`;
- `error`.

Protocol v6 checkpoints are a tagged union: `SyntheticSimulationCheckpoint` is infrastructure-only, while `ComposedSimulationCheckpoint` carries real composed state plus metrics and `authority: 'composed'`. Composed state v4 checkpoints the mutable ciprofloxacin concentration landscape; the config retains the fingerprinted initial landscape and source-backed PD/MIC policy. Composed authority validates its parameter-set/configuration binding, accepts only the typed ciprofloxacin mutation it implements, and rejects synthetic fixture commands. Do not translate inoculation, nutrient, phage, competitor, or other unsupported interactions into `synthetic-pulse` or `apply-ciprofloxacin`.

### Remaining flagship protocol/product integration

The composed worker substrate and first real ciprofloxacin mutation are implemented. #37/#626 may still evolve/version the protocol where the flagship needs additional intervention families, authoritative product records, or other wire-shape changes. The exact message names and payloads must come from the merged versioned source types, not from this planning document.

Required target properties:

- worker owns biological state;
- commands are explicit, typed, replayable, and correlated by identity;
- snapshots/events carry authoritative simulation time;
- same scenario/parameter versions + engine version + seed + ordered commands reproduce the same trace under one model version;
- React/Pixi never mutate biological arrays directly;
- rendering cadence remains independent from biological update cadence.

A protocol change is a replay/integration change and requires deterministic tests plus coordinated adapters.

## Mechanism composition and update ordering

Current `ComposedSimulationEngine` already executes a deterministic worker-facing loop over the bounded composed resource/biomass ecology authority. The full flagship mechanism pipeline is still incomplete under #37, so treat the sequence below as the **target complete pipeline**, not evidence that current `main` already executes every listed intervention/evolution stage together:

1. accept queued, typed authoritative interventions;
2. update/diffuse active environmental fields under their numerical contracts;
3. derive mechanism-owned effects such as genotype-specific ciprofloxacin loss hazards from authoritative field state;
4. run resource-limited ecology with caller/scenario-owned parameters;
5. bridge reviewed reproduction/event opportunities into evolution sampling;
6. update lineage ancestry/extinction and spatial state;
7. enforce numerical invariants;
8. record authoritative metrics/events/checkpoint state;
9. publish a render-oriented snapshot at presentation cadence.

### Critical ecology → evolution boundary

`src/sim/ecology/**` reports `divisionBiomass` as **continuous aggregate biomass flux**. It is not an integer birth/division count.

`src/sim/evolution/sampleDivisionMutations(divisions, ...)` consumes a **non-negative safe-integer count of reviewed discrete division/event opportunities**.

Therefore:

- never round, scale, or pass `divisionBiomass` directly into the exact mutation sampler;
- do not invent a convenience biomass→birth conversion inside composition code;
- protocol v6/state v4 may enable the reviewed shared population authority only with an explicit calibration/policy; `stepComposedStateDetailed(...)` then exposes its safe-integer per-lineage/per-cell division opportunities while checkpointing carry residuals;
- the bundled flagship remains uncalibrated for cell-equivalents (`populationAuthority: null`), so product/evolution code must not claim discrete cells/divisions for that run until scenario authority supplies the calibration;
- antibiotic concentration does not directly instruct mutation probability in the current model;
- any accelerated mutation sampler must be statistically validated against the exact bounded reference path.

See `src/sim/ecology/AGENTS.md` and `src/sim/evolution/AGENTS.md` for the binding local contracts.

## Checkpoint and replay authority

A production checkpoint must preserve every replay-critical state component required to continue the trajectory exactly under the same version, including as applicable:

- run/scenario/parameter identity;
- simulation tick/time;
- environmental fields, including the current mutable ciprofloxacin concentration landscape when enabled;
- lineage biomass/state;
- when an explicit cell-equivalent calibration/policy is enabled, discrete standing-host counts plus standing/division residual state;
- biological RNG state;
- lineage ancestry/extinction/event state;
- next lineage-ID allocation state;
- ordered accepted-command identity.

Renderer objects, animation progress, camera position, decorative particles, and DOM state are not biological checkpoint authority.

Changing numerical operator order, stochastic draw order, or checkpoint semantics is a model/replay change and must be version-reviewed.

## Performance rules

- keep heavy simulation off the main UI thread;
- avoid unnecessary allocation in hot numerical loops;
- reuse field/scratch buffers where practical;
- transfer or downsample render state when measurements show copy cost matters;
- use explicit LOD rather than drawing one object per biological cell;
- measure simulation ms/tick, payload cost, render frame time, and memory before changing architecture;
- profile before rewriting anything in Rust/WASM, GPU compute, SharedArrayBuffer, or additional workers.

Optimization must not silently alter scientific semantics.

## Visual model

The renderer consumes immutable authoritative render snapshots or explicitly labelled visual-demo fixtures.

It may generate:

- organic colony edges;
- representative cell glyphs;
- field textures/contours;
- glass/rim treatment;
- causal emphasis;
- semantic camera transitions.

Those presentation products cannot feed back into biological outcomes. A rendered particle/glyph count is not a cell count unless a future feature explicitly proves one-to-one identity.

Semantic zoom changes what information is revealed, not the underlying simulator.

## UI and control authority

React owns accessible product orchestration, not biological equations.

- user actions become typed UI intents and then authoritative worker commands where the protocol supports them;
- a command appears as accepted scientific history only after authoritative confirmation;
- scientific inspector values stay blank/incomplete rather than being fabricated;
- motion/onboarding may explain authoritative events but may not synthesize them;
- active tool cancellation receives Escape priority before lower-priority global/camera behavior.

## Provenance architecture

Scenario/configuration data should expose stable source/provenance identities so simulator, UI, validation, and explanation surfaces resolve the same records.

Biological or scientific-authority values need, where applicable:

- value/range and units;
- source identity and experimental context;
- explicit evidence/classification semantics;
- derivation/transformation when derived;
- transfer/calibration/approximation notes and limitations.

Engineering and visual-only values must remain visibly distinct from biological measurements. The UI must not infer evidence class from DOI presence, source count, color, or confidence tier.

## Deployment and offline expo behavior

Core Petra should remain usable as a local/static browser application after its assets are installed/bundled:

- simulation authority runs locally in-browser;
- no LLM or hosted backend is required for the flagship mechanistic path;
- optional future sharing, telemetry, model-training storage, or explanation services must not become prerequisites for the core demo.

Current project policy also forbids hosted CI; verification is local/manual and browser/device acceptance flows through the registered laptop experiment pipeline.
