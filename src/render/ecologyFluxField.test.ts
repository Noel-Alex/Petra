import { describe, expect, it } from "vitest";
import {
  ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
  type EcologyFluxObservation,
} from "../sim/ecology/fluxObservation";
import {
  ECOLOGY_NET_GROWTH_RENDER_FIELD_ID,
  projectEcologyNetGrowthField,
} from "./ecologyFluxField";

function observation(
  overrides: Partial<EcologyFluxObservation> = {},
): EcologyFluxObservation {
  return {
    schemaVersion: ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
    width: 2,
    height: 2,
    mask: [1, 1, 0, 1],
    lineageIds: ["L1"],
    biomassUnit: "model-biomass",
    timeUnit: "hour",
    stepDuration: 0.25,
    divisionBiomassByLineage: [[0, 0, 0, 0]],
    deathBiomassByLineage: [[0, 0, 0, 0]],
    divisionBiomassByCell: [0, 0, 0, 0],
    deathBiomassByCell: [0, 0, 0, 0],
    netLocalBiomassChangeByCell: [0, 0, 0, 0],
    averageDivisionBiomassRateByCell: [0, 0, 0, 0],
    averageDeathBiomassRateByCell: [0, 0, 0, 0],
    averageNetLocalBiomassRateByCell: [-2, 0.125, 0, 4],
    totalDivisionBiomass: 0,
    totalDeathBiomass: 0,
    ...overrides,
  };
}

describe("ecology flux render field", () => {
  it("projects the exact signed pre-spread net-local rate with source-derived units", () => {
    const field = projectEcologyNetGrowthField(observation());

    expect(field.id).toBe(ECOLOGY_NET_GROWTH_RENDER_FIELD_ID);
    expect(field.kind).toBe("net-growth");
    expect(field.label).toContain("pre-spread");
    expect(field.unit).toBe("model-biomass/hour");
    expect(field.rangeMode).toBe("snapshot-extrema");
    expect(Array.from(field.values)).toEqual([-2, 0.125, 0, 4]);
    expect(field.minimum).toBe(-2);
    expect(field.maximum).toBe(4);
  });

  it("computes displayed extrema after Float32 narrowing and detaches storage", () => {
    const rates = [1 / 3, -1 / 7, 0, 1 / 9];
    const source = observation({
      averageNetLocalBiomassRateByCell: rates,
    });
    const field = projectEcologyNetGrowthField(source);
    const displayed = Array.from(field.values).filter(
      (_, index) => source.mask[index] === 1,
    );

    expect(field.minimum).toBe(Math.min(...displayed));
    expect(field.maximum).toBe(Math.max(...displayed));
    expect(field.values).not.toBe(source.averageNetLocalBiomassRateByCell);
    rates[0] = 999;
    expect(field.values[0]).not.toBe(999);
  });

  it("fails closed on malformed schema, geometry, mask, rate, units, or off-mask authority", () => {
    expect(() =>
      projectEcologyNetGrowthField({
        ...observation(),
        schemaVersion: 999,
      } as unknown as EcologyFluxObservation),
    ).toThrow(/unsupported ecology flux observation schema/);

    expect(() =>
      projectEcologyNetGrowthField(
        observation({ averageNetLocalBiomassRateByCell: [1, 2] }),
      ),
    ).toThrow(/match grid dimensions/);

    expect(() =>
      projectEcologyNetGrowthField(observation({ mask: [1, 2, 0, 1] })),
    ).toThrow(/mask must be binary/);

    expect(() =>
      projectEcologyNetGrowthField(
        observation({ averageNetLocalBiomassRateByCell: [1, Number.NaN, 0, 1] }),
      ),
    ).toThrow(/rate must be finite/);

    expect(() =>
      projectEcologyNetGrowthField(
        observation({ averageNetLocalBiomassRateByCell: [1, 0, 0.01, 1] }),
      ),
    ).toThrow(/zero outside the mask/);

    expect(() =>
      projectEcologyNetGrowthField(observation({ timeUnit: " hour " })),
    ).toThrow(/timeUnit.*canonical/);

    expect(() =>
      projectEcologyNetGrowthField(observation({ mask: [0, 0, 0, 0] })),
    ).toThrow(/at least one in-mask cell/);
  });
});
