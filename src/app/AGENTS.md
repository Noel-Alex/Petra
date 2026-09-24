# Application shell DOX contract

## Purpose
Own React/browser orchestration around Petra's authoritative worker and presentation layers.

## Authority boundary
- React never mutates biological state directly. It issues typed worker requests and renders immutable snapshots/events.
- workerSession.ts owns browser Worker lifecycle, serialized request delivery, command correlation, pending/error state, and disposal; it does not own simulation equations or scientific interpretation.
- Keep src/sim/** and src/worker/** independent from React. Active simulation-composition work belongs to #37.
- UI control planning stays in src/ui/experimentControls.ts; app adapters execute its ControlEffect rather than duplicating replay/reset/seed semantics.
- experimentRuntime.ts composes control intent, WorkerSession state, authoritative command confirmation, and timeline projection. Commands become replay history only after a returned authoritative event confirms their command id.
- Intervention tooling fails closed unless the active protocol exposes a real typed intervention schema plus authoritative parameter metadata. The current `synthetic-pulse` command is never an inoculate/antibiotic/nutrient substitute. Labels, units, ranges, defaults, and command conversion must come from authoritative scenario/runtime contracts; presentation previews never imply command acceptance, and timeline success remains authoritative-event-driven. Region inspection is a separate #159 authority path and must not be hidden inside the intervention palette.
- Scientific timeline presentation stays in src/ui/timeline.ts.
- Renderer/Pixi scene authority stays under src/render/**.
- `DishViewport.tsx` may choose/display source-provided render overlays and units, but it must not derive scientific units or fabricate authoritative snapshots. Product/runtime use defaults to a neutral waiting-for-authority state when no valid `DishRenderSnapshot` exists. The renderer demo fixture is allowed only through an explicit visual-development opt-in and must remain visibly labelled visual-only; missing authority must never auto-enable it.
- `overlayLegend.ts` projects the renderer-owned overlay presentation registry into DOM text/pattern metadata while preserving the field's authoritative label, unit, minimum, and maximum. Do not create a parallel app-only overlay color/meaning table; signed net growth and source-defined uncertainty must stay semantically identical between Pixi and the legend.
- Overlay legend accessibility uses one stable mounted `aria-live="polite"` + `aria-atomic="true"` container. Overlay changes update its visible text in place; Full-motion reveal may remount only an inner visual wrapper so animation identity never becomes live-region identity. Do not add a second hidden announcer for the same overlay change.
- `dishPresentation.ts` owns presentation selection identity for field overlays. `automatic`, explicit `none`, and a specific `field` are distinct states; never overload `null` to mean both automatic and no overlay. Explicit none survives snapshot updates. If a specifically selected field disappears, reconcile the persisted selection to automatic so a later field reappearance cannot silently resurrect stale user intent. Keep one selection authority; do not reintroduce a parallel overlay-selection module.
- Dish camera controls are presentation-only. The visible overview/reset action sends a declarative reset request into the renderer rather than storing Pixi objects in app state.
- Escape is single-consumer presentation input. Editable/already-prevented controls have first refusal without invoking dish/tool callbacks. Higher-priority shell/tool handlers that return consumed stop the event before camera reset or ancestor handling. Dish overview is the fallback presentation owner only; it must not override intervention cancellation or synthesize worker commands.
- `flagshipProvenance.ts` is presentation-only: it may attach labels/value text to the versioned flagship scenario, but scenario identity, evidence classes, citation keys, transfer notes, limitations, and assumptions must come from authoritative scenario records. The Sources drawer must visibly distinguish this curated flagship evidence set from the current runtime's active scenario until #37 supplies authoritative scenario identity.
- Sources is a non-modal disclosure, not a focus trap. While requested open, unconsumed Escape on the Petra app keyboard path may close it outside editable controls; close intent restores focus to the stable Sources trigger immediately. `aria-expanded` tracks **requested visibility**, while Full-motion exit may keep the drawer mounted only for the shared `planSurfaceTransition({ action: "hide" })` presentation wall-time. An exiting drawer is `aria-hidden` + inert so focus cannot re-enter it. Reduced/Off unmount immediately; reopen/preference changes/unmount must cancel stale exit timers. Exit completion is presentation-only and may never emit simulator/scientific commands.
- Sources drawer responsive geometry is CSS authority in `sourcesDrawer.css`. Do not put `inset`, `width`, `max-height`, or other breakpoint-owned layout geometry back into React inline styles, because inline specificity defeats the narrow-screen media query. React may still project runtime motion custom properties at the app boundary.

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
- `onboardingRuntime.ts` is the only app-layer bridge from runtime state into canonical onboarding `ScientificGate` values. Current synthetic protocol events satisfy **no** causal gates; event-type coverage is exhaustive so protocol expansion requires an explicit gate/no-gate review rather than a silent fallback.
- Onboarding navigation is presentation-only. Changing run identity, or dropping a previously seen authoritative snapshot during reset/replay reinitialization, resets the controlled guide; Back/Continue/Skip never dispatch worker commands or manufacture simulator evidence.
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
- Dish-hero ambient motion is decorative presentation only. The shell consumes `resolveDishAmbient()`: Full may loop subtle transform/opacity ambience from the named `MOTION.dishAmbient` token; Reduced/Off retain static halo depth with no loop. Ambient rhythm must never imply growth, diffusion, biological pulse rate, or simulation speed.
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

## Authoritative analysis injection
- `analysisView.ts` is the app-facing trust boundary for chart/ancestry records. It accepts explicit unit-bearing `ScientificSeriesInput` + `LineageAncestryInput` records and projects them only through the existing analysis helpers.
- The current synthetic worker protocol is **not** eligible analysis authority. Do not adapt `syntheticPopulation`, renderer density/glyphs, demo snapshots, or visual interpolation into this contract to make the panel look populated.
- `AnalysisSurface.tsx` remains secondary/collapsed when data is available so the living dish stays the primary world; absent records render a visible unavailable state rather than fixture data.
- Analysis records carry explicit run/state identity + simulation time. No source sample or lineage lifecycle record may claim a biological time later than its bound authoritative state.
- When #37/#42 exposes real composed analysis records, the runtime composition layer must supply this contract from the same active run/branch rather than teaching React how to infer scientific data.

