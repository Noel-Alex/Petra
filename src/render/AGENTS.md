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
- All dish-interior scientific/presentation marks (field overlays, lineage density, representative glyphs, and future intervention/selection previews) live under one circular Pixi data-container mask derived from that shared aperture. Vessel/rim/glass chrome remains outside the mask. Source `dishMask` is still biological/source occupancy truth; the Pixi mask is an additional presentation clip only. Representative-glyph candidate centers are culled to the exact visible normalized radius before budget ranking so knowingly invisible proxies cannot consume the bounded LOD budget.
- Render scalar/density arrays use normalized **cell-center** coordinates from `src/render/gridGeometry.ts`. Fields, density marks, representative glyphs, demo fixtures, and future grid selection adapters must consume that helper; endpoint mapping such as `column / (width - 1)` is not valid for these cell-centered arrays.
- Field overlays are rendered only from source-provided fields and retain source label/unit metadata in the surrounding UI; renderer code must not synthesize scientific units.
- Overlay presentation policy is centralized in `src/render/overlayPresentation.ts`. Every runtime `OverlayKind` must have an explicit transfer function, palette, non-color texture, alpha range, visibility threshold, and legend scale; unknown/new kinds fail closed rather than inheriting another field's style.
- Signed `net-growth` uses a zero-aware diverging transfer. Negative, neutral, and positive values keep source numeric meaning while receiving distinct presentation polarity; uncertainty remains labelled source-defined uncertainty and must never be silently renamed confidence.
- Pixi field cells and the DOM legend consume the same overlay registry. Texture modulation is presentation-only and may not change source values, min/max bounds, units, biological thresholds, or runtime authority.
- Lineage identity uses both color and pattern/ring cues. Density marks and representative glyphs remain visual proxies.
- All `RenderLineage.density` channels in one `DishRenderSnapshot` share one comparable aggregate biomass/density scale. Aggregate lineage marks use one in-dish snapshot-wide presentation denominator; per-lineage self-normalization is forbidden because it can make rare lineages look dominant. Square-root compression, radius, and alpha are dimensionless presentation transforms only. Exact abundance remains authoritative analysis/inspector data. A future adapter that cannot guarantee shared scale must declare that explicitly rather than silently reusing this projection.
- Lineage hue comes from the strict versioned `appearanceToken` vocabulary, never from lineage array position. The same token must resolve to the same hue across snapshots/replays; hue is presentation-only reinforcement and cannot encode hidden scientific state.
- Lineage pattern identity is a strict renderer vocabulary, currently `solid-ring | double-ring`. Every supported token must produce distinct neutral geometry at aggregate density and representative-glyph LOD; unsupported tokens are rejected rather than silently rendered as a default. Pattern geometry is presentation-only and cannot encode hidden scientific state.
- Demo snapshots must be explicitly tagged as visual-only and dimensionless; they are never evidence, calibration, or a scientific preset. Product/runtime surfaces must never substitute demo biology for missing authoritative state: demo rendering is explicit opt-in and visibly disclosed as not simulation data.
- React adapters apply a render snapshot and its selected overlay as one coherent presentation transaction. Overlay validation targets the incoming snapshot; a previously valid selection that disappears clears without a stale frame, while a genuinely unknown incoming overlay remains an explicit error.
- Full motion may interpolate camera/presentation changes. Camera interpolation must be elapsed-time based and consume the shared Petra navigational motion token supplied by the app adapter; do not use frame-count-dependent blend constants. Reduced/off motion resolves to immediate/static presentation while preserving all scientific state.
- Camera motion timing is live presentation policy, not renderer-construction state. The React adapter propagates the latest validated/copied `CameraMotionSpec` into an existing renderer (including after async initialization) without recreating WebGL or resetting camera identity. Equal specs are a no-op; an active Full transition rebases from the currently rendered camera when a nonzero spec changes, while a zero-duration update completes at the existing target. Reduced/Off policy updates never create spatial travel.
- The interactive dish camera must remain keyboard-operable as well as pointer/touch-operable. Keyboard input may change camera presentation state only; it must never create or mutate simulation state.
- Direct pointer/touch manipulation is immediate camera presentation state: one active pointer pans only beyond overview; two active pointers pinch around their centroid and may translate with the centroid. New pointer/touch input cancels any in-flight camera transition at the **currently rendered** camera; wheel/double-click anchors resolve from visible pixels, and every retargeted animation starts from the rendered camera rather than an unseen destination. Wheel input must normalize DOM pixel/line/page delta modes through the shared presentation policy before computing zoom magnitude; device-specific raw `deltaY` units are not camera authority. Programmatic keyboard intent may accumulate on the pending target while rebasing its animation start from the rendered camera. Touch gesture state must clear on pointer up/cancel and never leak into simulation state.
- Keep the adapter compatible with mock snapshots so visual work can proceed independently of worker integration. Authoritative browser wiring belongs to the runtime integration issue, not this subtree.
- Container resize is presentation scheduling: coalesce ResizeObserver bursts, resize the Pixi renderer before redrawing scene geometry, and preserve camera/semantic-zoom state across the resize.
- Renderer backing resolution follows Petra's capped device-pixel-ratio policy (max 2). DPR changes are presentation-only: reconcile the mutable Pixi renderer resolution through a disposal-safe change watcher, reuse the existing coalesced resize/redraw scheduler, never poll every frame, and preserve camera/snapshot/semantic state.
- Pixi/WebGL initialization failure must be recoverable and visible: consume async creation rejections, destroy instances that resolve after disposal, expose an accessible retry state, and never substitute demo/scientific state to hide a graphics failure.

