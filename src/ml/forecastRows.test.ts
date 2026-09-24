import { describe, expect, it } from "vitest";

import {
  buildExactMechanisticForecastRows,
  type AuthoritativeForecastObservation,
} from "./forecastRows";

type Observation = AuthoritativeForecastObservation<
  { readonly biomass: number },
  { readonly futureBiomass: number }
>;

function observation(
  snapshotIndex: number,
  tick: number,
  simulationTimeHours: number,
  biomass: number,
): Observation {
  return {
    snapshotIndex,
    tick,
    simulationTimeHours,
    input: { biomass },
    target: { futureBiomass: biomass },
  };
}

describe("exact mechanistic forecast rows", () => {
  it("pairs only exact same-trajectory tick targets and reports missing targets", () => {
    const rows = buildExactMechanisticForecastRows({
      splitGroupKey: "group-a",
      trajectoryKey: "trajectory-a",
      requestedHorizonTicks: [2, 5],
      observations: [
        observation(0, 0, 0, 1),
        observation(1, 2, 0.2, 2),
        observation(2, 5, 0.5, 5),
        observation(3, 7, 0.7, 7),
      ],
    });

    expect(rows.rows).toHaveLength(4);
    expect(rows.rows.map((row) => [row.sourceTick, row.targetTick])).toEqual([
      [0, 2],
      [0, 5],
      [2, 7],
      [5, 7],
    ]);
    expect(rows.rows[1]).toMatchObject({
      rowId: "forecast:12:trajectory-a:source-tick:0:target-tick:5",
      splitGroupKey: "group-a",
      trajectoryKey: "trajectory-a",
      sourceSnapshotIndex: 0,
      targetSnapshotIndex: 2,
      sourceTimeHours: 0,
      targetTimeHours: 0.5,
      forecastHorizonTicks: 5,
      forecastHorizonHours: 0.5,
      input: { biomass: 1 },
      target: { futureBiomass: 5 },
    });

    expect(
      rows.omissions.map((omission) => [
        omission.sourceTick,
        omission.targetTick,
        omission.forecastHorizonTicks,
      ]),
    ).toEqual([
      [2, 4, 2],
      [5, 10, 5],
      [7, 9, 2],
      [7, 12, 5],
    ]);
    expect(rows.omissions[0]?.reason).toBe(
      "missing-exact-target-observation",
    );
  });

  it("keeps source input and future target values detached from caller mutation", () => {
    const observations = [
      observation(0, 0, 0, 1),
      observation(1, 1, 0.1, 2),
    ];
    const rows = buildExactMechanisticForecastRows({
      splitGroupKey: "group-a",
      trajectoryKey: "trajectory-a",
      requestedHorizonTicks: [1],
      observations,
    });

    (observations[0]!.input as { biomass: number }).biomass = 99;
    (observations[1]!.target as { futureBiomass: number }).futureBiomass = 99;

    expect(rows.rows[0]?.input).toEqual({ biomass: 1 });
    expect(rows.rows[0]?.target).toEqual({ futureBiomass: 2 });
  });

  it("rejects malformed horizons instead of sorting or deduplicating them", () => {
    const observations = [
      observation(0, 0, 0, 1),
      observation(1, 1, 0.1, 2),
    ];

    expect(() =>
      buildExactMechanisticForecastRows({
        splitGroupKey: "group-a",
        trajectoryKey: "trajectory-a",
        requestedHorizonTicks: [2, 1],
        observations,
      }),
    ).toThrow(/strictly increasing/);

    expect(() =>
      buildExactMechanisticForecastRows({
        splitGroupKey: "group-a",
        trajectoryKey: "trajectory-a",
        requestedHorizonTicks: [1, 1],
        observations,
      }),
    ).toThrow(/strictly increasing/);

    expect(() =>
      buildExactMechanisticForecastRows({
        splitGroupKey: "group-a",
        trajectoryKey: "trajectory-a",
        requestedHorizonTicks: [0],
        observations,
      }),
    ).toThrow(/positive safe-integer/);
  });

  it("rejects observation identity or biological-time drift", () => {
    expect(() =>
      buildExactMechanisticForecastRows({
        splitGroupKey: "group-a",
        trajectoryKey: "trajectory-a",
        requestedHorizonTicks: [1],
        observations: [
          observation(0, 0, 0, 1),
          observation(1, 0, 0.1, 2),
        ],
      }),
    ).toThrow(/ticks must be strictly increasing/);

    expect(() =>
      buildExactMechanisticForecastRows({
        splitGroupKey: "group-a",
        trajectoryKey: "trajectory-a",
        requestedHorizonTicks: [1],
        observations: [
          observation(0, 0, 0, 1),
          observation(1, 1, 0, 2),
        ],
      }),
    ).toThrow(/biological time must be strictly increasing/);

    expect(() =>
      buildExactMechanisticForecastRows({
        splitGroupKey: "group-a",
        trajectoryKey: "trajectory-a",
        requestedHorizonTicks: [1],
        observations: [
          observation(0, 0, 0, 1),
          { ...observation(1, 1, 0.1, 2), snapshotIndex: 4 },
        ],
      }),
    ).toThrow(/contiguous snapshot indices/);
  });

  it("rejects non-canonical trajectory and group identities", () => {
    const observations = [observation(0, 0, 0, 1)];

    expect(() =>
      buildExactMechanisticForecastRows({
        splitGroupKey: " group-a",
        trajectoryKey: "trajectory-a",
        requestedHorizonTicks: [1],
        observations,
      }),
    ).toThrow(/splitGroupKey/);

    expect(() =>
      buildExactMechanisticForecastRows({
        splitGroupKey: "group-a",
        trajectoryKey: "",
        requestedHorizonTicks: [1],
        observations,
      }),
    ).toThrow(/trajectoryKey/);
  });
});
