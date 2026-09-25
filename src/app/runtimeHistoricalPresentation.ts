import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "../render/model";
import {
  createDishReplayPresenter,
  type DishReplayPresenter,
} from "../render/replayPresentation";
import type { ComposedSimulationSnapshot } from "../sim/protocol";
import { projectAuthoritativeComposedDishSnapshot } from "./composedDishProjection";
import type { HistoricalPresentationFrame } from "./historicalPresentation";
import {
  unavailableRegionInspector,
  type RegionInspectorPresentationState,
} from "../ui/regionInspectorState";
import { createAuthoritativeDishReplayKeyframe } from "./dishReplayKeyframe";
import {
  AUTHORITATIVE_HISTORY_SCHEMA_VERSION,
  createAuthoritativeHistoryIndex,
  type AuthoritativeHistoryIndex,
  type AuthoritativeHistoryKeyframe,
} from "./historicalState";

export interface RuntimeHistoricalPresentationView {
  readonly history: AuthoritativeHistoryIndex;
  readonly dishPresenter: DishReplayPresenter;
  readonly keyframeCount: number;
  readonly latestCommandCount: number;
  readonly latestDishSnapshot: DishRenderSnapshot;
}

/**
 * Append-only product history for one ExperimentRuntime branch.
 *
 * The only input is an authoritative composed snapshot. Dish render data is
 * derived inside this boundary from that exact snapshot + runtime branch id, so
 * callers cannot pair scientific state from one accepted position with render
 * data from another. The stored history is inspection-only and never dispatches
 * Worker commands, restores checkpoints, or mutates live authority.
 */
export class RuntimeHistoricalPresentationHistory {
  readonly runBranchIdentity: string;

  private readonly simulationKeyframes: AuthoritativeHistoryKeyframe[] = [];
  private readonly dishKeyframes: ReturnType<
    typeof createAuthoritativeDishReplayKeyframe
  >[] = [];

  constructor(runBranchIdentity: string) {
    this.runBranchIdentity = requireCanonicalText(
      "runtime historical presentation branch identity",
      runBranchIdentity,
    );
  }

  append(snapshot: ComposedSimulationSnapshot): boolean {
    const checkpoint = snapshot.checkpoint;
    if (checkpoint.authority !== "composed") {
      throw new Error(
        "runtime historical presentation history requires composed authority",
      );
    }
    if (
      !Number.isSafeInteger(checkpoint.commandCount) ||
      checkpoint.commandCount < 0
    ) {
      throw new RangeError(
        "runtime historical presentation commandCount must be a non-negative safe integer",
      );
    }
    if (
      !Number.isFinite(checkpoint.simulationTimeHours) ||
      checkpoint.simulationTimeHours < 0
    ) {
      throw new RangeError(
        "runtime historical presentation biological time must be finite and non-negative",
      );
    }
    requireCanonicalText(
      "runtime historical presentation trace hash",
      snapshot.traceHash,
    );

    const previous =
      this.simulationKeyframes[this.simulationKeyframes.length - 1] ?? null;
    if (previous !== null) {
      const previousCheckpoint = previous.snapshot.checkpoint;
      if (checkpoint.commandCount < previousCheckpoint.commandCount) {
        throw new Error(
          "runtime historical presentation history cannot move backward in accepted command position",
        );
      }
      if (checkpoint.commandCount === previousCheckpoint.commandCount) {
        if (snapshot.traceHash !== previous.snapshot.traceHash) {
          throw new Error(
            "runtime historical presentation history detected a conflicting snapshot at the same accepted command position",
          );
        }
        return false;
      }
      if (
        checkpoint.simulationTimeHours <
        previousCheckpoint.simulationTimeHours
      ) {
        throw new Error(
          "runtime historical presentation history cannot move backward in biological time",
        );
      }
    }

    const storedSnapshot = structuredClone(snapshot);
    const dishSnapshot = projectAuthoritativeComposedDishSnapshot(
      storedSnapshot,
      this.runBranchIdentity,
    );
    const historyKeyframe: AuthoritativeHistoryKeyframe = {
      schemaVersion: AUTHORITATIVE_HISTORY_SCHEMA_VERSION,
      runBranchIdentity: this.runBranchIdentity,
      snapshot: storedSnapshot,
    };
    const dishKeyframe = createAuthoritativeDishReplayKeyframe({
      runBranchIdentity: this.runBranchIdentity,
      simulationSnapshot: storedSnapshot,
      dishSnapshot,
    });

    // Validate the full candidate history before committing either side of the
    // pair. This reuses the canonical run/branch/order identity contract.
    createAuthoritativeHistoryIndex([
      ...this.simulationKeyframes,
      historyKeyframe,
    ]);

    this.simulationKeyframes.push(historyKeyframe);
    this.dishKeyframes.push(dishKeyframe);
    return true;
  }

  view(): RuntimeHistoricalPresentationView | null {
    if (this.simulationKeyframes.length === 0) return null;

    const history = createAuthoritativeHistoryIndex(
      this.simulationKeyframes,
    );
    const dishPresenter = createDishReplayPresenter(this.dishKeyframes);
    const latestSimulation =
      this.simulationKeyframes[this.simulationKeyframes.length - 1]!;
    const latestDish = this.dishKeyframes[this.dishKeyframes.length - 1]!;

    return Object.freeze({
      history,
      dishPresenter,
      keyframeCount: this.simulationKeyframes.length,
      latestCommandCount:
        latestSimulation.snapshot.checkpoint.commandCount,
      latestDishSnapshot: structuredClone(latestDish.snapshot),
    });
  }
}

/**
 * Historical App rendering requests `snap-to-authority` so DishViewport always
 * receives an immutable authoritative DishRenderSnapshot. The surrounding
 * HistoricalPresentationFrame still retains presentation-only cursor semantics
 * when the requested command position lies between recorded checkpoints.
 */
export function historicalDishSnapshot(
  frame: HistoricalPresentationFrame,
): DishRenderSnapshot {
  const state = frame.dish.state;
  if ("frameKind" in state) {
    throw new Error(
      "historical dish snapshot requires snap-to-authority presentation",
    );
  }
  validateRenderSnapshot(state);
  return structuredClone(state);
}

export function historicalRegionInspectorState(
  frame: HistoricalPresentationFrame,
  hasSelection: boolean,
): RegionInspectorPresentationState {
  if (!hasSelection) {
    return unavailableRegionInspector(
      "Select a point on the dish to inspect authoritative historical state.",
    );
  }
  if (frame.kind !== "authoritative" || frame.regionInspection === null) {
    return unavailableRegionInspector(
      "Scientific region inspection is unavailable between authoritative historical checkpoints.",
    );
  }
  return {
    status: "ready",
    selectionId: frame.regionInspection.selectionId,
    readout: structuredClone(frame.regionInspection),
  };
}

export function historicalSimulationTimeLabel(
  frame: HistoricalPresentationFrame,
): string {
  if (frame.time.kind === "authoritative") {
    return `Simulation time ${frame.time.simulationTimeHours.toFixed(2)} h · historical`;
  }
  return `Simulation time ${frame.time.lowerSimulationTimeHours.toFixed(2)}–${frame.time.upperSimulationTimeHours.toFixed(2)} h · presentation only`;
}

function requireCanonicalText(name: string, value: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be a canonical non-empty string`);
  }
  return value;
}
