import type { AuthoritativeDishReplayKeyframe } from "../render/replayIdentity";
import type { ComposedSimulationSnapshot } from "../sim/protocol";
import {
  projectAuthoritativeComposedDishSnapshot,
  type ComposedDishOrganismPresentationAuthority,
} from "./composedDishProjection";
import { createRuntimeDishReplayKeyframe } from "./dishReplayKeyframe";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import {
  AUTHORITATIVE_HISTORY_SCHEMA_VERSION,
  type AuthoritativeHistoryKeyframe,
} from "./historicalState";

export interface RuntimeHistoricalKeyframeTransaction {
  readonly scientific: AuthoritativeHistoryKeyframe;
  readonly dish: AuthoritativeDishReplayKeyframe;
}

export interface CreateRuntimeHistoricalKeyframeTransactionArgs {
  readonly runtimeState: ExperimentRuntimeState;
  readonly organismPresentationAuthority?: ComposedDishOrganismPresentationAuthority | null;
}

/**
 * Capture one accepted composed runtime transaction for historical presentation.
 *
 * The scientific snapshot is detached once, then the dish projection is derived
 * from that exact detached authority inside this call. Callers never provide a
 * separately-created render snapshot, so equal biological time cannot be used
 * to accidentally pair different traces or runtime branches.
 *
 * This helper deliberately does not choose when or how many transactions to
 * retain. Publication cadence and history retention remain evidence-gated.
 */
export function createRuntimeHistoricalKeyframeTransaction(
  args: CreateRuntimeHistoricalKeyframeTransactionArgs,
): RuntimeHistoricalKeyframeTransaction {
  const acceptedSnapshot = args.runtimeState.snapshot;
  if (acceptedSnapshot?.checkpoint.authority !== "composed") {
    throw new Error(
      "runtime historical keyframe transaction requires composed simulation authority",
    );
  }

  const snapshot = structuredClone(
    acceptedSnapshot,
  ) as ComposedSimulationSnapshot;
  const runBranchIdentity = args.runtimeState.runBranchIdentity;

  const dishSnapshot = projectAuthoritativeComposedDishSnapshot(
    snapshot,
    runBranchIdentity,
    args.runtimeState.ecologyObservation,
    args.organismPresentationAuthority ?? null,
  );

  const runtimeStateForCapturedSnapshot: ExperimentRuntimeState = {
    ...args.runtimeState,
    snapshot,
  };
  const dish = createRuntimeDishReplayKeyframe({
    runtimeState: runtimeStateForCapturedSnapshot,
    dishSnapshot,
  });

  const scientific: AuthoritativeHistoryKeyframe = Object.freeze({
    schemaVersion: AUTHORITATIVE_HISTORY_SCHEMA_VERSION,
    runBranchIdentity,
    snapshot,
  });

  return Object.freeze({
    scientific,
    dish,
  });
}
