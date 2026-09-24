/** Sampler-validation fixture only: probabilities such as 0.02, 0.05, 0.1,
 * 0.3, and 0.4 below are synthetic stress-test values, not biological mutation rates. */
import { describe, expect, it } from "vitest";
import { SimulationRng } from "../rng";
import {
  BOUNDED_HYBRID_BINOMIAL_V1,
  SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  SamplingPolicyRefusal,
  type SamplingExecutionPolicy,
} from "../samplingPolicy";
import {
  sampleDivisionMutations,
  sampleDivisionMutationsWithPolicy,
} from "./mutation";

const exactPolicy: SamplingExecutionPolicy = {
  schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  id: "mutation-reference-test",
  exactTrialBudgets: {
    bernoulli: 200_000,
    categorical: 200_000,
  },
  acceleratedBinomial: BOUNDED_HYBRID_BINOMIAL_V1,
};

const acceleratedPolicy: SamplingExecutionPolicy = {
  schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
  id: "mutation-accelerated-test",
  exactTrialBudgets: {
    bernoulli: 10,
    categorical: 10,
  },
  acceleratedBinomial: BOUNDED_HYBRID_BINOMIAL_V1,
};

describe("division-linked mutation sampling", () => {
  it("produces no mutants when all edge probabilities are zero", () => {
    const result = sampleDivisionMutations(
      10_000,
      [{ genotypeId: "gyrA", probabilityPerDivision: 0 }],
      new SimulationRng(7),
      exactPolicy,
    );
    expect(result).toEqual([{ genotypeId: "gyrA", count: 0 }]);
  });

  it("never creates more mutant births than divisions", () => {
    const divisions = 500;
    const result = sampleDivisionMutations(
      divisions,
      [
        { genotypeId: "A", probabilityPerDivision: 0.3 },
        { genotypeId: "B", probabilityPerDivision: 0.4 },
      ],
      new SimulationRng(11),
      exactPolicy,
    );
    expect(result.reduce((sum, target) => sum + target.count, 0)).toBeLessThanOrEqual(
      divisions,
    );
  });

  it("replays the same exact mutation counts from the same RNG state", () => {
    const targets = [
      { genotypeId: "A", probabilityPerDivision: 0.05 },
      { genotypeId: "B", probabilityPerDivision: 0.1 },
    ] as const;
    expect(
      sampleDivisionMutations(1_000, targets, new SimulationRng(42), exactPolicy),
    ).toEqual(
      sampleDivisionMutations(1_000, targets, new SimulationRng(42), exactPolicy),
    );
  });

  it("rejects mutation classes whose probabilities exceed one division", () => {
    expect(() =>
      sampleDivisionMutations(
        1,
        [
          { genotypeId: "A", probabilityPerDivision: 0.6 },
          { genotypeId: "B", probabilityPerDivision: 0.5 },
        ],
        new SimulationRng(1),
        exactPolicy,
      ),
    ).toThrow(/sum above 1/);
  });

  it("matches the expected categorical frequency over a deterministic large exact fixture", () => {
    const divisions = 100_000;
    const probability = 0.02;
    const [result] = sampleDivisionMutations(
      divisions,
      [{ genotypeId: "A", probabilityPerDivision: probability }],
      new SimulationRng(1234),
      exactPolicy,
    );
    const expected = divisions * probability;
    const sigma = Math.sqrt(divisions * probability * (1 - probability));
    expect(Math.abs(result!.count - expected)).toBeLessThan(5 * sigma);
  });

  it("refuses exact work above the caller-owned categorical budget", () => {
    const disabled: SamplingExecutionPolicy = {
      ...acceleratedPolicy,
      acceleratedBinomial: "disabled",
    };
    expect(() =>
      sampleDivisionMutations(
        11,
        [{ genotypeId: "A", probabilityPerDivision: 0.1 }],
        new SimulationRng(1),
        disabled,
      ),
    ).toThrow(SamplingPolicyRefusal);
  });

  it("accelerates huge mutually-exclusive counts without exceeding divisions", () => {
    const divisions = 2_000_000_000;
    const result = sampleDivisionMutationsWithPolicy(
      divisions,
      [
        { genotypeId: "A", probabilityPerDivision: 0.03 },
        { genotypeId: "B", probabilityPerDivision: 0.07 },
      ],
      new SimulationRng(99),
      acceleratedPolicy,
    );

    expect(result.execution).toBe("accelerated");
    expect(result.algorithm).toBe(BOUNDED_HYBRID_BINOMIAL_V1);
    expect(
      result.counts.reduce((sum, target) => sum + target.count, 0),
    ).toBeLessThanOrEqual(divisions);
    for (const count of result.counts) {
      expect(count.count).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps zero/one categorical limits exact under acceleration", () => {
    const result = sampleDivisionMutationsWithPolicy(
      1_000_000,
      [
        { genotypeId: "A", probabilityPerDivision: 0 },
        { genotypeId: "B", probabilityPerDivision: 1 },
      ],
      new SimulationRng(5),
      acceleratedPolicy,
    );
    expect(result.counts).toEqual([
      { genotypeId: "A", count: 0 },
      { genotypeId: "B", count: 1_000_000 },
    ]);
  });

  it("tracks exact multinomial category means across many deterministic seeds", () => {
    const divisions = 1_000;
    const targets = [
      { genotypeId: "A", probabilityPerDivision: 0.2 },
      { genotypeId: "B", probabilityPerDivision: 0.3 },
    ] as const;
    const seeds = 1_000;
    let exactA = 0;
    let exactB = 0;
    let acceleratedA = 0;
    let acceleratedB = 0;

    for (let seed = 1; seed <= seeds; seed += 1) {
      const exact = sampleDivisionMutations(
        divisions,
        targets,
        new SimulationRng(seed),
        exactPolicy,
      );
      const accelerated = sampleDivisionMutationsWithPolicy(
        divisions,
        targets,
        new SimulationRng(seed),
        acceleratedPolicy,
      ).counts;
      exactA += exact[0]!.count;
      exactB += exact[1]!.count;
      acceleratedA += accelerated[0]!.count;
      acceleratedB += accelerated[1]!.count;
    }

    expect(Math.abs(acceleratedA / seeds - exactA / seeds)).toBeLessThan(3);
    expect(Math.abs(acceleratedB / seeds - exactB / seeds)).toBeLessThan(3);
  });
});
