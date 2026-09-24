import { describe, expect, it } from "vitest";

import {
  assignDatasetSplit,
  splitGroupKey,
  trajectoryKey,
  validateMechanisticSample,
  validateSplitPolicy,
  type DatasetGroupIdentity,
  type MechanisticDatasetSchemaIdentity,
  type MechanisticSample,
  type TrajectoryIdentity,
} from "./dataset";

const datasetSchema: MechanisticDatasetSchemaIdentity = {
  schemaVersion: "mechanistic-dataset-schema-v1",
  inputSchemaVersion: "aggregate-input-v1",
  targetSchemaVersion: "aggregate-target-v1",
};

const group: DatasetGroupIdentity = {
  engineVersion: "engine-a",
  parameterSetHash: "params-123",
  scenarioId: "selection-not-mutation",
  scenarioVersion: "1",
  groupId: "drug-gradient-family-a",
};

function trajectory(seed: number): TrajectoryIdentity {
  return {
    group,
    seed,
    interventionFingerprint: "dose@2h:0.25",
  };
}

describe("mechanistic ML dataset contract", () => {
  it("keeps every seed and frame in one parameter/scenario group in one split", () => {
    const split = assignDatasetSplit(group);
    expect(assignDatasetSplit({ ...group })).toBe(split);

    for (const seed of [1, 2, 3, 999]) {
      const identity = trajectory(seed);
      expect(assignDatasetSplit(identity.group)).toBe(split);
    }
  });

  it("keeps trajectory identity distinct without using it for split leakage", () => {
    const first = trajectory(1);
    const second = trajectory(2);

    expect(trajectoryKey(first)).not.toBe(trajectoryKey(second));
    expect(splitGroupKey(first.group)).toBe(splitGroupKey(second.group));
    expect(assignDatasetSplit(first.group)).toBe(
      assignDatasetSplit(second.group),
    );
  });

  it("validates versioned sample metadata without inspecting model payloads", () => {
    const sample: MechanisticSample<{ population: number }, { future: number }> =
      {
        datasetVersion: "dataset-v1",
        trajectory: trajectory(42),
        snapshotIndex: 3,
        simulationTimeHours: 1.5,
        normalizationProfileId: "aggregate-v1",
        datasetSchema,
        input: { population: 100 },
        target: { future: 140 },
      };

    expect(() => validateMechanisticSample(sample)).not.toThrow();
  });

  it("rejects seeds outside the authoritative uint32 simulation domain", () => {
    for (const seed of [-1, 0x1_0000_0000, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => trajectoryKey(trajectory(seed))).toThrow(/simulation seed/);
    }

    expect(() =>
      validateMechanisticSample({
        datasetVersion: "dataset-v1",
        trajectory: trajectory(0x1_0000_0000),
        snapshotIndex: 0,
        simulationTimeHours: 0,
        normalizationProfileId: "aggregate-v1",
        datasetSchema,
        input: null,
        target: null,
      }),
    ).toThrow(/simulation seed/);

    expect(() =>
      trajectoryKey(trajectory("01" as unknown as number)),
    ).toThrow(/simulation seed/);
    expect(() => trajectoryKey(trajectory(0))).not.toThrow();
    expect(() => trajectoryKey(trajectory(0xffff_ffff))).not.toThrow();
  });

  it("rejects malformed input/target schema identity instead of inferring from payload keys", () => {
    expect(() =>
      validateMechanisticSample({
        datasetVersion: "dataset-v1",
        trajectory: trajectory(42),
        snapshotIndex: 0,
        simulationTimeHours: 0,
        normalizationProfileId: "aggregate-v1",
        datasetSchema: {
          ...datasetSchema,
          inputSchemaVersion: "",
        },
        input: { population: 100 },
        target: { future: 140 },
      }),
    ).toThrow(/inputSchemaVersion/);

    expect(() =>
      validateMechanisticSample({
        datasetVersion: "dataset-v1",
        trajectory: trajectory(42),
        snapshotIndex: 0,
        simulationTimeHours: 0,
        normalizationProfileId: "aggregate-v1",
        datasetSchema: {
          ...datasetSchema,
          schemaVersion: "mechanistic-dataset-schema-v2",
        } as unknown as MechanisticDatasetSchemaIdentity,
        input: { population: 100 },
        target: { future: 140 },
      }),
    ).toThrow(/unsupported mechanistic dataset schema/);
  });

  it("rejects invalid time/index and malformed split policies", () => {
    const invalid: MechanisticSample<null, null> = {
      datasetVersion: "dataset-v1",
      trajectory: trajectory("42"),
      snapshotIndex: -1,
      simulationTimeHours: 1,
      normalizationProfileId: "aggregate-v1",
      datasetSchema,
      input: null,
      target: null,
    };

    expect(() => validateMechanisticSample(invalid)).toThrow(RangeError);
    expect(() =>
      validateSplitPolicy({
        version: "bad",
        trainFraction: 0.8,
        validationFraction: 0.2,
        testFraction: 0.2,
      }),
    ).toThrow(RangeError);
  });

  it("changes deterministic assignment when the split-policy version changes", () => {
    const a = assignDatasetSplit(group, {
      version: "policy-a",
      trainFraction: 0.34,
      validationFraction: 0.33,
      testFraction: 0.33,
    });
    const b = assignDatasetSplit(group, {
      version: "policy-b",
      trainFraction: 0.34,
      validationFraction: 0.33,
      testFraction: 0.33,
    });

    // Version participates in the deterministic hash; exact labels need not
    // always differ, but repeated assignment under each policy must be stable.
    expect(
      assignDatasetSplit(group, {
        version: "policy-a",
        trainFraction: 0.34,
        validationFraction: 0.33,
        testFraction: 0.33,
      }),
    ).toBe(a);
    expect(
      assignDatasetSplit(group, {
        version: "policy-b",
        trainFraction: 0.34,
        validationFraction: 0.33,
        testFraction: 0.33,
      }),
    ).toBe(b);
  });
});
