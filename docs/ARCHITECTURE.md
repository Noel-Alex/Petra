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

Current `main` contains tested mechanism-level pieces—spatial fields, ecology, ciprofloxacin pharmacodynamic composition, mutation/lineage helpers, render contracts, UI planning, and worker/replay infrastructure. #37 now adds an explicit worker-facing composed ecology capability, but the flagship preset is **not yet auto-instantiated as a quantitative biological run** because its physical Monod/yield binding remains intentionally unbound.

The worker therefore has two explicit paths:

- protocol v3 initialization may carry a caller-supplied, already-authoritative `ComposedSimulationConfig`, producing genotype-aware composed checkpoints/metrics;
- omitting that config retains the synthetic infrastructure fixture for narrow replay/transport tests only;
- `syntheticPopulation` and `synthetic-pulse` must never be presented or adapted as real biology/interventions;
- product UI must not invent a composed config or scientific readouts merely to populate the expo shell;
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

### Implemented protocol v3 composed-capability boundary

The current versioned types in `src/sim/protocol.ts` define:

Main → worker:

- `initialize` with a versioned `RunIdentity` and optional explicit `ComposedSimulationConfig`;
- `command` carrying one of:
  - `advance`;
  - `synthetic-pulse` (**infrastructure fixture only**);
  - `restore`;
  - `snapshot`.

Timeline-worthy `SimulationEvent` records carry exact `simulationTimeHours` stamped by simulation authority when the event is emitted. UI/history consumers project that value directly rather than reconstructing old event time from a newer checkpoint.

Worker → main:

- `ready`;
- `snapshot`;
- `error`.

Snapshots are authority-tagged: synthetic checkpoints retain the infrastructure fixture, while composed checkpoints contain deep-copied composed state plus aggregate metrics and ordered lineage/genotype identity. Composed mode rejects `synthetic-pulse`. Do not translate real inoculation, nutrient, or antibiotic interactions into that fixture command.

### Target flagship protocol

#37 may evolve/version the protocol so the authoritative composed simulator can accept real typed scenario/intervention commands and publish scientific snapshots/events/metrics. The exact message names and payloads must come from the merged versioned source types, not from this planning document.

Required target properties:

- worker owns biological state;
- commands are explicit, typed, replayable, and correlated by identity;
- snapshots/events carry authoritative simulation time;
- same scenario/parameter versions + engine version + seed + ordered commands reproduce the same trace under one model version;
- React/Pixi never mutate biological arrays directly;
- rendering cadence remains independent from biological update cadence.

A protocol change is a replay/integration change and requires deterministic tests plus coordinated adapters.

## Mechanism composition and update ordering

The end-to-end flagship update loop is still being composed under #37. Treat the sequence below as the **target mechanism pipeline**, not evidence that current `main` already executes every step together:

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
- the reviewed continuous-biomass → discrete-event bridge remains owned by #5/#37;
- antibiotic concentration does not directly instruct mutation probability in the current model;
- any accelerated mutation sampler must be statistically validated against the exact bounded reference path.

See `src/sim/ecology/AGENTS.md` and `src/sim/evolution/AGENTS.md` for the binding local contracts.

## Checkpoint and replay authority

A production checkpoint must preserve every replay-critical state component required to continue the trajectory exactly under the same version, including as applicable:

- run/scenario/parameter identity;
- simulation tick/time;
- environmental fields;
- lineage biomass/state;
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
