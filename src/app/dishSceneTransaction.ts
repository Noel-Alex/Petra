import type { FungalSurfaceFrontRenderProjection } from "./fungalSurfaceRenderProjection";
import {
  FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
  FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
} from "./fungalSurfaceRenderProjection";
import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "../render/model";

export const DISH_SCENE_TRANSACTION_SCHEMA_VERSION = 1 as const;

export type DishSceneAuthorityMode =
  | "composed-runtime"
  | "fungal-source-validation";

export interface ComposedRuntimeDishSceneTransaction {
  readonly schemaVersion: typeof DISH_SCENE_TRANSACTION_SCHEMA_VERSION;
  readonly authorityMode: "composed-runtime";
  readonly biologicalTimeHours: number;
  /**
   * Already-detached renderer snapshot. The transaction intentionally reuses
   * the same buffers rather than introducing another O(grid) copy.
   */
  readonly composedRuntime: DishRenderSnapshot;
  readonly fungalSourceValidation: null;
}

export interface FungalSourceValidationDishSceneTransaction {
  readonly schemaVersion: typeof DISH_SCENE_TRANSACTION_SCHEMA_VERSION;
  readonly authorityMode: "fungal-source-validation";
  readonly biologicalTimeHours: number;
  readonly composedRuntime: null;
  /**
   * Exact source-validation front. This is physical-front authority only, not
   * biomass/density/resource/network authority.
   */
  readonly fungalSourceValidation: FungalSurfaceFrontRenderProjection;
}

export type DishSceneTransaction =
  | ComposedRuntimeDishSceneTransaction
  | FungalSourceValidationDishSceneTransaction;

export interface DishSceneSources {
  readonly composedRuntime?: DishRenderSnapshot | null;
  readonly fungalSourceValidation?: FungalSurfaceFrontRenderProjection | null;
}

/**
 * Creates one explicit scientific presentation transaction.
 *
 * V1 deliberately admits exactly one authority family. Equal biological time
 * is not a join key: a standalone fungal source-validation projection may not
 * be combined with a live composed runtime snapshot until both are emitted by
 * the same authoritative runtime transaction under a separately reviewed
 * mixed-live contract.
 */
export function createDishSceneTransaction(
  sources: DishSceneSources,
): DishSceneTransaction {
  const composedRuntime = sources.composedRuntime ?? null;
  const fungalSourceValidation = sources.fungalSourceValidation ?? null;

  if (composedRuntime !== null && fungalSourceValidation !== null) {
    throw new Error(
      "dish scene transaction v1 refuses simultaneous composed-runtime and standalone fungal-source-validation authority",
    );
  }
  if (composedRuntime === null && fungalSourceValidation === null) {
    throw new Error(
      "dish scene transaction requires exactly one authoritative source",
    );
  }

  if (composedRuntime !== null) {
    validateRenderSnapshot(composedRuntime);
    return Object.freeze({
      schemaVersion: DISH_SCENE_TRANSACTION_SCHEMA_VERSION,
      authorityMode: "composed-runtime",
      biologicalTimeHours: composedRuntime.simulationTimeHours,
      composedRuntime,
      fungalSourceValidation: null,
    });
  }

  validateFungalSurfaceFrontProjection(fungalSourceValidation!);
  return Object.freeze({
    schemaVersion: DISH_SCENE_TRANSACTION_SCHEMA_VERSION,
    authorityMode: "fungal-source-validation",
    biologicalTimeHours: fungalSourceValidation!.biologicalTimeHours,
    composedRuntime: null,
    fungalSourceValidation: fungalSourceValidation!,
  });
}

export function validateDishSceneTransaction(
  transaction: DishSceneTransaction,
): void {
  if (
    transaction.schemaVersion !== DISH_SCENE_TRANSACTION_SCHEMA_VERSION
  ) {
    throw new RangeError(
      `unsupported dish scene transaction schema version: ${String(transaction.schemaVersion)}`,
    );
  }

  if (transaction.authorityMode === "composed-runtime") {
    if (
      transaction.composedRuntime === null ||
      transaction.fungalSourceValidation !== null
    ) {
      throw new Error(
        "composed-runtime dish scene transaction requires only composed runtime authority",
      );
    }
    validateRenderSnapshot(transaction.composedRuntime);
    if (
      transaction.biologicalTimeHours !==
      transaction.composedRuntime.simulationTimeHours
    ) {
      throw new Error(
        "composed-runtime dish scene biological time must match its render snapshot",
      );
    }
    return;
  }

  if (transaction.authorityMode === "fungal-source-validation") {
    if (
      transaction.composedRuntime !== null ||
      transaction.fungalSourceValidation === null
    ) {
      throw new Error(
        "fungal-source-validation dish scene transaction requires only fungal front authority",
      );
    }
    validateFungalSurfaceFrontProjection(
      transaction.fungalSourceValidation,
    );
    if (
      transaction.biologicalTimeHours !==
      transaction.fungalSourceValidation.biologicalTimeHours
    ) {
      throw new Error(
        "fungal-source-validation dish scene biological time must match its source projection",
      );
    }
    return;
  }

  const unsupportedMode: never = transaction;
  throw new RangeError(
    `unsupported dish scene authority mode: ${String(unsupportedMode)}`,
  );
}

function validateFungalSurfaceFrontProjection(
  projection: FungalSurfaceFrontRenderProjection,
): void {
  if (
    projection.schemaVersion !==
    FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION
  ) {
    throw new RangeError(
      `unsupported fungal surface-front projection schema version: ${String(projection.schemaVersion)}`,
    );
  }
  if (projection.authority !== "source-validation-front") {
    throw new Error(
      "fungal surface-front projection must retain source-validation-front authority",
    );
  }
  if (projection.geometryKind !== "central-point-radial-front") {
    throw new Error(
      "fungal surface-front projection must retain central-point radial-front geometry",
    );
  }

  assertCanonicalText("sourcePackId", projection.sourcePackId);
  assertCanonicalText("taxonId", projection.taxonId);
  assertCanonicalText("taxonContentVersion", projection.taxonContentVersion);
  assertCanonicalText("treatmentId", projection.treatmentId);
  assertFiniteNonNegative(
    "biologicalTimeHours",
    projection.biologicalTimeHours,
  );

  if (
    projection.fixedSourceTreatment.unit !== "g/L" ||
    projection.fixedSourceTreatment.role !==
      "experimental-condition-identity"
  ) {
    throw new Error(
      "fungal source treatment must remain fixed experimental-condition identity in g/L",
    );
  }
  assertFiniteNonNegative(
    "fixedSourceTreatment.glucoseGPerL",
    projection.fixedSourceTreatment.glucoseGPerL,
  );

  if (projection.plate.unit !== "um") {
    throw new Error("fungal source plate radius must remain in um");
  }
  assertFinitePositive("plate.radiusUm", projection.plate.radiusUm);
  if (
    projection.plate.centerNormalized.x !== 0.5 ||
    projection.plate.centerNormalized.y !== 0.5
  ) {
    throw new Error(
      "fungal source-validation front must retain the exact central-point source geometry",
    );
  }

  assertFiniteNonNegative("front.radiusUm", projection.front.radiusUm);
  if (projection.front.radiusUm > projection.plate.radiusUm) {
    throw new RangeError(
      "fungal source-validation front radius cannot exceed the source plate radius",
    );
  }
  assertNormalized(
    "front.normalizedRadius",
    projection.front.normalizedRadius,
  );
  const expectedNormalizedRadius =
    projection.front.radiusUm / projection.plate.radiusUm;
  if (!numbersAgree(expectedNormalizedRadius, projection.front.normalizedRadius)) {
    throw new Error(
      "fungal source-validation normalized front radius must match physical plate/front geometry",
    );
  }
  if (
    projection.front.atDishBoundary !==
    numbersAgree(projection.front.radiusUm, projection.plate.radiusUm)
  ) {
    throw new Error(
      "fungal source-validation boundary flag must match physical front geometry",
    );
  }

  if (
    projection.unsupportedScientificSemantics.length !==
      FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS.length ||
    projection.unsupportedScientificSemantics.some(
      (semantic, index) =>
        semantic !==
        FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS[index],
    )
  ) {
    throw new Error(
      "fungal surface-front projection must retain its unsupported-science boundary",
    );
  }
}

function assertCanonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new TypeError(
      `fungal surface-front projection ${name} must be canonical non-empty text`,
    );
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `fungal surface-front projection ${name} must be finite and >= 0`,
    );
  }
}

function assertFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `fungal surface-front projection ${name} must be finite and > 0`,
    );
  }
}

function assertNormalized(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(
      `fungal surface-front projection ${name} must be within [0, 1]`,
    );
  }
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true;
  return (
    Math.abs(left - right) <=
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right))
  );
}
