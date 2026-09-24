# Application shell DOX contract

## Purpose
Own React/browser orchestration around Petra's authoritative worker and presentation layers.

## Authority boundary
- React never mutates biological state directly. It issues typed worker requests and renders immutable snapshots/events.
- workerSession.ts owns browser Worker lifecycle, serialized request delivery, command correlation, pending/error state, and disposal; it does not own simulation equations or scientific interpretation.
- Keep src/sim/** and src/worker/** independent from React. Active simulation-composition work belongs to #37.
- UI control planning stays in src/ui/experimentControls.ts; app adapters execute its ControlEffect rather than duplicating replay/reset/seed semantics.
- experimentRuntime.ts composes control intent, WorkerSession state, authoritative command confirmation, and timeline projection. Commands become replay history only after a returned authoritative event confirms their command id.
- Scientific timeline presentation stays in src/ui/timeline.ts.
- Renderer/Pixi scene authority stays under src/render/**.
- `DishViewport.tsx` may choose/display source-provided render overlays and units, but it must not derive scientific units or fabricate authoritative snapshots. Until #42/#37 supplies a valid `DishRenderSnapshot`, the renderer demo fixture must remain visibly labelled visual-only.
- Dish camera controls are presentation-only. The visible overview/reset action sends a declarative reset request into the renderer rather than storing Pixi objects in app state.
- Escape inside the dish may reset camera overview only after active-tool, default-prevented, and editable-control paths have had first refusal; it must not override intervention cancellation or synthesize worker commands.
- `flagshipProvenance.ts` is presentation-only: it may attach labels/value text to the versioned flagship scenario, but scenario identity, evidence classes, citation keys, transfer notes, limitations, and assumptions must come from authoritative scenario records. The Sources drawer must visibly distinguish this curated flagship evidence set from the current runtime's active scenario until #37 supplies authoritative scenario identity.

## Runtime rules
- Do not emit the next queued request until the active request receives its expected authoritative response.
- Correlate command snapshots/errors by command id; never accept a stale/mismatched snapshot as current state.
- Initialization is complete only after a ready response.
- Worker/runtime errors must become visible/recoverable UI state, not indefinite spinners.
- A snapshot whose run identity does not match active controls is foreign state: do not render/advance it, pause playback, and require an explicit reset/reinitialization path.
- Dispose workers/listeners when the owning app/runtime is torn down.

## Coordination
- #37 may evolve the composed simulation snapshot/protocol. Keep the browser session generic over WorkerRequest/WorkerResponse so product integration can follow protocol changes without moving biology into React.
- #39 owns persisted motion preference and onboarding shell presentation. App code must use the shared MotionSetting load/save/parse/resolve helpers; storage failure degrades to in-memory preference rather than breaking controls.
- #42 owns the worker/session/control/timeline integration seam.
- React runtime adapters receive an injected `ExperimentRuntimeFactory`. The factory must return a **fresh idle runtime per effect lifetime** so StrictMode cleanup/remount cannot reuse a disposed WorkerSession.
- The default app has no runtime factory and must remain visibly unavailable/disabled rather than silently instantiating the synthetic worker scaffold as product authority.
- The React playback scheduler runs at 20 Hz wall-clock cadence as orchestration policy only; playback speed changes authoritative ticks requested per pulse, never the scientific meaning/duration of a tick.

## Verification
Framework-neutral worker-session behavior requires deterministic tests with a fake port. Real browser Worker startup/responsiveness is a separate manual/local evidence gate; Petra has no hosted CI by project policy.

## Semantic motion adapters
- React shell panels and dish overlay chrome consume `src/ui/motion/semanticTransitions.ts`; do not derive competing durations/easings directly in components.
- `src/app/motionAdapter.ts` is the thin CSS projection layer for framework-neutral surface plans.
- Representative-cell semantic zoom must remain visibly labelled illustrative/explanatory and never be described as literal microscopy or a finer simulation scale.
- Semantic zoom guidance may explain renderer meaning, but it must not infer current scientific state from camera position unless the renderer explicitly reports a presentation-only semantic level.


## Timeline history presentation
- The compact footer may emphasize recent authoritative events, but every event exposed by `ExperimentRuntime` must remain inspectable in original order.
- `TimelineHistory.tsx` is presentation-only: it may reveal/hide history but must not reorder, summarize away, synthesize, pause, or mutate runtime events.
- Complete-history rows preserve sequence, tick, simulation time, and command identity supplied by `TimelineEntry`; opening history never creates scientific state.
- New events must not auto-open history, steal focus, or force-scroll a user away from an older record they are inspecting.
- Native details/scroll behavior deliberately keeps Full/Reduced/Off information-equivalent without introducing a second motion authority.

## Dish camera motion adapter
- `DishViewport.tsx` must project camera travel through `dishCameraMotion.ts`; it must not manufacture a Full-motion camera spec independently of the resolved user preference.
- `CameraMotionSpec` describes spatial interpolation only: Full may use the named `MOTION.cameraFocus` travel token, while Reduced/Off request zero camera travel and keep their distinct semantics through the renderer motion mode / surrounding presentation.
- Generic camera travel policy is not semantic-view identity. Do not pretend every pan, focus, or overview reset is a dish→colony transition just to reuse semantic-zoom labels.
