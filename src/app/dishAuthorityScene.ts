import type { FungalSurfaceFrontRenderProjection } from "./fungalSurfaceRenderProjection";
import {
  FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
  FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
} from "./fungalSurfaceRenderProjection";
import {
  validateRenderSnapshot,
  type DishRenderSnapshot,
} from "../render/model";

export const DISH_AUTHORITY_SCENE_SCHEMA_VERSION = 1 as const;

export interface ComposedRuntimeDishAuthorityScene {
  readonly schemaVersion: typeof DISH_AUTHORITY_SCENE_SCHEMA_VERSION;
  readonly mode: "composed-runtime";
  readonly biologicalTimeHours: number;
  readonly composedRuntime: DishRenderSnapshot;
  readonly fungalSourceValidation: null;
}

export interface FungalSourceValidationDishAuthorityScene {
  readonly schemaVersion: typeof DISH_AUTHORITY_SCENE_SCHEMA_VERSION;
  readonly mode: "fungal-source-validation";
  readonly biologicalTimeHours: number;
  readonly composedRuntime: null;
  readonly fungalSourceValidation: FungalSurfaceFrontRenderProjection;
}

export type DishAuthorityScene =
  | ComposedRuntimeDishAuthorityScene
  | FungalSourceValidationDishAuthorityScene;

export interface DishAuthoritySceneSources {
  readonly composedRuntime?: DishRenderSnapshot | null;
  readonly fungalSourceValidation?: FungalSurfaceFrontRenderProjection | null;
}

/**
 * Admits exactly one scientific render authority into a v1 dish scene.
 *
 * A composed runtime snapshot and the standalone fungal source-validation front
 * are deliberately mutually exclusive. Matching biological time is not an
 * authority join key. A future mixed-live scene must instead be produced from
 * one accepted runtime transaction that owns every scientific companion.
 *
 * Large renderer payloads are retained by reference; this wrapper never copies
 * a grid merely to describe which authority mode the UI is allowed to show.
 */
export function createDishAuthorityScene(
  sources: DishAuthoritySceneSources,
): DishAuthorityScene | null {
  const composedRuntime = sources.composedRuntime ?? null;
  const fungalSourceValidation = sources.fungalSourceValidation ?? null;

  if (composedRuntime !== null && fungalSourceValidation !== null) {
    throw new Error(
      "dish authority scene cannot combine composed runtime with standalone fungal source-validation authority",
    );
  }

  if (composedRuntime !== null) {
    validateRenderSnapshot(composedRuntime);
    return Object.freeze({
      schemaVersion: DISH_AUTHORITY_SCENE_SCHEMA_VERSION,
      mode: "composed-runtime",
      biologicalTimeHours: composedRuntime.simulationTimeHours,
      composedRuntime,
      fungalSourceValidation: null,
    });
  }

  if (fungalSourceValidation !== null) {
    assertFungalSourceValidationProjection(fungalSourceValidation);
    return Object.freeze({
      schemaVersion: DISH_AUTHORITY_SCENE_SCHEMA_VERSION,
      mode: "fungal-source-validation",
      biologicalTimeHours: fungalSourceValidation.biologicalTimeHours,
      composedRuntime: null,
      fungalSourceValidation,
    });
  }

  // Missing scientific authority is a waiting/presentation state, not a scene
  // with fabricated biological content.
  return null;
}

function assertFungalSourceValidationProjection(
  projection: FungalSurfaceFrontRenderProjection,
): void {
  if (
    projection.schemaVersion !==
      FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION ||
    projection.authority !== "source-validation-front" ||
    projection.geometryKind !== "central-point-radial-front"
  ) {
    throw new Error(
      "dish authority scene requires the supported fungal source-validation front contract",
    );
  }

  assertCanonicalText("fungal source pack id", projection.sourcePackId);
  assertCanonicalText("fungal taxon id", projection.taxonId);
  assertCanonicalText(
    "fungal taxon content version",
    projection.taxonContentVersion,
  );
  assertCanonicalText("fungal treatment id", projection.treatmentId);
  assertFiniteNonNegative(
    "fungal biological time",
    projection.biologicalTimeHours,
  );

  if (
    projection.fixedSourceTreatment.unit !== "g/L" ||
    projection.fixedSourceTreatment.role !==
      "experimental-condition-identity"
  ) {
    throw new Error(
      "dish authority scene requires fungal fixed treatment to remain an experimental-condition identity in g/L",
    );
  }
  assertFiniteNonNegative(
    "fungal fixed glucose treatment",
    projection.fixedSourceTreatment.glucoseGPerL,
  );

  if (
    projection.plate.unit !== "um" ||
    projection.plate.centerNormalized.x !== 0.5 ||
    projection.plate.centerNormalized.y !== 0.5
  ) {
    throw new Error(
      "dish authority scene requires the supported central-point fungal plate geometry",
    );
  }
  assertFinitePositive("fungal plate radius", projection.plate.radiusUm);
  assertFiniteNonNegative("fungal front radius", projection.front.radiusUm);
  assertFiniteUnitInterval(
    "fungal normalized front radius",
    projection.front.normalizedRadius,
  );
  if (projection.front.radiusUm > projection.plate.radiusUm) {
    throw new RangeError(
      "dish authority scene fungal front radius cannot exceed the source plate radius",
    );
  }
  if (typeof projection.front.atDishBoundary !== "boolean") {
    throw new TypeError(
      "dish authority scene fungal front boundary state must be boolean",
    );
  }

  const unsupported = projection.unsupportedScientificSemantics;
  if (
    unsupported.length !==
      FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS.length ||
    unsupported.some(
      (semantic, index) =>
        semantic !==
        FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS[index],
    )
  ) {
    throw new Error(
      "dish authority scene fungal projection must preserve every unsupported scientific semantic",
    );
  }
}

function assertCanonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new TypeError(`dish authority scene ${name} must be canonical text`);
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(
      `dish authority scene ${name} must be finite and non-negative`,
    );
  }
}

function assertFinitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(
      `dish authority scene ${name} must be finite and positive`,
    );
  }
}

function assertFiniteUnitInterval(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(
      `dish authority scene ${name} must be finite and within [0, 1]`,
    );
  }
}
