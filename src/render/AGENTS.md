# Renderer DOX contract

## Purpose

Presentation-only transformation of authoritative Petra simulation snapshots into a living Petri-dish view.

## Authority boundary

- Renderer code never owns biological truth and never mutates simulation state.
- Renderer inputs are immutable/read-only snapshots or view models derived from authoritative simulation output.
- Camera, interpolation, LOD, particles, shaders, contours, highlights, and animation are visual-only.
- A rendered glyph/particle is a **visual proxy** unless a feature explicitly proves one-to-one identity with a simulated entity. Never infer cell count from glyph count.
- Render interpolation may smooth between snapshots but must not feed interpolated values back into simulation commands or scientific metrics.
- Overlay legends must carry units/meaning supplied by the scenario/view model; rendering code must not invent scientific units.

## Semantic zoom

Use named semantic levels rather than raw camera scale as scientific meaning:

- `dish` — whole ecosystem, fields, colony silhouettes and interventions;
- `colony` — local lineages, sampled cell glyphs, contours and local state;
- `representative-cell` — explanatory illustration only, clearly labelled representative rather than microscopic truth.

Zoom thresholds are presentation policy. Crossing them may reveal/hide information but may not change the simulation.

## LOD

LOD is deterministic for a fixed render snapshot + view request where practical. Sampling should be stable enough that stationary colonies do not visually reshuffle every frame.

Prefer aggregate density/texture at dish scale and bounded representative glyphs at colony scale. Never create one render object per biological cell.

## Accessibility

Critical lineage/state distinctions require a non-color cue. Reduced-motion mode suppresses decorative movement/camera sweeps while preserving state changes and scientific information.

## Technology boundary

The contract in this directory must remain usable without PixiJS. Pixi/WebGL adapters consume these types/helpers; domain/UI code should not depend on Pixi scene objects.

## Pixi adapter

- `src/render/pixiScene.ts` is an adapter over `DishRenderSnapshot`; Pixi objects never cross into simulation/domain state.
- React owns mount/unmount and passes snapshots/motion preference. The scene controller owns camera transforms and rendering only.
- The renderer fixture is explicitly synthetic and presentation-only. Replace it with authoritative #42/#37 snapshots without changing scene semantics.
- Pan/zoom operate on `CameraView`; semantic zoom controls representation density, not biology.
- Keep one Pixi `Application` per mounted dish unless profiling demonstrates a different lifecycle is materially better.
- Prefer stable aggregated primitives at dish scale and bounded representative glyphs at colony scale.

## Verification

Pure render-model/camera helpers get deterministic unit tests. Browser/GPU/FPS claims require actual browser/device measurements and must not be inferred from source review. Hosted CI is currently disabled by repository policy; route browser/performance evidence through the local experiment runner.
