import { validateRenderSnapshot, type DishRenderSnapshot } from "../render/model";
import type {
  ComposedSimulationSnapshot,
  RunIdentity,
  SimulationSnapshot,
} from "../sim/protocol";
import type { AspergillusNo10SurfaceCheckpoint } from "../sim/fungi/aspergillusNo10Surface";
import {
  projectAspergillusNo10SurfaceFrontForRender,
  type FungalSurfaceFrontRenderProjection,
} from "./fungalSurfaceRenderProjection";

export const DISH_SCENE_TRANSACTION_SCHEMA_VERSION = 1 as const;

export interface DishSceneAcceptedRuntimeIdentity {
  readonly runIdentity: RunIdentity;
  readonly runBranchIdentity: string;
  readonly traceHash: string;
  readonly tick: number;
  readonly acceptedCommandCount: number;
  readonly biologicalTimeHours: number;
}

export interface ComposedRuntimeDishSceneTransaction {
  readonly schemaVersion: typeof DISH_SCENE_TRANSACTION_SCHEMA_VERSION;
  readonly authorityMode: "composed-runtime";
  readonly acceptedRuntime: DishSceneAcceptedRuntimeIdentity;
  /**
   * Reuses the already-detached DishRenderSnapshot by reference. This wrapper
   * must not copy O(grid cells) payload merely to add transaction metadata.
   */
  readonly dish: DishRenderSnapshot;
  readonly fungalSourceValidation: null;
}

export interface FungalSourceValidationDishSceneTransaction {
  readonly schemaVersion: typeof DISH_SCENE_TRANSACTION_SCHEMA_VERSION;
  readonly authorityMode: "fungal-source-validation";
  /**
   * Standalone source-validation data has no accepted runtime position.
   * Numerical biological-time equality is intentionally insufficient to make
   * it part of a composed runtime transaction.
   */
  readonly acceptedRuntime: null;
  readonly dish: null;
  readonly fungalSourceValidation: FungalSurfaceFrontRenderProjection;
}

export type DishSceneTransaction =
  | ComposedRuntimeDishSceneTransaction
  | FungalSourceValidationDishSceneTransaction;

export interface ComposedRuntimeDishSceneSource {
  readonly snapshot: SimulationSnapshot;
  readonly runBranchIdentity: string;
  readonly dish: DishRenderSnapshot;
}

export interface FungalSourceValidationDishSceneSource {
  readonly checkpoint: AspergillusNo10SurfaceCheckpoint;
}

export interface DishSceneTransactionInput {
  readonly composedRuntime?: ComposedRuntimeDishSceneSource | null;
  readonly fungalSourceValidation?: FungalSourceValidationDishSceneSource | null;
}

/**
 * Build exactly one renderer-safe scientific scene source.
 *
 * Schema v1 deliberately has no mixed-live mode. A standalone fungal
 * source-validation checkpoint cannot be joined to a live composed dish merely
 * because both happen to report the same biological time. A future mixed-live
 * schema requires #615 to put fungal state under the same accepted runtime
 * transaction/checkpoint authority first.
 */
export function createDishSceneTransaction(
  input: DishSceneTransactionInput,
): DishSceneTransaction {
  const composedRuntime = input.composedRuntime ?? null;
  const fungalSourceValidation = input.fungalSourceValidation ?? null;

  if (
    (composedRuntime === null && fungalSourceValidation === null) ||
    (composedRuntime !== null && fungalSourceValidation !== null)
  ) {
    throw new Error(
      "dish scene schema v1 requires exactly one scientific authority source",
    );
  }

  if (composedRuntime !== null) {
    return createComposedRuntimeDishScene(composedRuntime);
  }

  const fungalFront = projectAspergillusNo10SurfaceFrontForRender(
    fungalSourceValidation!.checkpoint,
  );
  return Object.freeze({
    schemaVersion: DISH_SCENE_TRANSACTION_SCHEMA_VERSION,
    authorityMode: "fungal-source-validation",
    acceptedRuntime: null,
    dish: null,
    fungalSourceValidation: fungalFront,
  });
}

function createComposedRuntimeDishScene(
  source: ComposedRuntimeDishSceneSource,
): ComposedRuntimeDishSceneTransaction {
  const snapshot = requireComposedSnapshot(source.snapshot);
  assertCanonicalIdentity("runBranchIdentity", source.runBranchIdentity);
  assertCanonicalIdentity("snapshot trace hash", snapshot.traceHash);
  assertNonNegativeSafeInteger("checkpoint tick", snapshot.checkpoint.tick);
  assertNonNegativeSafeInteger(
    "accepted command count",
    snapshot.checkpoint.commandCount,
  );
  assertFiniteNonNegative(
    "checkpoint biological time",
    snapshot.checkpoint.simulationTimeHours,
  );

  validateRenderSnapshot(source.dish);

  const expectedSnapshotId = `composed-trace:${snapshot.traceHash}`;
  if (source.dish.snapshotId !== expectedSnapshotId) {
    throw new Error(
      "composed-runtime dish scene requires the dish projection from the exact runtime snapshot trace",
    );
  }

  const expectedSamplingIdentity = `runtime-branch:${source.runBranchIdentity}`;
  if (source.dish.samplingIdentity !== expectedSamplingIdentity) {
    throw new Error(
      "composed-runtime dish scene requires the exact runtime branch sampling identity",
    );
  }

  if (
    source.dish.simulationTimeHours !==
    snapshot.checkpoint.simulationTimeHours
  ) {
    throw new Error(
      "composed-runtime dish scene biological time must match the accepted runtime snapshot",
    );
  }

  const acceptedRuntime = Object.freeze({
    runIdentity: structuredClone(snapshot.checkpoint.identity),
    runBranchIdentity: source.runBranchIdentity,
    traceHash: snapshot.traceHash,
    tick: snapshot.checkpoint.tick,
    acceptedCommandCount: snapshot.checkpoint.commandCount,
    biologicalTimeHours: snapshot.checkpoint.simulationTimeHours,
  });

  return Object.freeze({
    schemaVersion: DISH_SCENE_TRANSACTION_SCHEMA_VERSION,
    authorityMode: "composed-runtime",
    acceptedRuntime,
    dish: source.dish,
    fungalSourceValidation: null,
  });
}

function requireComposedSnapshot(
  snapshot: SimulationSnapshot,
): ComposedSimulationSnapshot {
  if (snapshot.checkpoint.authority !== "composed") {
    throw new Error(
      "composed-runtime dish scene requires composed simulation authority",
    );
  }
  return snapshot;
}

function assertCanonicalIdentity(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name} must be a non-empty canonical string`);
  }
}

function assertNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
