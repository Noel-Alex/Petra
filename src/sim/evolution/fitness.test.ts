import { describe, expect, it } from "vitest";

import { buildCuratedMutationGraph } from "./graph";
import { bindLineageFitness } from "./fitness";

function scenario(overrides: Record<string, unknown> = {}) {
  return {
    id: "flagship",
    version: "1",
    genotypes: [
      { id: "WT", relativeFitness: 1 },
      { id: "AD", relativeFitness: 0.86 },
      { id: "A", relativeFitness: 1.01 },
    ],
    mutationTransitions: [
      {
        from: "WT",
        to: "A",
        probabilityPerDivision: 1e-10,
        classification: "model_target_probability",
        citation: "source-a",
      },
    ],
    ...overrides,
  };
}

describe("genotype to lineage fitness binding", () => {
  it("projects curated genotype fitness in caller lineage-channel order", () => {
    const graph = buildCuratedMutationGraph(scenario());

    expect(
      bindLineageFitness(
        graph,
        { scenarioId: "flagship", scenarioVersion: "1" },
        [
          { lineageId: "L9", genotypeId: "AD" },
          { lineageId: "L2", genotypeId: "WT" },
          { lineageId: "L11", genotypeId: "A" },
        ],
      ),
    ).toEqual([
      { lineageId: "L9", genotypeId: "AD", relativeFitness: 0.86 },
      { lineageId: "L2", genotypeId: "WT", relativeFitness: 1 },
      { lineageId: "L11", genotypeId: "A", relativeFitness: 1.01 },
    ]);
  });

  it("refuses a graph from a different scenario or scenario version", () => {
    const graph = buildCuratedMutationGraph(scenario());

    expect(() =>
      bindLineageFitness(
        graph,
        { scenarioId: "other", scenarioVersion: "1" },
        [{ lineageId: "L1", genotypeId: "WT" }],
      ),
    ).toThrow(/scenario mismatch/);

    expect(() =>
      bindLineageFitness(
        graph,
        { scenarioId: "flagship", scenarioVersion: "2" },
        [{ lineageId: "L1", genotypeId: "WT" }],
      ),
    ).toThrow(/scenario mismatch/);
  });

  it("rejects duplicate active lineage ids rather than aliasing channels", () => {
    const graph = buildCuratedMutationGraph(scenario());

    expect(() =>
      bindLineageFitness(
        graph,
        { scenarioId: "flagship", scenarioVersion: "1" },
        [
          { lineageId: "L1", genotypeId: "WT" },
          { lineageId: "L1", genotypeId: "AD" },
        ],
      ),
    ).toThrow(/duplicate active lineage id: L1/);
  });

  it("rejects an unknown genotype instead of inventing a neutral fitness", () => {
    const graph = buildCuratedMutationGraph(scenario());

    expect(() =>
      bindLineageFitness(
        graph,
        { scenarioId: "flagship", scenarioVersion: "1" },
        [{ lineageId: "L1", genotypeId: "unknown" }],
      ),
    ).toThrow(/unknown genotype: unknown/);
  });

  it("does not derive fitness from unrelated drug or MIC metadata", () => {
    const baseline = buildCuratedMutationGraph(
      scenario({ drug: { concentration: 0.1 }, mic_mg_L: 0.016 }),
    );
    const altered = buildCuratedMutationGraph(
      scenario({ drug: { concentration: 999 }, mic_mg_L: 999 }),
    );
    const lineages = [{ lineageId: "L1", genotypeId: "AD" }] as const;
    const identity = { scenarioId: "flagship", scenarioVersion: "1" } as const;

    expect(bindLineageFitness(baseline, identity, lineages)).toEqual(
      bindLineageFitness(altered, identity, lineages),
    );
  });

  it("returns an isolated immutable binding array", () => {
    const graph = buildCuratedMutationGraph(scenario());
    const bindings = bindLineageFitness(
      graph,
      { scenarioId: "flagship", scenarioVersion: "1" },
      [{ lineageId: "L1", genotypeId: "WT" }],
    );

    expect(Object.isFrozen(bindings)).toBe(true);
    expect(Object.isFrozen(bindings[0])).toBe(true);
  });
});
