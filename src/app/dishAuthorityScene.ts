import type { DishRenderSnapshot } from "../render/model";
import type { FungalSurfaceFrontRenderProjection } from "./fungalSurfaceRenderProjection";
import {
  FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
  FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
} from "./fungalSurfaceRenderProjection";

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
  /**
   * Must already be admitted by composedDishProjection.ts. Scene composition
   * validates only transaction/source structure so it does not rescan every
   * scientific scalar on every publication.
   */
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
 * or rescans a grid merely to describe which authority mode the UI may show.
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
    assertAdmittedComposedRuntimeSnapshot(composedRuntime);
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

/**
 * Scene-level admission only. Full scalar validation stays at the existing
 * composedDishProjection.ts boundary; repeating that O(cells × channels) scan
 * here would make a metadata wrapper part of the render-publication hot path.
 */
function assertAdmittedComposedRuntimeSnapshot(
  snapshot: DishRenderSnapshot,
): void {
  assertPrefixedCanonicalIdentity(
    "composed snapshot id",
    snapshot.snapshotId,
    "composed-trace:",
  );
  assertPrefixedCanonicalIdentity(
    "composed sampling identity",
    snapshot.samplingIdentity,
    "runtime-branch:",
  );
  assertFiniteNonNegative(
    "composed biological time",
    snapshot.simulationTimeHours,
  );

  if (
    !Number.isSafeInteger(snapshot.gridWidth) ||
    !Number.isSafeInteger(snapshot.gridHeight) ||
    snapshot.gridWidth <= 0 ||
    snapshot.gridHeight <= 0
  ) {
    throw new RangeError(
      "dish authority scene requires positive safe composed grid dimensions",
    );
  }
  const cells = snapshot.gridWidth * snapshot.gridHeight;
  if (
    !Number.isSafeInteger(cells) ||
    snapshot.dishMask.length !== cells ||
    snapshot.biomass.length !== cells
  ) {
    throw new RangeError(
      "dish authority scene requires composed mask/biomass lengths to match the admitted grid",
    );
  }

  for (const field of snapshot.fields) {
    if (
      field.width !== snapshot.gridWidth ||
      field.height !== snapshot.gridHeight ||
      field.values.length !== cells
    ) {
      throw new RangeError(
        "dish authority scene requires admitted composed field dimensions to match the grid",
      );
    }
  }
  for (const lineage of snapshot.lineages) {
    if (lineage.density.length !== cells) {
      throw new RangeError(
        "dish authority scene requires admitted composed lineage density to match the grid",
      );
    }
  }
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

function assertPrefixedCanonicalIdentity(
  name: string,
  value: string,
  prefix: string,
): void {
  assertCanonicalText(name, value);
  const suffix = value.slice(prefix.length);
  if (!value.startsWith(prefix) || suffix.length === 0 || suffix !== suffix.trim()) {
    throw new TypeError(
      `dish authority scene ${name} must preserve the ${JSON.stringify(prefix)} authority prefix`,
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
