# Renderer DOX contract

## Purpose

Presentation-only transformation of authoritative Petra simulation snapshots into a living Petri-dish view.

## Authority boundary

- Renderer code never owns biological truth and never mutates simulation state.
- Renderer inputs are immutable/read-only snapshots or view models derived from authoritative simulation output.
- Camera, interpolation, LOD, particles, shaders, contours, highlights, and animation are visual-only.
- A rendered glyph/particle is a **visual proxy** unless a feature explicitly proves one-to-one identity with a simulated entity. Never infer cell count from glyph count.
- Render interpolation may smooth between snapshots but must not feed interpolated values back into simulation commands or scientific metrics.
- Snapshot continuity lives in `src/render/visualInterpolation.ts`. Intermediate `DishPresentationFrame` values are explicitly presentation-only and intentionally omit authoritative snapshot/time/event identity. Compatible frames interpolate continuous biomass, field, and lineage-density channels only; grid/mask/sampling identity or field/lineage metadata incompatibility fails closed to an immediate authoritative snap. Lineage enter/exit may ease visual density to/from zero without inventing a genotype, mutation, or event. Full motion may rebase a new snapshot transition from the currently rendered presentation frame; Reduced/Off must collapse immediately to the exact authoritative target. The implementation reuses preallocated Float32 buffers during a transition to avoid per-frame object/array churn.
- Overlay legends must carry units/meaning supplied by the scenario/view model; rendering code must not invent scientific units.

## Semantic zoom

Use named semantic levels rather than raw camera scale as scientific meaning:

- `dish` — whole ecosystem, fields, colony silhouettes and interventions;
- `colony` — local lineages, sampled cell glyphs, contours and local state;
- `representative-cell` — explanatory illustration only, clearly labelled representative rather than microscopic truth.

Zoom thresholds are presentation policy. Crossing them may reveal/hide information but may not change the simulation.
- Renderer→adapter semantic zoom reporting uses the shared threshold observer and emits only the named `dish | colony | representative-cell` level when that name changes. Raw numeric zoom stays renderer-local; animation frames within one level must not churn React state, and the observer is disposed with the renderer.

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
- Camera gesture admission uses that exact circular aperture with an **inclusive rim**: every new pointer identity, wheel event, and double-click must start on/inside the visible dish. Once a pointer was admitted and captured from inside, its move stream may continue outside the rim until pointer-up/cancel so drag/pinch continuity is preserved; a second pointer that starts outside is not admitted.
- All dish-interior scientific/presentation marks (field overlays, lineage density, representative glyphs, and future intervention/selection previews) live under one circular Pixi data-container mask derived from that shared aperture. Vessel/rim/glass chrome remains outside the mask. Source `dishMask` is still biological/source occupancy truth; the Pixi mask is an additional presentation clip only. Representative-glyph candidate centers are culled to the exact visible normalized radius before budget ranking so knowingly invisible proxies cannot consume the bounded LOD budget.
- Render scalar/density arrays use normalized **cell-center** coordinates from `src/render/gridGeometry.ts`. Fields, density marks, representative glyphs, demo fixtures, and future grid selection adapters must consume that helper; endpoint mapping such as `column / (width - 1)` is not valid for these cell-centered arrays.
- Field overlays are rendered only from source-provided fields and retain source label/unit metadata in the surrounding UI; renderer code must not synthesize scientific units.
- `overlayPresentation.ts` is the single presentation authority for every runtime-validated `OverlayKind`. Pixi field transfer/color/texture and DOM legend semantics must consume that registry rather than branching independently. `net-growth` uses a zero-aware diverging presentation; `uncertainty` remains source-defined uncertainty and must never be relabelled as confidence. Visibility thresholds, alpha and texture are visual-only transforms and cannot rewrite source values, units, minimums, or maximums.
- Every `RenderField.id` is a non-empty unique presentation identity within one snapshot. Duplicate IDs are rejected before React/Pixi consumption; adapters must never silently rename, deduplicate, or rely on first-match overlay selection.
- Lineage identity uses both color and pattern/ring cues. Density marks and representative glyphs remain visual proxies.
- All `RenderLineage.density` channels in one `DishRenderSnapshot` share one comparable aggregate biomass/density scale. Aggregate lineage marks use one in-dish snapshot-wide presentation denominator; per-lineage self-normalization is forbidden because it can make rare lineages look dominant. Square-root compression, radius, and alpha are dimensionless presentation transforms only. Exact abundance remains authoritative analysis/inspector data. A future adapter that cannot guarantee shared scale must declare that explicitly rather than silently reusing this projection.
- Lineage hue comes from the strict versioned `appearanceToken` vocabulary, never from lineage array position. The same token must resolve to the same hue across snapshots/replays; hue is presentation-only reinforcement and cannot encode hidden scientific state.
- Lineage pattern identity is a strict renderer vocabulary, currently `solid-ring | double-ring`. Every supported token must produce distinct neutral geometry at aggregate density and representative-glyph LOD; unsupported tokens are rejected rather than silently rendered as a default. Pattern geometry is presentation-only and cannot encode hidden scientific state.
- Demo snapshots must be explicitly tagged as visual-only and dimensionless; they are never evidence, calibration, or a scientific preset. Product/runtime surfaces must never substitute demo biology for missing authoritative state: demo rendering is explicit opt-in and visibly disclosed as not simulation data.
- `PixiDish.tsx` is a consumer, not a demo-data factory. Its caller supplies one coherent snapshot plus an explicit render-source identity; the adapter rejects source/snapshot-presence mismatches rather than inferring authority from object shape. DOM controls and Pixi must receive the exact same resolved snapshot transaction.
- React adapters apply a render snapshot and its selected overlay as one coherent presentation transaction. Overlay validation targets the incoming snapshot; a previously valid selection that disappears clears without a stale frame, while a genuinely unknown incoming overlay remains an explicit error.
- Async Pixi renderer startup may cache latest React inputs in refs only from commit phase (layout/effect synchronization), never by mutating refs during render. An abandoned/speculative render must not become observable to `onReady`; once a commit lands, startup hydration must consume the latest committed motion, camera-motion, overlay, snapshot, and semantic-zoom callback.
- Full motion may interpolate camera/presentation changes. Camera interpolation must be elapsed-time based and consume the shared Petra navigational motion token supplied by the app adapter; do not use frame-count-dependent blend constants. Reduced/off motion resolves to immediate/static presentation while preserving all scientific state.
- Camera motion timing is live presentation policy, not renderer-construction state. The React adapter propagates the latest validated/copied `CameraMotionSpec` into an existing renderer (including after async initialization) without recreating WebGL or resetting camera identity. Equal specs are a no-op; an active Full transition rebases from the currently rendered camera when a nonzero spec changes, while a zero-duration update completes at the existing target. Reduced/Off policy updates never create spatial travel.
- The interactive dish camera must remain keyboard-operable as well as pointer/touch-operable. Keyboard input may change camera presentation state only; it must never create or mutate simulation state.
- Dish camera shortcuts own only unmodified camera/navigation keystrokes. Ctrl, Meta/Command, and Alt chords remain browser/OS authority and must not be prevented; Shift remains available so keyboard layouts that require Shift to type `+` retain zoom-in access.
- Direct pointer/touch manipulation is immediate camera presentation state: one active pointer pans only beyond overview; two active pointers pinch around their centroid and may translate with the centroid. One-pointer pan ownership is latched when the first pointer of a gesture is admitted: a gesture that starts at whole-dish overview remains browser/page-pan owned, while a gesture that starts zoomed remains Petra-owned until all pointers lift/cancel. Pinch is Petra-owned at either zoom. The renderer, not React, owns the host `touch-action` policy for the **next** gesture (`pan-x pan-y` at overview; `none` when zoomed) and restores the prior host style on destroy; changing `touch-action` mid-gesture must never be treated as retroactive ownership transfer. Petra only prevents default and settles an in-flight camera transition after an accepted gesture intent is confirmed as renderer-owned. Browser takeover through `pointercancel` must clear gesture ownership exactly like pointer-up. Wheel/double-click anchors resolve from visible pixels, and every retargeted animation starts from the rendered camera rather than an unseen destination. Wheel input must normalize DOM pixel/line/page delta modes through the shared presentation policy before computing zoom magnitude; device-specific raw `deltaY` units are not camera authority. Wheel input prevents browser default only when Petra can actually change its pending zoom target: further zoom-out at the minimum or zoom-in at the maximum chains to the browser/page, while reversing direction is immediately Petra-owned again. Scroll-chain ownership is decided from the pending target; focal anchoring still resolves from the currently rendered camera. Programmatic keyboard intent may accumulate on the pending target while rebasing its animation start from the rendered camera. Touch gesture state must clear on pointer up/cancel and never leak into simulation state.
- Keep the adapter compatible with mock snapshots so visual work can proceed independently of worker integration. Authoritative browser wiring belongs to the runtime integration issue, not this subtree.
- Container resize is presentation scheduling: coalesce ResizeObserver bursts, resize the Pixi renderer before redrawing scene geometry, and preserve camera/semantic-zoom state across the resize.
- Renderer backing resolution follows Petra's capped device-pixel-ratio policy (max 2). DPR changes are presentation-only: reconcile the mutable Pixi renderer resolution through a disposal-safe change watcher, reuse the existing coalesced resize/redraw scheduler, never poll every frame, and preserve camera/snapshot/semantic state.
- Pixi/WebGL initialization failure must be recoverable and visible: consume async creation rejections, destroy instances that resolve after disposal, expose an accessible retry state, and never substitute demo/scientific state to hide a graphics failure.
- Renderer startup/failure narration uses one stable mounted polite/atomic status region with status copy only. Interactive recovery controls such as Retry are ordinary focusable siblings outside the live-region subtree and may reference the visible failure explanation with `aria-describedby`; never make buttons/links descendants of the atomic renderer status region.
- Renderer recovery actions consume Petra's shared compact action interaction adapter with the current `full | reduced | off` presentation preference. Renderer-local fallback styling may own geometry/color, but hover/press/focus timing and easing stay in the shared UI motion policy.



## Replay / scrub presentation
- `src/render/replayPresentation.ts` projects an ordered history of authoritative `DishRenderSnapshot` keyframes into a deterministic dish presentation for a requested simulation-time position. Interactive adapters create one presenter per snapshot history so validation happens once and the active adjacent-keyframe transition reuses preallocated buffers. It never creates simulator events, checkpoints, commands, or scientific readouts.
- Exact keyframes remain authoritative. Values between compatible keyframes are explicitly `presentation-only` and reuse `visualInterpolation.ts` through normalized progress so replay output is independent of frame cadence.
- Replay history is a sequence of `AuthoritativeDishReplayKeyframe` records, not bare render snapshots. `replayIdentity.ts` owns the versioned order projection: one explicit `runBranchIdentity` plus the authoritative accepted mutating-command count supplied by runtime. Biological `simulationTimeHours` remains separate and may be equal across adjacent keyframes. Array position, snapshot-id lexicography, wall-clock arrival, and biological time are never substitute ordering authority.
- Within one `runBranchIdentity`, accepted-command order is strictly increasing and biological time is non-decreasing. Duplicate/regressing order, mixed branch scopes, duplicate snapshot IDs, or biological-time regression fail closed. Reset/replay/restore paths that begin a new history generation must use a new branch identity instead of splicing ancestry in the renderer.
- Direct scrubbing evaluates the accepted-command order axis. Exact recorded positions return exact authoritative snapshots; fractional positions are presentation-only interpolation between adjacent recorded keyframes. Same-time authoritative keyframes therefore remain individually addressable without mutating their biological timestamps.
- When interpolation is disabled or the visual-compatibility planner rejects a pair, replay snaps to the previous authoritative keyframe rather than showing future state early or fabricating a morph.


## Shared visual-token consumption
- Pixi vessel chrome and stable lineage appearance colors consume `src/design/visualTokens.ts`; renderer code must not grow a parallel electric/neon palette.
- Existing lineage `appearanceToken` IDs and schema identity remain stable across palette refinement. Color remains presentation reinforcement only and must continue to pair with lineage pattern geometry.
- `src/design/vectorPrimitives.ts` provides renderer-neutral normalized geometry for future organism/field/interaction adapters. A renderer may associate rod/bud/hyphal silhouettes with biology only when authoritative organism-kind evidence exists; color, array order, density, or lineage ID must never be used to guess the organism shape.
