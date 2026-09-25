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

Current `main` already contains a real composed-worker capability alongside the narrow synthetic infrastructure fixture path. `src/sim/protocol.ts` is protocol v8, `src/worker/simulation.worker.ts` selects `ComposedSimulationEngine` when an explicit `composedConfig` is supplied, and composed checkpoints/snapshots carry `authority: 'composed'`.

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

Protocol v8 checkpoints are a tagged union: `SyntheticSimulationCheckpoint` is infrastructure-only, while `ComposedSimulationCheckpoint` carries real composed state plus metrics, exact biological `rngState`, and `authority: 'composed'`. Composed state v5 checkpoints dynamic lineage identity, population authority when enabled, and the mutable ciprofloxacin concentration landscape; the config retains the fingerprinted initial landscape and source-backed PD/MIC policy. Composed authority validates its parameter-set/configuration binding, accepts only the typed ciprofloxacin mutation it implements, and rejects synthetic fixture commands. Do not translate inoculation, nutrient, phage, competitor, or other unsupported interactions into `synthetic-pulse` or `apply-ciprofloxacin`.

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
- protocol v8/state v5 may enable the reviewed shared population authority only with an explicit calibration/policy; `stepComposedStateDetailed(...)` then exposes its safe-integer per-lineage/per-cell division opportunities while checkpointing carry residuals;
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


## Authoritative observation and render data plane

Petra has one biological authority but several **different output classes**. They must not be collapsed into one giant "snapshot" merely because every consumer needs data.

### Layer 1 — replay-critical simulation checkpoint

`ComposedSimulationCheckpoint` is the worker-owned continuation authority. It contains the state required to continue the biological trajectory exactly under the same versioned run identity. This is the source from which current spatial biomass, resource, ciprofloxacin state, lineage channels, aggregate checkpoint metrics, inspector queries, restore, and replay are grounded.

Rules:

- only simulator code mutates biological state;
- renderer/app consumers receive detached/read-only projections and can never write checkpoint arrays;
- checkpoint identity, tick, `simulationTimeHours`, accepted `commandCount`, configuration fingerprint, and runtime branch generation remain distinct pieces of authority;
- biological time alone is **not** a unique state position because accepted commands such as ciprofloxacin application may change authoritative state without advancing time.

### Layer 2 — authoritative step observations

Some scientifically meaningful quantities exist **during an accepted step** but should not automatically become future-state authority. Examples include the ecology kernel's already-computed local division-biomass and death-biomass ledgers. These are observations of the executed operator, not values to reconstruct later from rendered motion or differences between two checkpoints.

A step-observation contract must carry enough identity to say exactly what interval it describes: grid/mask identity, aligned lineage order where applicable, authoritative step/tick position, exact step duration, units, and the state/configuration identity against which it was computed. Aggregate totals must agree with the local channels within the declared numerical tolerance.

Step observations are allowed to feed renderer overlays, diagnostics, validation, or sampled analysis. They do **not** become replay-critical merely because they are observable; if future biological execution needs one, it must be promoted intentionally into checkpoint state/versioning.

For ecology flux specifically:

- `divisionBiomass` and `deathBiomass` are continuous `model-biomass` flux amounts over the accepted ecology step; they are not discrete cell counts or mutation opportunities;
- do not infer either quantity from animation speed, colony-radius change, snapshot subtraction, or glyph churn;
- a downstream **rate** or signed net-growth field may be projected only when the source observation supplies an exact interval duration. The conversion must be explicit (for example `(division - death) / duration`) and retain a truthful unit such as `model-biomass/hour`; never relabel it as a per-capita growth constant unless the simulator explicitly supplies that different quantity;
- spread/reassignment and other operator stages can make endpoint biomass deltas semantically different from local division/death flux, so endpoint differencing is not an equivalent substitute.

Issue #605 owns the concrete observation shape; consumers must use its merged versioned/source contract rather than duplicating flux extraction.

### Layer 3 — sampled scientific measurements

Renderer-independent measurements are their own authority surface:

- `src/sim/metrics.ts` owns deterministic global metric sampling on authoritative tick cadence;
- `src/sim/regionInspector.ts` owns local read-only measurements directly from an exact composed checkpoint;
- analysis/export/ML consumers use these scientific samples rather than reverse-engineering values from `DishRenderSnapshot` or Pixi state.

Sampling cadence is independent from biology stepping and from render cadence. Samples preserve exact run/config/time identity and fail closed on malformed or mixed authority. Region values remain `model-biomass` / `model-resource` until a scenario provides a provenance-owned physical unit bridge.

### Layer 4 — immutable dish-render projection

`DishRenderSnapshot` is the renderer-facing projection, not a second simulator. The product adapter may copy/select/downsample **already-authoritative** channels into its validated render model while preserving their meaning.

For the flagship projection:

- `dishMask` comes from simulation geometry;
- aggregate `biomass` and every `RenderLineage.density` channel use one comparable model-biomass scale; representative glyph count is never a cell count;
- resource stays labelled as model resource unless a later scenario binds a physical unit;
- ciprofloxacin remains `mg/L`;
- source-backed local ecology flux may become transaction-bound `net-growth`, `division-rate`, and `death-rate` presentation only under the Layer-2 rules above; division/death channels remain continuous biomass rates rather than literal cell event counts;
- a `biomass` overlay may present the authoritative aggregate biomass channel without creating a new scientific measurement;
- an `uncertainty` overlay exists only when a source supplies an actual numeric uncertainty field. Validation status, provenance class, or UI confidence language is not a substitute uncertainty quantity;
- a point-shaped render event gets an `x,y` marker only when authoritative source data supplies a point position. Protocol-v6 lifecycle events generally do not carry point positions. Accepted `ciprofloxacin-applied` events are a distinct case: they carry exact normalized `global | radial | stripe | paint` intervention geometry, which is authoritative spatial **footprint** data but is not necessarily a point. Preserve that geometry through `src/render/acceptedInterventionFootprint.ts`; never coerce global/stripe/paint footprints into an invented center. Until a dish-event model explicitly supports footprint-shaped events, the existing point-event list may remain empty. Future mutation/infection point markers still require their own versioned source position authority.

Exact render keyframes preserve biological `simulationTimeHours`, but time is not enough to order history. The app replay bridge binds a render projection to the runtime-owned `runBranchIdentity` plus accepted `commandCount`. `snapshotId`/trace identity may identify the projected state; `samplingIdentity` is presentation-only stability for deterministic representative-glyph sampling and must not be treated as scientific ancestry.

One accepted runtime snapshot transaction should be the common source for the dish projection, timeline events, metric-history accumulation, exact-checkpoint inspector state, replay keyframe binding, and provenance/status surfaces. Consumers may select different fields, but they must not silently combine a dish from one command position with inspector/chart truth from another.

#### Renderer consumer authority matrix

This table is the operational handoff for dish/UI consumers. Source types and the nearest `AGENTS.md` still define the exact serialized shape; this matrix prevents a presentation implementation from widening their scientific meaning.

| Renderer consumer | Current availability | Authority / unit / identity | Presentation that is allowed | Do not infer |
| --- | --- | --- | --- | --- |
| Dish mask | **Available now** in composed runtime | Exact simulation geometry; binary in/out mask from the accepted composed checkpoint | Clip fields, density, contours, textures, hit regions, and camera framing to the admitted dish | Physical plate dimensions unless a scenario separately binds them |
| Aggregate biomass | **Available now** as `DishRenderSnapshot.biomass` and the `authoritative-biomass` field | Sum of accepted lineage channels; `model-biomass`; same grid/mask and accepted runtime transaction | Continuous opacity/texture, aggregate density overlay, contours, deterministic LOD summaries | Cells, CFU, dry mass, colony count, or physical density |
| Per-lineage density | **Available now** as `RenderLineage.density` | Comparable per-lineage `model-biomass` channels in authoritative lineage order | Density-driven colony masses, contours and bounded presentation-only accents; exact zero/off-mask density stays visually empty | One glyph/blob/island = one cell/colony; visual overlap/merging = biological fusion |
| Limiting resource | **Available now** as `authoritative-resource` | `model-resource`; `snapshot-extrema`; current flagship has no physical glucose mapping | Heatmap/field texture with explicit model-unit legend; interpolate only as presentation | Glucose concentration, grams, molarity, diffusion coefficient, uptake/yield, or a fungus nutrient law |
| Ciprofloxacin | **Available now** as `authoritative-ciprofloxacin` | Exact accepted concentration field in `mg/L`; `snapshot-extrema` | Concentration heatmap/texture and exact-value inspector/legend sourced from scientific state | Efficacy, killing, affected-cell count, clinical dose, or effect radius from color alone |
| Net local ecology rate | **Conditional / step-local** as `net-growth` | Exact accepted ecology-step observation, bound to runtime branch + composed position; pre-spread interval-average signed biomass rate with source-supplied biomass/time units | Diverging rate overlay only on transactions carrying the matching observation; absence is a valid state | Endpoint biomass difference, animation speed, per-capita growth constant, discrete divisions, or mutation supply |
| Division / death ecology rates | **Conditional / step-local** as `division-rate` and `death-rate` | Exact same accepted ecology-step observation as `net-growth`; non-negative pre-spread interval-average division-biomass and death-biomass rates with source-supplied biomass/time units | Sequential rate overlays only when the exact transaction carries the observation; absence is valid | Literal cell divisions/deaths, rates reconstructed from net growth, endpoint deltas, opacity, or glyph churn |
| Accepted intervention footprints | **Available now** as `acceptedInterventionFootprints` | Ordered accepted-event geometry with exact global/radial/stripe/paint semantics and biological timestamp | Bounded historical footprint outlines/fills and action-history presentation | Efficacy, diffusion/clearance, center for non-point geometry, affected population, or biological response |
| Lineage-origin point events | **Available now when source position exists** in `events` | Replay-critical positioned child-lineage creation projected from exact source cell/time; current active-lineage linkage is validated | Point markers, timeline cross-linking, bounded event accents | Founder position when absent, individual cell identity, mutation frequency from marker count, or event positions from density |
| Per-lineage organism morphology | **Available only with exact presentation evidence** | Presentation-only catalog joined by authoritative `taxonId + contentVersion`; missing evidence resolves neutral | Coarse reviewed representative vocabulary such as an E. coli rod; deterministic bounded representative glyphs | Physical dimensions, orientation dynamics, cell count, biological rates, morphology from name/color/genotype/density |
| Fungal physical front | **Standalone source-validation only** under `DishSceneTransaction@v1` | Source-validated *A. niger* no. 10 physical plate/front authority; no accepted composed-runtime position | Render the admitted physical front and presentation-only fungal accents in the standalone validation scene | Fungal biomass/density, glucose field, hyphal network topology, drug response, bacteria-fungus interaction, or joining to a bacterial run by equal time |
| Live mixed bacteria + fungus | **Unavailable / gated on #1005, #974 and #976** | Requires fungal state to enter the same accepted composed runtime/checkpoint transaction while retaining fungal-specific semantics | Nothing scientific until that shared authority exists | Combining standalone fungal validation with live bacteria, coercing fungal radius to bacterial biomass, or inventing competition |
| Uncertainty field | **Schema-reserved; unavailable without a numeric source field** | Must come from explicit source-owned numeric uncertainty authority with units/meaning | Only then, a labelled uncertainty overlay | A confidence heatmap from provenance class, validation badge, model status, or UI wording |
| Phage field / infection overlay | **Schema-reserved; not a live composed render channel yet** | Requires future versioned phage simulation/render authority | Keep product controls unavailable or explicitly pending until authority lands | Decorative particles or enum presence as proof of phage abundance/infection |

`snapshot-extrema` is presentation metadata, not a stable calibration across time: the same color or opacity in two keyframes may correspond to different values. Charts, inspectors and numeric readouts must consume scientific measurements/state rather than reverse-engineering the palette.

#### Central-dish performance and visual-continuity contract

- Preserve the authoritative scientific grid and keyframe content when the camera changes. Pan, zoom, semantic zoom and LOD may change **how** a keyframe is drawn, never the biological state or scientific resolution.
- Camera-only redraws must reuse snapshot-derived scientific preparation wherever the renderer contract provides a cache. Do not rescan O(grid cells) biomass/field authority merely because the view transform changed; invalidate scientific preparation when its admitted snapshot/channel identity changes, not on ordinary camera motion.
- Continuous opacity, filtered density rasters, contours and bounded connected visual accents may make colonies read as organic masses. Exact zero source density remains transparent/empty, and a presentation island merge is never a biological merge event.
- Between-keyframe interpolation is visual continuity only. Compatible continuous channels may interpolate; incompatible grid/mask/sampling/channel identity snaps to the authoritative target. Reduced/Off motion collapses to the exact target rather than retaining a synthetic in-between scientific state.
- Representative rods, particles, blobs, hyphal accents and similar primitives are bounded visual proxies. Never scale their count into simulated cell/hypha counts or let their animation feed inspector, metrics, replay or commands.
- Do not select downsampling, publication coalescing, transferable buffers, OffscreenCanvas, WASM, WebGPU or backend compute from aesthetic preference or source review. #876/#850/#642 own measured architecture decisions; #1054 supplies the later-run camera stress workload and must be interpreted together with exact authoritative load evidence.

### Layer 5 — presentation frames

Pixi interpolation, camera state, contours, particles, sampled rods, colony silhouettes, focus transitions, semantic zoom, and LOD are presentation only. A between-keyframe `DishPresentationFrame` may visually interpolate compatible continuous render channels, but it has no authority to manufacture an intermediate scientific checkpoint, metric sample, inspector reading, event, or command position.

The UI may therefore be smoother than the simulator publication cadence without pretending the interpolated frame was measured biology.

### Cadence separation

Petra deliberately keeps four clocks/policies separate:

1. biological integration / accepted command execution;
2. deterministic scientific metric sampling;
3. authoritative render-snapshot publication;
4. display-frame animation/interpolation.

Changing render publication or animation FPS must not change biology, RNG draw order, metric sampling, event ordering, or replay. Presentation snapshots may be skipped/dropped under load if product policy allows, while exact authoritative checkpoint/history continuity remains intact.

### Memory ownership, copies, transfer and downsampling

Correctness-first baseline:

- worker/checkpoint arrays remain owned by simulation authority;
- renderer projections use detached copies or dedicated export buffers so React/Pixi cannot mutate or accidentally detach the live engine state;
- a transferable `ArrayBuffer` must never be the only live buffer still needed by the engine after `postMessage`;
- validators run at the trust boundary before malformed lengths, masks, non-finite values, identity drift, or incompatible field metadata can reach scientific presentation;
- scientific inspector/metrics continue to read full authoritative state even if a presentation projection is later downsampled.

Optimization is evidence-gated. #630 measures real Worker handoff/clone/payload cost and now also records a clearly hypothetical arrays-only lower-bound estimate for candidate renderer typed channels; that estimate is sizing evidence, not a wire contract or proof that transfer/downsampling will help. #642 measures renderer/memory behavior. Only measured pressure justifies changes such as pooled/double-buffered export arrays, transferable projection buffers, lower-resolution presentation fields, OffscreenCanvas, SharedArrayBuffer, WASM, or backend/GPU moves. Any downsampled render field must preserve explicit resolution/meaning and remain presentation data; it cannot silently replace the full-resolution checkpoint for inspection, validation, replay, or dataset generation.

This data plane is the integration contract for #37. #457 consumes Layer 4, #605 supplies a Layer-2 ecology observation, #629 owns Layer-3 metric sampling, and renderer/UI work stays in Layer 5. New features should extend the narrowest correct layer instead of creating another parallel source of scientific truth.

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
