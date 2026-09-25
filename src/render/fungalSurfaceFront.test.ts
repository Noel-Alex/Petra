import { describe, expect, it } from "vitest";
import {
  ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
} from "./organismPresentationIdentity";
import {
  advanceAspergillusNo10SurfaceCheckpoint,
  aspergillusNo10SurfaceTreatment,
  createAspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SurfaceCheckpoint,
} from "../sim/fungi/aspergillusNo10Surface";
import {
  FUNGAL_SURFACE_FRONT_RENDER_SCHEMA_VERSION,
  projectAspergillusNo10SurfaceFront,
} from "./fungalSurfaceFront";

describe("projectAspergillusNo10SurfaceFront", () => {
  it("projects exact source-front identity and normalized 9-cm plate geometry", () => {
    const treatment = aspergillusNo10SurfaceTreatment(40);
    const checkpoint = advanceAspergillusNo10SurfaceCheckpoint(
      createAspergillusNo10SurfaceCheckpoint(40),
      2,
    );

    const projected = projectAspergillusNo10SurfaceFront(checkpoint);
    const expectedRadiusUm = treatment.radialExtensionUmPerHour * 2;

    expect(projected.schemaVersion).toBe(
      FUNGAL_SURFACE_FRONT_RENDER_SCHEMA_VERSION,
    );
    expect(projected.authority).toBe("source-validation");
    expect(projected.sourcePackId).toBe(checkpoint.sourcePackId);
    expect(projected.taxonId).toBe(checkpoint.taxonId);
    expect(projected.taxonContentVersion).toBe(
      checkpoint.taxonContentVersion,
    );
    expect(projected.treatmentId).toBe(checkpoint.treatmentId);
    expect(projected.biologicalTimeHours).toBe(2);
    expect(projected.sourceTreatment).toEqual({
      role: "fixed-source-treatment",
      parameter: "glucose",
      value: 40,
      unit: "g/L",
    });
    expect(projected.plate).toEqual({
      diameterCm: 9,
      radiusUm: 45_000,
      centerNormalized: {
        x: 0.5,
        y: 0.5,
      },
    });
    expect(projected.colonyFront.radiusUm).toBe(expectedRadiusUm);
    expect(projected.colonyFront.normalizedRadius).toBe(
      expectedRadiusUm / 45_000,
    );
    expect(projected.colonyFront.frontAtDishBoundary).toBe(false);
    expect(projected.organismPresentation).toEqual(
      ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
    );
    expect(projected.organismPresentation).not.toBe(
      ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
    );
    expect(projected.organismPresentation.organismKind).toBe("fungus");
    expect(projected.organismPresentation.morphology).toBe(
      "filamentous-hyphal",
    );
  });

  it("preserves the exact source boundary cap", () => {
    const projected = projectAspergillusNo10SurfaceFront(
      advanceAspergillusNo10SurfaceCheckpoint(
        createAspergillusNo10SurfaceCheckpoint(70),
        10_000,
      ),
    );

    expect(projected.colonyFront.radiusUm).toBe(45_000);
    expect(projected.colonyFront.normalizedRadius).toBe(1);
    expect(projected.colonyFront.frontAtDishBoundary).toBe(true);
  });

  it("fails closed on checkpoint radius/time drift before render publication", () => {
    const checkpoint = createAspergillusNo10SurfaceCheckpoint(10);
    const malformed = {
      ...checkpoint,
      colonyRadiusUm: 1,
    } as AspergillusNo10SurfaceCheckpoint;

    expect(() => projectAspergillusNo10SurfaceFront(malformed)).toThrow(
      /radius\/time drift/,
    );
  });

  it("returns frozen detached presentation records", () => {
    const projected = projectAspergillusNo10SurfaceFront(
      createAspergillusNo10SurfaceCheckpoint(120),
    );

    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.sourceTreatment)).toBe(true);
    expect(Object.isFrozen(projected.plate)).toBe(true);
    expect(Object.isFrozen(projected.plate.centerNormalized)).toBe(true);
    expect(Object.isFrozen(projected.colonyFront)).toBe(true);
    expect(Object.isFrozen(projected.organismPresentation)).toBe(true);
    expect(projected.organismPresentation).not.toBe(
      ASPERGILLUS_NO10_ORGANISM_PRESENTATION,
    );
  });
});
