import {
  ASPERGILLUS_NO10_PLATE_DIAMETER_CM,
  ASPERGILLUS_NO10_PLATE_RADIUS_UM,
  observeAspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SupportedGlucoseGPerL,
} from "../sim/fungi/aspergillusNo10Surface";
import {
  ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
  parseOrganismPresentationIdentity,
  type OrganismPresentationIdentity,
} from "./organismPresentationIdentity";

export const FUNGAL_SURFACE_FRONT_RENDER_SCHEMA_VERSION = 1 as const;

export interface FungalSurfaceSourceTreatment {
  readonly role: "fixed-source-treatment";
  readonly parameter: "glucose";
  readonly value: AspergillusNo10SupportedGlucoseGPerL;
  readonly unit: "g/L";
}

export interface FungalSurfacePlateGeometry {
  readonly diameterCm: typeof ASPERGILLUS_NO10_PLATE_DIAMETER_CM;
  readonly radiusUm: typeof ASPERGILLUS_NO10_PLATE_RADIUS_UM;
  readonly centerNormalized: Readonly<{
    readonly x: 0.5;
    readonly y: 0.5;
  }>;
}

export interface FungalSurfaceColonyFront {
  readonly radiusUm: number;
  readonly normalizedRadius: number;
  readonly frontAtDishBoundary: boolean;
}

/**
 * Renderer-safe projection of the currently supported source-validation fungal
 * state. It carries exact scientific front geometry and a separately validated
 * coarse presentation identity, but deliberately does not contain a hyphal
 * graph, biomass field, resource field, branching law, or interaction model.
 */
export interface FungalSurfaceFrontRenderModel {
  readonly schemaVersion: typeof FUNGAL_SURFACE_FRONT_RENDER_SCHEMA_VERSION;
  readonly authority: "source-validation";
  readonly sourcePackId: string;
  readonly taxonId: string;
  readonly taxonContentVersion: string;
  readonly treatmentId: string;
  readonly biologicalTimeHours: number;
  readonly sourceTreatment: FungalSurfaceSourceTreatment;
  readonly plate: FungalSurfacePlateGeometry;
  readonly colonyFront: FungalSurfaceColonyFront;
  readonly organismPresentation: OrganismPresentationIdentity;
  readonly limitation: string;
}

const FUNGAL_SURFACE_FRONT_LIMITATION =
  "Source-validation colony-front geometry only. This record is not a literal hyphal graph, biomass field, mutable glucose/nutrient field, branching-network model, antimicrobial response, or bacteria-fungus interaction model." as const;

/**
 * Project one validated A. niger no. 10 checkpoint into immutable renderer data.
 *
 * The simulator validator remains authoritative for checkpoint/source identity.
 * Normalized presentation geometry is derived only from the exact 9-cm source
 * plate and physical colony-front radius.
 */
export function projectAspergillusNo10SurfaceFront(
  checkpoint: AspergillusNo10SurfaceCheckpoint,
): FungalSurfaceFrontRenderModel {
  const observation = observeAspergillusNo10SurfaceCheckpoint(checkpoint);

  if (
    !Number.isFinite(observation.normalizedColonyRadius) ||
    observation.normalizedColonyRadius < 0 ||
    observation.normalizedColonyRadius > 1
  ) {
    throw new RangeError(
      "fungal normalized colony radius must be finite and within [0, 1]",
    );
  }

  const organismPresentation = parseOrganismPresentationIdentity(
    structuredClone(ASPERGILLUS_NO10_ORGANISM_PRESENTATION),
  );

  return Object.freeze({
    schemaVersion: FUNGAL_SURFACE_FRONT_RENDER_SCHEMA_VERSION,
    authority: "source-validation",
    sourcePackId: observation.sourcePackId,
    taxonId: observation.taxonId,
    taxonContentVersion: observation.taxonContentVersion,
    treatmentId: observation.treatmentId,
    biologicalTimeHours: observation.biologicalTimeHours,
    sourceTreatment: Object.freeze({
      role: "fixed-source-treatment",
      parameter: "glucose",
      value: observation.glucoseGPerL,
      unit: "g/L",
    }),
    plate: Object.freeze({
      diameterCm: ASPERGILLUS_NO10_PLATE_DIAMETER_CM,
      radiusUm: observation.plateRadiusUm,
      centerNormalized: Object.freeze({
        x: 0.5,
        y: 0.5,
      }),
    }),
    colonyFront: Object.freeze({
      radiusUm: observation.colonyRadiusUm,
      normalizedRadius: observation.normalizedColonyRadius,
      frontAtDishBoundary: observation.frontAtDishBoundary,
    }),
    organismPresentation,
    limitation: FUNGAL_SURFACE_FRONT_LIMITATION,
  });
}
