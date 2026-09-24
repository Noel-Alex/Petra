import { describe, expect, it } from "vitest";

import { LineageRegistry } from "./lineage";
import {
  materializeSpatialMutationLineages,
} from "./materializeMutationLineages";
import type { SpatialMutationBatchResult } from "./spatialMutation";

function registryCheckpoint() {
  const registry = new LineageRegistry();
  registry.create({
    parentLineageId: null,
    genotypeId: "WT",
    createdAtHours: 0,
    originCellIndex: 2,
    mutationClass: null,
  });
  registry.create({
    parentLineageId: null,
    genotypeId: "A",
    createdAtHours: 0,
    originCellIndex: 7,
    mutationClass: null,
  });
  return registry.checkpoint();
}

function batch(): SpatialMutationBatchResult {
  return {
    populationConfigurationIdentity: "population-config-v1",
    populationRevision: 12,
    samplingPolicyIdentity: "sampling-policy-v1",
    cells: [
      {
        sourceLineageId: "L1",
        sourceGenotypeId: "WT",
        cellIndex: 4,
        divisionOpportunities: 5,
        mutationBirths: [
          {
            targetGenotypeId: "A",
            mutationClass: "target-site",
            citationKey: "source-a",
            count: 2,
          },
          {
            targetGenotypeId: "B",
            mutationClass: "regulatory",
            citationKey: "source-b",
            count: 1,
          },
        ],
        sampling: { mode: "exact", rngDraws: 5 },
      },
      {
        sourceLineageId: "L2",
        sourceGenotypeId: "A",
        cellIndex: 9,
        divisionOpportunities: 3,
        mutationBirths: [
          {
            targetGenotypeId: "B",
            mutationClass: "target-site",
            citationKey: "source-c",
            count: 1,
          },
        ],
        sampling: { mode: "exact", rngDraws: 3 },
      },
    ],
    totalDivisionOpportunities: 8,
    totalMutantBirths: 4,
    rngDraws: 8,
  };
}

describe("mutation child-lineage materialization", () => {
  it("creates one deterministic child lineage per sampled mutant birth", () => {
    const result = materializeSpatialMutationLineages({
      lineageCheckpoint: registryCheckpoint(),
      mutationBatch: batch(),
      createdAtHours: 1.5,
      maxMaterializedChildren: 10,
    });

    expect(result.children.map((child) => child.lineageId)).toEqual([
      "L3",
      "L4",
      "L5",
      "L6",
    ]);
    expect(result.children).toEqual([
      {
        lineageId: "L3",
        parentLineageId: "L1",
        sourceGenotypeId: "WT",
        targetGenotypeId: "A",
        originCellIndex: 4,
        createdAtHours: 1.5,
        mutationClass: "target-site",
        citationKey: "source-a",
        birthOrdinal: 0,
      },
      {
        lineageId: "L4",
        parentLineageId: "L1",
        sourceGenotypeId: "WT",
        targetGenotypeId: "A",
        originCellIndex: 4,
        createdAtHours: 1.5,
        mutationClass: "target-site",
        citationKey: "source-a",
        birthOrdinal: 1,
      },
      {
        lineageId: "L5",
        parentLineageId: "L1",
        sourceGenotypeId: "WT",
        targetGenotypeId: "B",
        originCellIndex: 4,
        createdAtHours: 1.5,
        mutationClass: "regulatory",
        citationKey: "source-b",
        birthOrdinal: 0,
      },
      {
        lineageId: "L6",
        parentLineageId: "L2",
        sourceGenotypeId: "A",
        targetGenotypeId: "B",
        originCellIndex: 9,
        createdAtHours: 1.5,
        mutationClass: "target-site",
        citationKey: "source-c",
        birthOrdinal: 0,
      },
    ]);
    expect(result.lineageCheckpoint.nextId).toBe(7);
    expect(result.lineageCheckpoint.records).toHaveLength(6);
  });

  it("does not mutate the caller checkpoint", () => {
    const before = registryCheckpoint();
    const serialized = JSON.stringify(before);

    materializeSpatialMutationLineages({
      lineageCheckpoint: before,
      mutationBatch: batch(),
      createdAtHours: 1,
      maxMaterializedChildren: 10,
    });

    expect(JSON.stringify(before)).toBe(serialized);
    expect(before.nextId).toBe(3);
  });

  it("is replay-stable for the same checkpoint, batch, and creation time", () => {
    const args = {
      lineageCheckpoint: registryCheckpoint(),
      mutationBatch: batch(),
      createdAtHours: 2,
      maxMaterializedChildren: 10,
    };

    expect(materializeSpatialMutationLineages(args)).toEqual(
      materializeSpatialMutationLineages(args),
    );
  });

  it("fails closed when the sampled source genotype disagrees with registry authority", () => {
    const malformed = batch();
    const cells = malformed.cells.map((cell, index) =>
      index === 0 ? { ...cell, sourceGenotypeId: "FOREIGN" } : cell,
    );

    expect(() =>
      materializeSpatialMutationLineages({
        lineageCheckpoint: registryCheckpoint(),
        mutationBatch: { ...malformed, cells },
        createdAtHours: 1,
        maxMaterializedChildren: 10,
      }),
    ).toThrow(/source genotype does not match/);
  });

  it("rejects creation after an authoritative parent extinction", () => {
    const registry = LineageRegistry.restore(registryCheckpoint());
    registry.markExtinct("L1", 0.5);

    expect(() =>
      materializeSpatialMutationLineages({
        lineageCheckpoint: registry.checkpoint(),
        mutationBatch: batch(),
        createdAtHours: 1,
        maxMaterializedChildren: 10,
      }),
    ).toThrow(/not alive/);
  });

  it("refuses the whole transaction before creation when runtime work exceeds its ceiling", () => {
    const before = registryCheckpoint();

    expect(() =>
      materializeSpatialMutationLineages({
        lineageCheckpoint: before,
        mutationBatch: batch(),
        createdAtHours: 1,
        maxMaterializedChildren: 3,
      }),
    ).toThrow(/work ceiling/);

    expect(before.nextId).toBe(3);
    expect(before.records).toHaveLength(2);
  });

  it("rejects tampered aggregate mutation counts and duplicate source-cell outcomes", () => {
    const input = batch();

    expect(() =>
      materializeSpatialMutationLineages({
        lineageCheckpoint: registryCheckpoint(),
        mutationBatch: { ...input, totalMutantBirths: 5 },
        createdAtHours: 1,
        maxMaterializedChildren: 10,
      }),
    ).toThrow(/reported mutant births/);

    expect(() =>
      materializeSpatialMutationLineages({
        lineageCheckpoint: registryCheckpoint(),
        mutationBatch: {
          ...input,
          cells: [...input.cells, input.cells[0]!],
          totalMutantBirths: 7,
        },
        createdAtHours: 1,
        maxMaterializedChildren: 10,
      }),
    ).toThrow(/repeat one source-lineage\/cell/);
  });
});
