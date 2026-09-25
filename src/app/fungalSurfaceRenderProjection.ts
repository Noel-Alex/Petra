import {
  observeAspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SurfaceCheckpoint,
} from "../sim/fungi/aspergillusNo10Surface";

export const FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION = 1 as const;

export const FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS = Object.freeze([
  "spatial-density",
  "biomass",
  "dynamic-resource-field",
  "hyphal-network",
  "literal-hyphal-count",
  "antimicrobial-response",
  "bacteria-fungus-interaction",
] as const);

export type FungalSurfaceFrontUnsupportedScientificSemantic =
  (typeof FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS)[number];

export interface FungalSurfaceFrontRenderProjection {
  readonly schemaVersion:
    typeof FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION;
  readonly authority: "source-validation-front";
  readonly geometryKind: "central-point-radial-front";
  readonly sourcePackId: string;
  readonly taxonId: string;
  readonly taxonContentVersion: string;
  readonly treatmentId: string;
  readonly biologicalTimeHours: number;
  readonly fixedSourceTreatment: Readonly<{
    readonly glucoseGPerL: number;
    readonly unit: "g/L";
    readonly role: "experimental-condition-identity";
  }>;
  readonly plate: Readonly<{
    readonly radiusUm: number;
    readonly unit: "um";
    readonly centerNormalized: Readonly<{
      readonly x: 0.5;
      readonly y: 0.5;
    }>;
  }>;
  readonly front: Readonly<{
    readonly radiusUm: number;
    readonly normalizedRadius: number;
    readonly atDishBoundary: boolean;
  }>;
  readonly unsupportedScientificSemantics:
    readonly FungalSurfaceFrontUnsupportedScientificSemantic[];
}

/**
 * Projects the exact supported fungal source-validation checkpoint into
 * renderer-neutral front geometry.
 *
 * The projection intentionally exposes no density, biomass, resource field,
 * branch graph, segment count, opacity, drug response, or interaction state.
 * Those quantities are not authoritative in the current fungal model.
 */
export function projectAspergillusNo10SurfaceFrontForRender(
  checkpoint: AspergillusNo10SurfaceCheckpoint,
): FungalSurfaceFrontRenderProjection {
  const observation = observeAspergillusNo10SurfaceCheckpoint(checkpoint);

  if (
    !Number.isFinite(observation.normalizedColonyRadius) ||
    observation.normalizedColonyRadius < 0 ||
    observation.normalizedColonyRadius > 1
  ) {
    throw new RangeError(
      "fungal surface render projection requires a normalized colony radius within [0, 1]",
    );
  }

  return Object.freeze({
    schemaVersion: FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
    authority: "source-validation-front",
    geometryKind: "central-point-radial-front",
    sourcePackId: observation.sourcePackId,
    taxonId: observation.taxonId,
    taxonContentVersion: observation.taxonContentVersion,
    treatmentId: observation.treatmentId,
    biologicalTimeHours: observation.biologicalTimeHours,
    fixedSourceTreatment: Object.freeze({
      glucoseGPerL: observation.glucoseGPerL,
      unit: "g/L",
      role: "experimental-condition-identity",
    }),
    plate: Object.freeze({
      radiusUm: observation.plateRadiusUm,
      unit: "um",
      centerNormalized: Object.freeze({
        x: 0.5,
        y: 0.5,
      }),
    }),
    front: Object.freeze({
      radiusUm: observation.colonyRadiusUm,
      normalizedRadius: observation.normalizedColonyRadius,
      atDishBoundary: observation.frontAtDishBoundary,
    }),
    unsupportedScientificSemantics:
      FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
  });
}
