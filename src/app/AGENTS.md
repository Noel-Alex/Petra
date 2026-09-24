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

## Runtime rules
- Do not emit the next queued request until the active request receives its expected authoritative response.
- Correlate command snapshots/errors by command id; never accept a stale/mismatched snapshot as current state.
- Initialization is complete only after a ready response.
- Worker/runtime errors must become visible/recoverable UI state, not indefinite spinners.
- A snapshot whose run identity does not match active controls is foreign state: do not render/advance it, pause playback, and require an explicit reset/reinitialization path.
- Dispose workers/listeners when the owning app/runtime is torn down.

## Coordination
- #37 may evolve the composed simulation snapshot/protocol. Keep the browser session generic over WorkerRequest/WorkerResponse so product integration can follow protocol changes without moving biology into React.
- #39 owns persisted motion preference and onboarding shell presentation.
- #42 owns the worker/session/control/timeline integration seam.

## Verification
Framework-neutral worker-session behavior requires deterministic tests with a fake port. Real browser Worker startup/responsiveness is a separate manual/local evidence gate; Petra has no hosted CI by project policy.
