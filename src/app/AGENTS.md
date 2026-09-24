# Application shell DOX contract

## Purpose
Own React/browser orchestration around Petra's authoritative worker and presentation layers.

## Authority boundary
- React never mutates biological state directly. It issues typed worker requests and renders immutable snapshots/events.
- workerSession.ts owns browser Worker lifecycle, serialized request delivery, command correlation, pending/error state, and disposal; it does not own simulation equations or scientific interpretation.
- Keep src/sim/** and src/worker/** independent from React. Active simulation-composition work belongs to #37.
- UI control planning stays in src/ui/experimentControls.ts; app adapters execute its ControlEffect rather than duplicating replay/reset/seed semantics.
- experimentRuntime.ts composes control intent, WorkerSession state, authoritative command confirmation, and timeline projection. Commands become replay history only after a returned authoritative event confirms their command id.
- `ExperimentRuntime` may own one immutable caller-supplied `ComposedSimulationConfig` for the run. Start/reset/reseed/replay must clone and resend that same configuration so lifecycle actions cannot demote a biological run to the synthetic fixture path. React does not derive or edit the config.
- Intervention tooling fails closed unless the active protocol exposes a real typed intervention schema plus authoritative parameter metadata. The current `synthetic-pulse` command is never an inoculate/antibiotic/nutrient substitute. Labels, units, ranges, defaults, and command conversion must come from authoritative scenario/runtime contracts; presentation previews never imply command acceptance, and timeline success remains authoritative-event-driven. Region inspection is a separate #159 authority path and must not be hidden inside the intervention palette.
- Scientific timeline presentation stays in src/ui/timeline.ts.
- Renderer/Pixi scene authority stays under src/render/**.
- `DishViewport.tsx` may choose/display source-provided render overlays and units, but it must not derive scientific units or fabricate authoritative snapshots. Product/runtime use defaults to a neutral waiting-for-authority state when no valid `DishRenderSnapshot` exists. The renderer demo fixture is allowed only through an explicit visual-development opt-in and must remain visibly labelled visual-only; missing authority must never auto-enable it.
- `overlayLegend.ts` projects the renderer-owned overlay presentation registry into DOM text/pattern metadata while preserving the field's authoritative label, unit, minimum, and maximum. Do not create a parallel app-only overlay color/meaning table; signed net growth and source-defined uncertainty must stay semantically identical between Pixi and the legend.
- Overlay legend accessibility uses one stable mounted `aria-live="polite"` + `aria-atomic="true"` container. Overlay changes update its visible text in place; Full-motion reveal may remount only an inner visual wrapper so animation identity never becomes live-region identity. Do not add a second hidden announcer for the same overlay change.
- `dishPresentation.ts` owns presentation selection identity for field overlays. `automatic`, explicit `none`, and a specific `field` are distinct states; never overload `null` to mean both automatic and no overlay. Explicit none survives snapshot updates. If a specifically selected field disappears, reconcile the persisted selection to automatic so a later field reappearance cannot silently resurrect stale user intent. Keep one selection authority; do not reintroduce a parallel overlay-selection module.
- Dish camera controls are presentation-only. The visible overview/reset action sends a declarative reset request into the renderer rather than storing Pixi objects in app state.
- Escape is single-consumer presentation input. Editable/already-prevented controls have first refusal without invoking dish/tool callbacks. Higher-priority shell/tool handlers that return consumed stop the event before camera reset or ancestor handling. Dish overview is the fallback presentation owner only; it must not override intervention cancellation or synthesize worker commands.
- `flagshipProvenance.ts` is presentation-only: it may attach labels/value text to the versioned flagship scenario, including the selected engineering execution profile and baseline composed parameter set, but scenario identity, evidence classes, citation keys, transfer notes, limitations, and assumptions must come from authoritative scenario records. It must never infer a parameter set from a runtime snapshot or relabel engineering model-unit records as measured science. The Sources drawer must visibly distinguish this curated flagship evidence set from the current runtime's active scenario until #37 supplies authoritative scenario identity.
- Sources is a non-modal disclosure, not a focus trap. While requested open, unconsumed Escape on the Petra app keyboard path may close it outside editable controls; close intent restores focus to the stable Sources trigger immediately. `aria-expanded` tracks **requested visibility**, while Full-motion exit may keep the drawer mounted only for the shared `planSurfaceTransition({ action: "hide" })` presentation wall-time. An exiting drawer is `aria-hidden` + inert so focus cannot re-enter it. Reduced/Off unmount immediately; reopen/preference changes/unmount must cancel stale exit timers. Exit completion is presentation-only and may never emit simulator/scientific commands.
- Sources drawer responsive geometry is CSS authority in `sourcesDrawer.css`. Do not put `inset`, `width`, `max-height`, or other breakpoint-owned layout geometry back into React inline styles, because inline specificity defeats the narrow-screen media query. React may still project runtime motion custom properties at the app boundary.

## Runtime rules
- Do not emit the next queued request until the active request receives its expected authoritative response.
- Correlate command snapshots/errors by command id; never accept a stale/mismatched snapshot as current state.
- Initialization is complete only after a ready response.
- Worker/runtime errors must become visible/recoverable UI state, not indefinite spinners.
- Browser worker transport failures are terminal request outcomes: both `error` and `messageerror` must reach `WorkerSession`, clear active/queued work through the single failure path, retain the active command id when the failed request is a command, and leave initialization failures uncorrelated. `messageerror` uses a stable payload-free diagnostic, and every subscribed Worker event listener must be removed on teardown.
- Runtime request phase and spoken product status are separate presentation channels: `runtimeView.status` / `workerPhase` may change for visible ready/pending treatment, while `statusText` in the polite runtime live region must stay stable across ordinary continuous-playback ready ↔ pending churn. Errors retain alert semantics and their explicit error text.
- A snapshot whose run identity does not match active controls is foreign state: do not render/advance it, pause playback, and require an explicit reset/reinitialization path.
- Dispose workers/listeners when the owning app/runtime is torn down.

## Coordination
- #37 may evolve the composed simulation snapshot/protocol. Keep the browser session generic over WorkerRequest/WorkerResponse so product integration can follow protocol changes without moving biology into React.
- #39 owns persisted motion preference and onboarding shell presentation. App code must use the shared MotionSetting load/save/parse/resolve helpers; storage failure degrades to in-memory preference rather than breaking controls.
- Judge-facing native Motion and dish-overlay selectors keep a `2.75rem` minimum block size (44px at Petra's default root size). They remain native selects; the dish-overlay selector also preserves `min-width: 0` so narrow renderer chrome can shrink without inventing a fixed-width control.
- `onboardingRuntime.ts` is the only app-layer bridge from runtime state into canonical onboarding `ScientificGate` values. Events from protocol-v4 **synthetic fixture authority** satisfy no causal onboarding gates; event-type coverage remains exhaustive so new composed/product evidence requires an explicit gate/no-gate review rather than a silent fallback.
- Onboarding navigation is presentation-only. Changing run identity, or dropping a previously seen authoritative snapshot during reset/replay reinitialization, resets the controlled guide; Back/Continue/Skip never dispatch worker commands or manufacture simulator evidence.
- #42 owns the worker/session/control/timeline integration seam.
- React runtime adapters receive an injected `ExperimentRuntimeFactory`. The factory must return a **fresh idle runtime per effect lifetime** so StrictMode cleanup/remount cannot reuse a disposed WorkerSession.
- The default app has no runtime factory and must remain visibly unavailable/disabled rather than silently instantiating the synthetic worker scaffold as product authority.
- The React playback scheduler runs at 20 Hz wall-clock cadence as orchestration policy only; playback speed changes authoritative ticks requested per pulse, never the scientific meaning/duration of a tick.
- App-level playback shortcuts operate only from non-interactive surfaces through `appKeyboard.ts`; focused native/ARIA controls retain their own keyboard semantics, and child surfaces may consume Escape before App. App dispatches only typed experiment-control actions and prevents browser default only after the runtime accepts the action. Visible Play/Pause and speed controls expose the same Space / 1 / 2 / 3 shortcuts through `aria-keyshortcuts`.
- ARIA `role` values used for global-shortcut shielding are token lists, not one opaque string: normalize/split fallback tokens and block when any recognized interactive role is present; unknown tokens alone do not make a presentation surface interactive.
- Global shortcuts must also pass the same runtime availability gates as the visible controls: disabled Play/speed states cannot be bypassed by Space or 1/2/3, step requires authoritative `ready`, and global Escape dispatches pause only while playback is running (including pending-running state). Unavailable shortcuts must not suppress normal browser behavior.

- Dish-first focus mode is presentation-only and resolved by `dishFocusMode.ts` from explicit runtime playback intent. It must stay stable across ordinary ready ↔ pending worker cadence so request traffic cannot pump layout. Focus mode may visually recede/collapse chrome, but intervention controls, inspector content, timeline controls, and keyboard/accessibility semantics remain mounted/reachable; errors/unavailable/stopped playback return to ambient hierarchy. CSS consumes only the coarse `data-dish-focus` identity and shared panel motion variables—never biological values or worker timing.

## Verification
Framework-neutral worker-session behavior requires deterministic tests with a fake port. Real browser Worker startup/responsiveness is a separate manual/local evidence gate; Petra has no hosted CI by project policy.

## Semantic motion adapters
- React shell panels and dish overlay chrome consume `src/ui/motion/semanticTransitions.ts`; do not derive competing durations/easings directly in components.
- `src/app/motionAdapter.ts` is the thin CSS projection layer for framework-neutral surface plans.
- App-shell panel motion custom properties fail static (`0ms` + non-semantic easing) when React projection is absent; only the resolved adapter may opt panels/drawers into active transition timing/easing.
- Representative-cell semantic zoom must remain visibly labelled illustrative/explanatory and never be described as literal microscopy or a finer simulation scale.
- Dish-hero ambient motion is decorative presentation only. The shell consumes `resolveDishAmbient()`: Full may loop subtle transform/opacity ambience from the named `MOTION.dishAmbient` token; Reduced/Off retain static halo depth with no loop. Ambient rhythm must never imply growth, diffusion, biological pulse rate, or simulation speed.
- Semantic zoom guidance may explain renderer meaning, but it must not infer current scientific state from camera position unless the renderer explicitly reports a presentation-only semantic level.
- The live semantic guide consumes only renderer-reported named levels. Exactly one entry is marked current; raw camera zoom never enters React state. Full motion may use shared semantic-transition emphasis, Reduced remains non-spatial, and Off is instant/static. The guide is not a live-region feed, so camera animation frames never become announcement spam.


## Authoritative historical-state inspection
- `historicalState.ts` owns the framework-neutral exact historical checkpoint index for replay/scrub. One history may contain only composed snapshots from one exact `RunIdentity` and one explicit `runBranchIdentity`, ordered by strictly increasing accepted `commandCount` with non-decreasing biological time.
- Exact recorded positions return an authoritative checkpoint clone. Positions between recorded checkpoints return only authoritative lower/upper bounds plus a normalized presentation cursor; they are explicitly `presentation-only` and must never be relabelled as an interpolated biological state.
- Historical inspection never mutates the live runtime. Resuming from a past checkpoint requires explicit replay/fork semantics; a scrub cursor is not a hidden worker restore.
- Dish/charts/inspector adapters should key all historical projections from the same resolved authoritative checkpoint/bounds so a displayed time label cannot drift from the state being inspected.

## Timeline history presentation
- The compact footer may emphasize recent authoritative events, but every event exposed by `ExperimentRuntime` must remain inspectable in original order.
- `TimelineHistory.tsx` is presentation-only: it may reveal/hide history but must not reorder, summarize away, synthesize, pause, or mutate runtime events.
- Complete-history rows preserve sequence, tick, simulation time, and command identity supplied by `TimelineEntry`; opening history never creates scientific state.
- New events must not auto-open history, steal focus, or force-scroll a user away from an older record they are inspecting.
- TimelineHistory is static inspection context, not an event-arrival live region. Generic event counts remain visible text only; `CausalNarrationMount` is the sole bounded scientific-event announcement owner, so the recent/full-history threshold cannot create or destroy narration authority.
- Native details/scroll behavior deliberately keeps Full/Reduced/Off information-equivalent without introducing a second motion authority.
- The focusable complete-history scroll region has local first refusal for Space: stop propagation before the App playback shortcut, but never prevent Space's native browser scrolling default. Do not generalize this into blocking every `role="region"`; the dish and other presentation regions retain their own input contracts.

## Dish camera motion adapter
- `DishViewport.tsx` must project camera travel through `dishCameraMotion.ts`; it must not manufacture a Full-motion camera spec independently of the resolved user preference.
- `CameraMotionSpec` describes spatial interpolation only: Full may use the named `MOTION.cameraFocus` travel token, while Reduced/Off request zero camera travel and keep their distinct semantics through the renderer motion mode / surrounding presentation.
- Generic camera travel policy is not semantic-view identity. Do not pretend every pan, focus, or overview reset is a dish→colony transition just to reuse semantic-zoom labels.

## Dish visual continuity motion adapter
- `DishViewport.tsx` projects generic live snapshot continuity through `dishVisualMotion.ts`; Pixi must receive that explicit `DishVisualMotionSpec` and must not fall back to renderer-local timing constants.
- Full continuity consumes the named `MOTION.fieldShift` token through `resolveMotion()`. Reduced/Off keep the pre-existing immediate authoritative-snapshot behavior; no hidden crossfade or spatial travel is added.
- Generic snapshot deltas are not semantic biological evidence. The adapter must not call a growth/division/diffusion phase merely because pixels changed; evidence-gated named phases remain owned by `src/ui/motion/dishVocabulary.ts`.

## Authoritative analysis injection
- `analysisView.ts` is the app-facing trust boundary for chart/ancestry records. It accepts explicit unit-bearing `ScientificSeriesInput` + `LineageAncestryInput` records and projects them only through the existing analysis helpers.
- The protocol-v4 **synthetic fixture authority branch** is not eligible analysis authority. Do not adapt `syntheticPopulation`, renderer density/glyphs, demo snapshots, or visual interpolation into this contract to make the panel look populated.
- `AnalysisSurface.tsx` remains secondary/collapsed when data is available so the living dish stays the primary world; absent records render a visible unavailable state rather than fixture data.
- Analysis records carry explicit run/state identity + simulation time. No source sample or lineage lifecycle record may claim a biological time later than its bound authoritative state.
- When #37/#42 supplies product-facing composed analysis records, the runtime composition layer must project this contract from the same active composed run/branch rather than teaching React how to infer scientific data.

## Authoritative causal narration bridge
- `CausalNarrationMount.tsx` keeps exactly one stable `CausalAnnouncementRegion` mounted in the product shell. Missing authority clears/keeps that region silent; it must never unmount/remount per event.
- `causalNarration.ts` is the app trust boundary for already-authoritative `CausalEventKind` streams. Events supplied by protocol-v4 **synthetic fixture authority** are not eligible causal science and must never be relabeled into scientific meaning. Do not classify a lifecycle event as synthetic from its name alone: composed authority may also emit generic `initialized`, `advanced`, or `restored` events, and causal narration still requires the explicit authoritative causal-stream contract.
- A supplied causal stream carries exact `RunIdentity` plus an explicit `runBranchIdentity`. The run identity must match the active runtime before any event is narrated; stale/foreign streams are ignored without advancing the cursor.
- Within one `runBranchIdentity`, causal history is append-only. The app adapter stores an exact replay-relevant identity for the already accepted prefix and rejects replacement/truncation of that prefix instead of silently continuing from the old narration cursor.
- Temporary absence of the causal stream is an explicit silent presentation state, not evidence that history reset. Preserve the accepted cursor/prefix while the stream is absent or foreign; do not run supplied-stream continuity validation against an empty placeholder. When same-branch authority returns, #501/#508 append-only validation resumes against the preserved prefix before narration may continue.
- React revision detection covers every current `CausalEventBurstItem` authority field (`sequence`, `id`, `eventKind`) across the full supplied stream, so same-length/same-frontier rewrites still re-enter validation. This presentation-side scan is deterministic and O(n) in causal-history length; replace it only when runtime authority supplies an explicit collision-resistant rolling history identity with equivalent semantics.
- The caller/runtime authority must change `runBranchIdentity` for a fresh run/branch generation (including a reset that restarts event sequence under otherwise identical run fields). That change explicitly resets the narration cursor.
- Narration stores the planner's returned sequence + event-id cursor per active stream identity. React rerenders may clear the live-region text but must not replay already accepted events.
- #37/#42 should eventually supply this stream from the composed authoritative runtime. Until that capability exists, the default product remains correctly silent rather than adapting timeline labels, Pixi state, animation cues, or wall-clock timing.


## Dish render-source transaction
- `DishViewport.tsx` owns one `DishRenderSourceState` per mounted dish surface and resolves authoritative / visual-demo / awaiting presentation through `dishRenderSource.ts`.
- The resolved `DishRenderSource.snapshot` object is the single transaction consumed by DOM overlay controls/legend and `PixiDish`; adapters must not call the demo fixture factory independently.
- Render-source cache transitions are committed through React state/effect only after a render is accepted. The render body may compute a pure candidate resolution, but it must not write refs or external mutable cache state; abandoned/speculative renders cannot change the mounted transaction.
- Demo snapshot factories used during candidate resolution must remain deterministic and side-effect free for the same explicit demo configuration. They are presentation factories, never a place for RNG progression, network work, persistent mutation, or scientific authority.
- Source identity is explicit and separate from snapshot shape. Passing a demo-shaped `DishRenderSnapshot` through props must never cause it to be relabelled authoritative.
- Authoritative state always takes precedence and must not invoke demo generation. Visual-demo state remains explicit opt-in, visibly disclosed, and presentation-only.


## Authoritative dish replay keyframe bridge
- `dishReplayKeyframe.ts` is the narrow app-layer bridge between worker/runtime authority and renderer replay history. It may bind an already-authoritative `DishRenderSnapshot` to runtime identity; it may not derive biology from renderer state.
- Replay order is sourced from `SimulationCheckpoint.commandCount`, the current versioned worker protocol's accepted mutating-command position. The bridge copies it into the versioned renderer replay-order contract and requires exact equality between runtime checkpoint `simulationTimeHours` and the dish projection's biological timestamp.
- `runBranchIdentity` is explicit caller/runtime authority. A reset, replay, restore branch, or other history generation that can restart/regress accepted-command position must receive a fresh branch identity; React/Pixi must never infer branch ancestry from array order, snapshot IDs, arrival time, or presentation state.
- Snapshot-only observations that do not advance `commandCount` are not distinct replay positions. If callers attempt to append two different keyframes with the same order identity, renderer replay validation must reject the history rather than inventing an ordering.


## Shared visual theme
- `visualTheme.css` is a late-loaded presentation theme that consumes CSS variables installed from `src/design/visualTokens.ts`; it must not become a second hard-coded Petra palette.
- Theme overrides may change color, border, elevation, and quiet depth, but must not own layout, simulation state, scientific semantics, or intervention capability. Keep issue-specific layout/interaction styles in their owning modules.
- App-owned supporting surfaces such as `analysisSurface.css` consume the same `--petra-color-*` / `--petra-rgb-*` projection instead of defining local cyan/white/glass palettes. Token migration must preserve native disclosure, focus, touch, responsive, and available/unavailable semantics; the wrapper never reinterprets scientific analysis identity or values.
- Browser startup installs shared visual variables before React mounts so DOM chrome and Pixi can consume one token authority. Core text/accent pairs are regression-tested for WCAG AA contrast; critical science still needs non-color cues.

## Localized placement integration
- `App.tsx` owns active intervention-placement presentation state. It may keep previews alive through transient `pending` runtime requests, but clears them when runtime authority is unavailable, starting, or failed.
- Active placement gets first refusal on Escape, including while a range input is focused; cancellation precedes dish-camera reset and never sends worker traffic.
- `DishViewport.tsx` recenters to whole-dish overview when a placement tool becomes active so the DOM/SVG target and Pixi viewport share a stable coordinate projection during targeting.
- `InterventionPlacementOverlay.tsx` consumes `src/render/pixi/camera.ts` aperture geometry rather than repeating dish diameter assumptions. Pointer/touch outside the circular aperture is ignored.
- Tool buttons may enable **placement preview** in ready/pending runtime states even while `InterventionCapabilityView.available` remains false. A visible disabled Apply gate and explanatory copy preserve that distinction until #37/#158 provides authoritative intervention schema/metadata.
- Placement colors consume the shared Petra visual-token CSS variables locally; #458 does not own or fork the central visual theme.


## Sources drawer visual-theme ownership
- `sourcesDrawer.css` owns responsive drawer geometry and consumes shared Petra `--petra-color-*` / `--petra-rgb-*` variables for stable chrome. Do not introduce a drawer-local numeric hex/RGB/RGBA palette or blur-heavy glass treatment.
- Theme work must preserve the non-modal disclosure contract, requested-visible vs exiting lifecycle, Escape/focus-restoration behavior, inert exit state, overscroll containment, and shared `--panel-motion-*` timing authority.
- Provenance/source identity and evidence semantics remain upstream authority; the drawer palette may reinforce hierarchy but must never imply source quality or scientific confidence.

## Recovery hardening
- `runtimeRecovery.ts` owns bounded user-facing failure categories for preset, protocol, model, runtime, and presentation failures. Raw diagnostics may remain available to tests/logging but must never be rendered directly into the expo UI.
- Product/science runtime factories that depend on scenario/preset validation must use the prevalidated runtime-factory seam (or an equivalent validate-before-construction contract). Failed validation must occur before `ExperimentRuntime` / `WorkerSession` construction so no partial authoritative run exists.
- Runtime recovery is explicit. A failed live runtime may be restarted only through a fresh factory result with the exact same run identity/seed; a changed identity is rejected. The current restart path is a fresh authoritative runtime, not an implied checkpoint resume, and the UI must say so.
- Last-valid snapshot/timeline evidence may remain visible while a runtime is failed, because it is explicitly historical. Starting recovery clears that stale runtime binding before new authority arrives; never relabel prior evidence as current.
- `AppErrorBoundary.tsx` is presentation containment only. It must not manufacture simulator state, swallow typed worker/runtime failures that already have a recovery path, or expose raw stacks/payloads. Its reload action is explicit and warns that unsaved run state may be lost.


## Timeline History visual-theme ownership
- `timelineHistory.css` owns disclosure/history layout but consumes Petra's shared `--petra-color-*` / `--petra-rgb-*` variables for stable chrome. Do not restore a timeline-local numeric cyan/white/blue-grey palette.
- Theme changes must preserve native `details/summary` behavior, the 2.75rem summary touch floor, focus visibility, bounded history scrolling, responsive stacking, authoritative event order/content, and supplied simulation timestamps.
- Hover/background color is non-essential presentation reinforcement only. Timeline meaning, chronology, and playback authority must remain understandable without it, and this stylesheet must not introduce independent motion timing.


## Scenario discovery and Science Mode
- `scenarioDiscovery.ts` is the product-facing scenario catalog boundary. It consumes `evaluateScienceModeAdmission(...)` directly so bundled/parseable/runnable scenarios cannot bypass the science admission contract.
- Experimental packs may remain discoverable with explicit refusal reasons, but grounded Science Mode selectors must use `listGroundedScienceModeScenarios()` (or the same admission result) rather than filtering on display status, filename, or runtime availability.
- The current flagship remains a research/experimental pack for grounded physical Science Mode while its limiting-resource context is UNBOUND and its ecology execution profile is engineering/model-unit only. This does not prevent truthful mechanistic research/demo execution under its existing warnings.
