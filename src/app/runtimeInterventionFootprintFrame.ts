import {
  projectAcceptedInterventionFootprint,
  type AcceptedInterventionFootprint,
} from "../render/acceptedInterventionFootprint";
import {
  DISH_REPLAY_ORDER_VERSION,
  validateDishReplayOrder,
} from "../render/replayIdentity";
import type { RunIdentity, SimulationSnapshot } from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";
import { createRunBranchIdentity } from "./runBranchIdentity";

export const RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION =
  "petra-runtime-intervention-footprints/1" as const;

export interface RuntimeInterventionFootprintFrame {
  readonly version: typeof RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION;
  readonly runIdentity: RunIdentity;
  readonly runBranchIdentity: string;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly acceptedCommandCount: number;
  readonly traceHash: string;
  readonly footprints: readonly AcceptedInterventionFootprint[];
}

/**
 * Bind accepted intervention geometry to the exact authoritative runtime
 * history generation and checkpoint frontier that supplied it.
 *
 * This is presentation identity only. It never estimates intervention effect,
 * reconstructs geometry, or becomes checkpoint/replay authority.
 */
export function createRuntimeInterventionFootprintFrame(
  runtimeState: ExperimentRuntimeState,
): RuntimeInterventionFootprintFrame | null {
  const snapshot = runtimeState.snapshot;
  if (snapshot === null) return null;

  assertRuntimeSnapshotIdentity(runtimeState.controls.identity, snapshot);

  const checkpoint = snapshot.checkpoint;
  validateDishReplayOrder({
    version: DISH_REPLAY_ORDER_VERSION,
    runBranchIdentity: runtimeState.runBranchIdentity,
    acceptedCommandCount: checkpoint.commandCount,
  });

  if (snapshot.traceHash.length === 0 || snapshot.traceHash.trim() !== snapshot.traceHash) {
    throw new TypeError("runtime intervention footprint frame requires a canonical traceHash");
  }
  if (!Number.isSafeInteger(checkpoint.tick) || checkpoint.tick < 0) {
    throw new RangeError("runtime intervention footprint frame tick must be a non-negative safe integer");
  }
  if (!Number.isFinite(checkpoint.simulationTimeHours) || checkpoint.simulationTimeHours < 0) {
    throw new RangeError("runtime intervention footprint frame biological time must be finite and non-negative");
  }

  let previousSequence = -1;
  const footprints: AcceptedInterventionFootprint[] = [];
  for (const event of snapshot.events) {
    if (!Number.isSafeInteger(event.sequence) || event.sequence < 0) {
      throw new RangeError("runtime intervention event sequence must be a non-negative safe integer");
    }
    if (event.sequence <= previousSequence) {
      throw new RangeError("runtime intervention event history must be strictly sequence ordered");
    }
    previousSequence = event.sequence;

    if (!Number.isSafeInteger(event.tick) || event.tick < 0 || event.tick > checkpoint.tick) {
      throw new RangeError("runtime intervention event lies beyond the checkpoint tick frontier");
    }
    if (
      !Number.isFinite(event.simulationTimeHours) ||
      event.simulationTimeHours < 0 ||
      event.simulationTimeHours > checkpoint.simulationTimeHours
    ) {
      throw new RangeError("runtime intervention event lies beyond the checkpoint biological-time frontier");
    }

    const footprint = projectAcceptedInterventionFootprint(event);
    if (footprint !== null) footprints.push(footprint);
  }

  return Object.freeze({
    version: RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION,
    runIdentity: structuredClone(checkpoint.identity),
    runBranchIdentity: runtimeState.runBranchIdentity,
    tick: checkpoint.tick,
    simulationTimeHours: checkpoint.simulationTimeHours,
    acceptedCommandCount: checkpoint.commandCount,
    traceHash: snapshot.traceHash,
    footprints: Object.freeze(footprints.map((footprint) => structuredClone(footprint))),
  });
}

function assertRuntimeSnapshotIdentity(
  activeIdentity: RunIdentity,
  snapshot: SimulationSnapshot,
): void {
  if (
    createRunBranchIdentity(activeIdentity, 0) !==
    createRunBranchIdentity(snapshot.checkpoint.identity, 0)
  ) {
    throw new Error(
      "runtime intervention footprint frame snapshot identity does not match active controls",
    );
  }
}
