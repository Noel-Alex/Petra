import { describe, expect, it } from "vitest";
import {
  ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
  type EcologyFluxObservation,
} from "../sim/ecology/fluxObservation";
import {
  ECOLOGY_DEATH_RATE_RENDER_FIELD_ID,
  ECOLOGY_DIVISION_RATE_RENDER_FIELD_ID,
  ECOLOGY_NET_GROWTH_RENDER_FIELD_ID,
  projectEcologyDeathRateField,
  projectEcologyDivisionRateField,
  projectEcologyNetGrowthField,
  projectEcologyRateFields,
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
    divisionBiomassByLineage: [[0.25, 0.5, 0, 1.25]],
    deathBiomassByLineage: [[0.75, 0.46875, 0, 0.25]],
    divisionBiomassByCell: [0.25, 0.5, 0, 1.25],
    deathBiomassByCell: [0.75, 0.46875, 0, 0.25],
    netLocalBiomassChangeByCell: [-0.5, 0.03125, 0, 1],
    averageDivisionBiomassRateByCell: [1, 2, 0, 5],
    averageDeathBiomassRateByCell: [3, 1.875, 0, 1],
    averageNetLocalBiomassRateByCell: [-2, 0.125, 0, 4],
    totalDivisionBiomass: 2,
    totalDeathBiomass: 1.46875,
    ...overrides,
  };
}

describe("ecology flux render fields", () => {
  it("projects exact signed net, division, and death rates with source-derived units", () => {
    const [net, division, death] = projectEcologyRateFields(observation());

    expect(net).toMatchObject({
      id: ECOLOGY_NET_GROWTH_RENDER_FIELD_ID,
      kind: "net-growth",
      unit: "model-biomass/hour",
      rangeMode: "snapshot-extrema",
      minimum: -2,
      maximum: 4,
    });
    expect(division).toMatchObject({
      id: ECOLOGY_DIVISION_RATE_RENDER_FIELD_ID,
      kind: "division-rate",
      unit: "model-biomass/hour",
      rangeMode: "snapshot-extrema",
      minimum: 1,
      maximum: 5,
    });
    expect(death).toMatchObject({
      id: ECOLOGY_DEATH_RATE_RENDER_FIELD_ID,
      kind: "death-rate",
      unit: "model-biomass/hour",
      rangeMode: "snapshot-extrema",
      minimum: 1,
      maximum: 3,
    });
    expect(Array.from(net!.values)).toEqual([-2, 0.125, 0, 4]);
    expect(Array.from(division!.values)).toEqual([1, 2, 0, 5]);
    expect(Array.from(death!.values)).toEqual([3, 1.875, 0, 1]);
    expect(Object.isFrozen(projectEcologyRateFields(observation()))).toBe(true);
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

  it("keeps division/death loss magnitudes non-negative", () => {
    expect(() =>
      projectEcologyDivisionRateField(
        observation({ averageDivisionBiomassRateByCell: [1, -0.1, 0, 5] }),
      ),
    ).toThrow(/division rate must be non-negative/);
    expect(() =>
      projectEcologyDeathRateField(
        observation({ averageDeathBiomassRateByCell: [3, -0.1, 0, 1] }),
      ),
    ).toThrow(/death rate must be non-negative/);
  });

  it("fails closed on malformed schema, geometry, mask, rate, units, or off-mask authority", () => {
    expect(() =>
      projectEcologyNetGrowthField({
        ...observation(),
        schemaVersion: 999,
      } as unknown as EcologyFluxObservation),
    ).toThrow(/unsupported ecology flux observation schema/);

    expect(() =>
      projectEcologyDivisionRateField(
        observation({ averageDivisionBiomassRateByCell: [1, 2] }),
      ),
    ).toThrow(/match grid dimensions/);

    expect(() =>
      projectEcologyDeathRateField(observation({ mask: [1, 2, 0, 1] })),
    ).toThrow(/mask must be binary/);

    expect(() =>
      projectEcologyNetGrowthField(
        observation({ averageNetLocalBiomassRateByCell: [1, Number.NaN, 0, 1] }),
      ),
    ).toThrow(/rate must be finite/);

    expect(() =>
      projectEcologyDeathRateField(
        observation({ averageDeathBiomassRateByCell: [3, 1, 0.01, 1] }),
      ),
    ).toThrow(/zero outside the mask/);

    expect(() =>
      projectEcologyNetGrowthField(observation({ timeUnit: " hour " })),
    ).toThrow(/timeUnit.*canonical/);

    expect(() =>
      projectEcologyNetGrowthField(observation({ stepDuration: 0 })),
    ).toThrow(/stepDuration.*positive/);

    expect(() =>
      projectEcologyNetGrowthField(observation({ mask: [0, 0, 0, 0] })),
    ).toThrow(/at least one in-mask cell/);
  });
});
