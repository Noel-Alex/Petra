import { describe, expect, it } from "vitest";

import type {
  MechanisticDatasetSchemaIdentity,
  MechanisticSample,
  TrajectoryIdentity,
} from "./dataset";
import {
  MECHANISTIC_FORECAST_HORIZON_SCHEMA_VERSION,
  buildMechanisticForecastRows,
  createMechanisticForecastObservation,
  type MechanisticForecastHorizon,
  type MechanisticForecastObservation,
} from "./forecastRows";

interface Input {
  readonly population: number;
}

interface Target {
  readonly futurePopulation: number;
}

const datasetSchema: MechanisticDatasetSchemaIdentity = {
  schemaVersion: "mechanistic-dataset-schema-v1",
  inputSchemaVersion: "aggregate-input-v1",
  targetSchemaVersion: "aggregate-target-v1",
};

const trajectory: TrajectoryIdentity = {
  group: {
    engineVersion: "engine-v3",
    parameterSetHash: "binding-v1",
    scenarioId: "flagship",
    scenarioVersion: "1",
    groupId: "condition-a",
  },
  seed: 17,
  interventionFingerprint: "none-v1",
};

function sample(
  snapshotIndex: number,
  simulationTimeHours: number,
  population: number,
): MechanisticSample<Input, Target> {
  return {
    datasetVersion: "aggregate-v1",
    trajectory: structuredClone(trajectory),
    snapshotIndex,
    simulationTimeHours,
    normalizationProfileId: "aggregate-normalization-v1",
    datasetSchema: structuredClone(datasetSchema),
    input: { population },
    target: { futurePopulation: population + 1_000 },
  };
}

function observation(
  snapshotIndex: number,
  tick: number,
  simulationTimeHours: number,
  population: number,
): MechanisticForecastObservation<Input, Target> {
  return createMechanisticForecastObservation(
    sample(snapshotIndex, simulationTimeHours, population),
    tick,
  );
}

function horizon(ticks: number): MechanisticForecastHorizon {
  return {
    schemaVersion: MECHANISTIC_FORECAST_HORIZON_SCHEMA_VERSION,
    ticks,
  };
}

describe("mechanistic future-horizon row construction", () => {
  it("pairs source input only with an exact future authoritative target on the same trajectory", () => {
    const result = buildMechanisticForecastRows(
      [
        observation(0, 0, 0, 100),
        observation(1, 5, 0.1, 110),
        observation(2, 10, 0.2, 125),
        observation(3, 15, 0.3, 140),
      ],
      [horizon(10), horizon(5)],
    );

    expect(result.horizons.map((item) => item.ticks)).toEqual([5, 10]);
    expect(
      result.rows.map((row) => ({
        sourceTick: row.sourceTick,
        targetTick: row.targetTick,
        horizonTicks: row.horizon.ticks,
      })),
    ).toEqual([
      { sourceTick: 0, targetTick: 5, horizonTicks: 5 },
      { sourceTick: 0, targetTick: 10, horizonTicks: 10 },
      { sourceTick: 5, targetTick: 10, horizonTicks: 5 },
      { sourceTick: 5, targetTick: 15, horizonTicks: 10 },
      { sourceTick: 10, targetTick: 15, horizonTicks: 5 },
    ]);

    const first = result.rows[0]!;
    expect(first.input).toEqual({ population: 100 });
    expect(first.target).toEqual({ futurePopulation: 1_110 });
    expect(first.sourceSimulationTimeHours).toBe(0);
    expect(first.targetSimulationTimeHours).toBe(0.1);
    expect(first.forecastHorizonHours).toBeCloseTo(0.1);
    expect(first.trajectory).toEqual(trajectory);

    expect(result.omissions).toEqual([
      {
        reason: "missing-exact-target",
        sourceSnapshotIndex: 2,
        sourceTick: 10,
        requestedTargetTick: 20,
        horizon: horizon(10),
      },
      {
        reason: "missing-exact-target",
        sourceSnapshotIndex: 3,
        sourceTick: 15,
        requestedTargetTick: 20,
        horizon: horizon(5),
      },
      {
        reason: "missing-exact-target",
        sourceSnapshotIndex: 3,
        sourceTick: 15,
        requestedTargetTick: 25,
        horizon: horizon(10),
      },
    ]);
  });

  it("never substitutes a nearby cadence observation for a missing exact target", () => {
    const result = buildMechanisticForecastRows(
      [
        observation(0, 0, 0, 100),
        observation(1, 5, 0.1, 110),
        observation(2, 10, 0.2, 120),
      ],
      [horizon(6)],
    );

    expect(result.rows).toHaveLength(0);
    expect(result.omissions.map((item) => item.requestedTargetTick)).toEqual([
      6,
      11,
      16,
    ]);
  });

  it("uses authoritative ticks rather than snapshot index when cadence is dense", () => {
    const result = buildMechanisticForecastRows(
      [
        observation(0, 100, 2, 100),
        observation(1, 101, 2.02, 101),
        observation(2, 102, 2.04, 102),
        observation(3, 103, 2.06, 103),
      ],
      [horizon(2)],
    );

    expect(
      result.rows.map((row) => [row.sourceTick, row.targetTick]),
    ).toEqual([
      [100, 102],
      [101, 103],
    ]);
    expect(result.rows[0]!.target).toEqual({
      futurePopulation: 1_102,
    });
  });

  it("canonicalizes horizon order so row identity does not depend on request ordering", () => {
    const observations = [
      observation(0, 0, 0, 100),
      observation(1, 5, 0.1, 110),
      observation(2, 10, 0.2, 120),
    ];

    const first = buildMechanisticForecastRows(observations, [
      horizon(10),
      horizon(5),
    ]);
    const second = buildMechanisticForecastRows(observations, [
      horizon(5),
      horizon(10),
    ]);

    expect(second.rows.map((row) => row.rowId)).toEqual(
      first.rows.map((row) => row.rowId),
    );
    expect(second.omissions).toEqual(first.omissions);
  });

  it("rejects cross-trajectory, schema, ordering, and time drift", () => {
    const baseline = [
      observation(0, 0, 0, 100),
      observation(1, 5, 0.1, 110),
    ];

    expect(() =>
      buildMechanisticForecastRows(
        [
          baseline[0]!,
          {
            ...baseline[1]!,
            trajectory: {
              ...baseline[1]!.trajectory,
              seed: 18,
            },
          },
        ],
        [horizon(5)],
      ),
    ).toThrow(/one trajectory/);

    expect(() =>
      buildMechanisticForecastRows(
        [
          baseline[0]!,
          {
            ...baseline[1]!,
            datasetSchema: {
              ...datasetSchema,
              targetSchemaVersion: "aggregate-target-v2",
            },
          },
        ],
        [horizon(5)],
      ),
    ).toThrow(/one exact input\/target schema/);

    expect(() =>
      buildMechanisticForecastRows(
        [baseline[1]!, baseline[0]!],
        [horizon(5)],
      ),
    ).toThrow(/snapshotIndex values must be strictly increasing/);

    expect(() =>
      buildMechanisticForecastRows(
        [
          baseline[0]!,
          { ...baseline[1]!, simulationTimeHours: 0 },
        ],
        [horizon(5)],
      ),
    ).toThrow(/simulationTimeHours values must be strictly increasing/);
  });

  it("rejects duplicate or invalid horizon identities instead of silently changing semantics", () => {
    const observations = [observation(0, 0, 0, 100)];

    expect(() =>
      buildMechanisticForecastRows(observations, [horizon(5), horizon(5)]),
    ).toThrow(/duplicate mechanistic forecast horizon/);
    expect(() =>
      buildMechanisticForecastRows(observations, [horizon(0)]),
    ).toThrow(/positive safe integer/);
    expect(() =>
      buildMechanisticForecastRows(observations, [
        {
          schemaVersion:
            "mechanistic-forecast-horizon-v0" as typeof MECHANISTIC_FORECAST_HORIZON_SCHEMA_VERSION,
          ticks: 5,
        },
      ]),
    ).toThrow(/unsupported mechanistic forecast horizon schema/);
  });

  it("requires an explicit authoritative tick and detaches adapted payloads", () => {
    const source = sample(0, 0, 100);
    const adapted = createMechanisticForecastObservation(source, 7);

    (source.input as { population: number }).population = 999;
    (source.target as { futurePopulation: number }).futurePopulation = 999;

    expect(adapted.tick).toBe(7);
    expect(adapted.input).toEqual({ population: 100 });
    expect(adapted.target).toEqual({ futurePopulation: 1_100 });
    expect(() =>
      createMechanisticForecastObservation(source, Number.NaN),
    ).toThrow(/non-negative safe integer/);
  });

  it("refuses empty observations and horizons rather than inventing metadata", () => {
    expect(() =>
      buildMechanisticForecastRows([], [horizon(5)]),
    ).toThrow(/at least one trajectory observation/);
    expect(() =>
      buildMechanisticForecastRows([observation(0, 0, 0, 100)], []),
    ).toThrow(/at least one forecast horizon/);
  });
});
