import { describe, expect, it } from "vitest";

import {
  ASPERGILLUS_NO10_PLATE_RADIUS_UM,
  ASPERGILLUS_NO10_SOURCE_PACK_ID,
  ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
  ASPERGILLUS_NO10_TAXON_ID,
  advanceAspergillusNo10SurfaceCheckpoint,
  createAspergillusNo10SurfaceCheckpoint,
  observeAspergillusNo10SurfaceCheckpoint,
} from "../sim/fungi/aspergillusNo10Surface";
import {
  FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
  FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
  projectAspergillusNo10SurfaceFrontForRender,
} from "./fungalSurfaceRenderProjection";

describe("fungal surface render projection", () => {
  it("preserves exact fungal/source/treatment identity with a zero-radius founder front", () => {
    const checkpoint = createAspergillusNo10SurfaceCheckpoint(70);
    const projection = projectAspergillusNo10SurfaceFrontForRender(checkpoint);

    expect(projection).toEqual({
      schemaVersion: FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
      authority: "source-validation-front",
      geometryKind: "central-point-radial-front",
      sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
      taxonId: ASPERGILLUS_NO10_TAXON_ID,
      taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
      treatmentId: checkpoint.treatmentId,
      biologicalTimeHours: 0,
      fixedSourceTreatment: {
        glucoseGPerL: 70,
        unit: "g/L",
        role: "experimental-condition-identity",
      },
      plate: {
        radiusUm: ASPERGILLUS_NO10_PLATE_RADIUS_UM,
        unit: "um",
        centerNormalized: {
          x: 0.5,
          y: 0.5,
        },
      },
      front: {
        radiusUm: 0,
        normalizedRadius: 0,
        atDishBoundary: false,
      },
      unsupportedScientificSemantics:
        FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(Object.isFrozen(projection.fixedSourceTreatment)).toBe(true);
    expect(Object.isFrozen(projection.plate)).toBe(true);
    expect(Object.isFrozen(projection.plate.centerNormalized)).toBe(true);
    expect(Object.isFrozen(projection.front)).toBe(true);
    expect(Object.isFrozen(projection.unsupportedScientificSemantics)).toBe(true);
  });

  it("projects a partial authoritative front without inventing density or biomass", () => {
    const checkpoint = advanceAspergillusNo10SurfaceCheckpoint(
      createAspergillusNo10SurfaceCheckpoint(40),
      3,
    );
    const observation = observeAspergillusNo10SurfaceCheckpoint(checkpoint);
    const projection = projectAspergillusNo10SurfaceFrontForRender(checkpoint);

    expect(projection.front.radiusUm).toBe(observation.colonyRadiusUm);
    expect(projection.front.normalizedRadius).toBe(
      observation.normalizedColonyRadius,
    );
    expect(projection.front.normalizedRadius).toBeGreaterThan(0);
    expect(projection.front.normalizedRadius).toBeLessThan(1);
    expect("density" in projection).toBe(false);
    expect("biomass" in projection).toBe(false);
    expect("resource" in projection).toBe(false);
    expect("opacity" in projection).toBe(false);
  });

  it("saturates at exactly the source-plate boundary", () => {
    const checkpoint = advanceAspergillusNo10SurfaceCheckpoint(
      createAspergillusNo10SurfaceCheckpoint(120),
      1_000,
    );
    const projection = projectAspergillusNo10SurfaceFrontForRender(checkpoint);

    expect(projection.front.radiusUm).toBe(ASPERGILLUS_NO10_PLATE_RADIUS_UM);
    expect(projection.front.normalizedRadius).toBe(1);
    expect(projection.front.atDishBoundary).toBe(true);
  });

  it("keeps the fixed glucose row as treatment identity rather than a dynamic resource field", () => {
    const projection = projectAspergillusNo10SurfaceFrontForRender(
      createAspergillusNo10SurfaceCheckpoint(300),
    );

    expect(projection.fixedSourceTreatment).toEqual({
      glucoseGPerL: 300,
      unit: "g/L",
      role: "experimental-condition-identity",
    });
    expect(projection.unsupportedScientificSemantics).toContain(
      "dynamic-resource-field",
    );
  });

  it("fails closed through simulation-owned checkpoint validation", () => {
    const checkpoint = createAspergillusNo10SurfaceCheckpoint(70);
    const drifted = {
      ...checkpoint,
      colonyRadiusUm: 1,
    };

    expect(() =>
      projectAspergillusNo10SurfaceFrontForRender(drifted),
    ).toThrow(/radius\/time drift/);
  });
});
