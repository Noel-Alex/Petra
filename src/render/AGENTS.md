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

LOD is deterministic for a fixed render snapshot + view request where practical. Representative sampling uses a stable presentation-domain identity plus grid, lineage, and cell identity rather than snapshot-instance/time entropy, so stationary colonies do not visually reshuffle every frame. Grid/index-schema changes intentionally invalidate that presentation sample; persistent glyphs remain visual proxies and must never be described as the same individual bacterium across time.

Prefer aggregate density/texture at dish scale and bounded representative glyphs at colony scale. Never create one render object per biological cell.

## Accessibility

Critical lineage/state distinctions require a non-color cue. Reduced-motion mode suppresses decorative movement/camera sweeps while preserving state changes and scientific information.

## Technology boundary

The contract in this directory must remain usable without PixiJS. Pixi/WebGL adapters consume these types/helpers; domain/UI code should not depend on Pixi scene objects.

## Verification

Pure render-model helpers get deterministic unit tests. Browser/GPU/FPS claims require actual browser/device measurements and must not be inferred from source review.

## Pixi live-dish adapter
- PixiJS/WebGL belongs under `src/render/pixi/**`; it consumes `DishRenderSnapshot` and never owns simulation state.
- React wrappers may own canvas lifecycle/accessibility only. They must pass immutable snapshots/motion settings into the renderer rather than importing Pixi objects into app/domain state.
- Camera pan/zoom/focus is presentation state. Semantic zoom changes detail level, not biology.
- The visible dish aperture has one presentation geometry authority in `src/render/pixi/camera.ts`: drawing, screen↔dish conversion, pan scale, wheel/pinch/double-click anchors, clipping, and future selection adapters must consume the same center/diameter contract rather than repeating viewport-square assumptions or the aperture fraction.
- Field overlays are rendered only from source-provided fields and retain source label/unit metadata in the surrounding UI; renderer code must not synthesize scientific units.
- Lineage identity uses both color and pattern/ring cues. Density marks and representative glyphs remain visual proxies.
- Lineage hue comes from the strict versioned `appearanceToken` vocabulary, never from lineage array position. The same token must resolve to the same hue across snapshots/replays; hue is presentation-only reinforcement and cannot encode hidden scientific state.
- Lineage pattern identity is a strict renderer vocabulary, currently `solid-ring | double-ring`. Every supported token must produce distinct neutral geometry at aggregate density and representative-glyph LOD; unsupported tokens are rejected rather than silently rendered as a default. Pattern geometry is presentation-only and cannot encode hidden scientific state.
- Demo snapshots must be explicitly tagged as visual-only and dimensionless; they are never evidence, calibration, or a scientific preset. Product/runtime surfaces must never substitute demo biology for missing authoritative state: demo rendering is explicit opt-in and visibly disclosed as not simulation data.
- Full motion may interpolate camera/presentation changes. Camera interpolation must be elapsed-time based and consume the shared Petra navigational motion token supplied by the app adapter; do not use frame-count-dependent blend constants. Reduced/off motion resolves to immediate/static presentation while preserving all scientific state.
- The interactive dish camera must remain keyboard-operable as well as pointer/touch-operable. Keyboard input may change camera presentation state only; it must never create or mutate simulation state.
- Direct pointer/touch manipulation is immediate camera presentation state: one active pointer pans only beyond overview; two active pointers pinch around their centroid and may translate with the centroid. Programmatic focus/wheel/keyboard navigation continues to use the shared camera transition policy. Touch gesture state must clear on pointer up/cancel and never leak into simulation state.
- Keep the adapter compatible with mock snapshots so visual work can proceed independently of worker integration. Authoritative browser wiring belongs to the runtime integration issue, not this subtree.
- Container resize is presentation scheduling: coalesce ResizeObserver bursts, resize the Pixi renderer before redrawing scene geometry, and preserve camera/semantic-zoom state across the resize.
- Pixi/WebGL initialization failure must be recoverable and visible: consume async creation rejections, destroy instances that resolve after disposal, expose an accessible retry state, and never substitute demo/scientific state to hide a graphics failure.

