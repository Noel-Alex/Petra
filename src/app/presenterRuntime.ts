import type { DemoEvidenceGate, DemoPresenterEvent, DemoPresenterState } from "../ui/demo/presenter";
import {
  initialDemoPresenterState,
  reduceDemoPresenter,
} from "../ui/demo/presenter";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import type { FlagshipScenarioIdentity } from "./flagshipProvenance";
import { runIdentityKey } from "./runIdentityKey";

export interface PresenterRuntimeProjection {
  readonly runIdentityKey: string | null;
  readonly hasAuthoritativeSnapshot: boolean;
  readonly gates: readonly DemoEvidenceGate[];
  readonly revisionKey: string;
}

export interface PresenterRuntimeSession {
  readonly runIdentityKey: string | null;
  readonly hasSeenAuthoritativeSnapshot: boolean;
  readonly state: DemoPresenterState;
}

export type PresenterUserEvent = Exclude<
  DemoPresenterEvent,
  { readonly type: "bind-run" } | { readonly type: "evidence" }
>;

/**
 * Honest runtime-to-presenter evidence projection.
 *
 * The current synthetic protocol can prove only that an exact flagship run has
 * returned an authoritative snapshot. It cannot prove growth, antibiotic
 * intervention, selection, replay equivalence, provenance resolution, compare
 * ancestry, fitness trade-offs, or spatial contingency. Those gates remain
 * blocked until their owning authoritative adapters exist.
 */
export function projectPresenterRuntime(
  runtime: ExperimentRuntimeState | null,
  flagship: Pick<FlagshipScenarioIdentity, "id" | "version">,
): PresenterRuntimeProjection {
  const key =
    runtime === null ? null : runIdentityKey(runtime.controls.identity);
  const snapshotIdentityKey =
    runtime?.snapshot === null || runtime?.snapshot === undefined
      ? null
      : runIdentityKey(runtime.snapshot.checkpoint.identity);
  const hasAuthoritativeSnapshot =
    runtime !== null &&
    runtime.snapshot !== null &&
    runtime.integrationError === null &&
    runtime.worker.phase !== "error" &&
    runtime.worker.phase !== "disposed" &&
    snapshotIdentityKey === key;

  const isExactFlagship =
    runtime !== null &&
    runtime.controls.identity.scenarioId === flagship.id &&
    runtime.controls.identity.scenarioVersion === flagship.version;

  const gates: DemoEvidenceGate[] = [];
  if (hasAuthoritativeSnapshot && isExactFlagship) {
    gates.push("flagship-runtime-ready");
  }

  return {
    runIdentityKey: key,
    hasAuthoritativeSnapshot,
    gates,
    revisionKey: JSON.stringify([key, hasAuthoritativeSnapshot, gates]),
  };
}

export function createPresenterRuntimeSession(
  projection: PresenterRuntimeProjection,
): PresenterRuntimeSession {
  return {
    runIdentityKey: projection.runIdentityKey,
    hasSeenAuthoritativeSnapshot: projection.hasAuthoritativeSnapshot,
    state: initialDemoPresenterState(
      "90-second",
      projection.runIdentityKey,
    ),
  };
}

/**
 * Synchronize Presenter Mode to current runtime authority without granting the
 * presenter any command authority.
 *
 * A changed run identity clears all progress/evidence through bind-run. A
 * snapshot drop after authority was seen also clears progress for same-identity
 * reset/replay reinitialization, preventing stale evidence from surviving.
 */
export function reconcilePresenterRuntimeSession(
  session: PresenterRuntimeSession,
  projection: PresenterRuntimeProjection,
): PresenterRuntimeSession {
  let state = session.state;
  let hasSeenAuthoritativeSnapshot = session.hasSeenAuthoritativeSnapshot;
  let changed = false;

  if (session.runIdentityKey !== projection.runIdentityKey) {
    state =
      projection.runIdentityKey === null
        ? initialDemoPresenterState(state.profile, null)
        : reduceDemoPresenter(state, {
            type: "bind-run",
            runIdentity: projection.runIdentityKey,
          });
    hasSeenAuthoritativeSnapshot = projection.hasAuthoritativeSnapshot;
    changed = true;
  } else if (
    session.hasSeenAuthoritativeSnapshot &&
    !projection.hasAuthoritativeSnapshot
  ) {
    state = initialDemoPresenterState(state.profile, projection.runIdentityKey);
    hasSeenAuthoritativeSnapshot = false;
    changed = true;
  } else if (
    !session.hasSeenAuthoritativeSnapshot &&
    projection.hasAuthoritativeSnapshot
  ) {
    hasSeenAuthoritativeSnapshot = true;
    changed = true;
  }

  if (projection.runIdentityKey !== null) {
    for (const gate of projection.gates) {
      if (state.satisfiedGates.has(gate)) continue;
      state = reduceDemoPresenter(state, {
        type: "evidence",
        gate,
        runIdentity: projection.runIdentityKey,
      });
      changed = true;
    }
  }

  if (!changed) return session;

  return {
    runIdentityKey: projection.runIdentityKey,
    hasSeenAuthoritativeSnapshot,
    state,
  };
}

export function applyPresenterUserEvent(
  session: PresenterRuntimeSession,
  projection: PresenterRuntimeProjection,
  event: PresenterUserEvent,
): PresenterRuntimeSession {
  const synchronized = reconcilePresenterRuntimeSession(session, projection);
  return {
    ...synchronized,
    state: reduceDemoPresenter(synchronized.state, event),
  };
}
