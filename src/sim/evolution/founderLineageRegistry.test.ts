import { describe, expect, it } from "vitest";
import { LineageRegistry } from "./lineage";
import { initializeFounderLineageRegistry } from "./founderLineageRegistry";

describe("founder lineage registry initialization", () => {
  it("maps ordered static founder definitions onto deterministic runtime IDs", () => {
    const initialized = initializeFounderLineageRegistry([
      { founderId: "founder-wt", genotypeId: "WT" },
      { founderId: "founder-variant", genotypeId: "VAR" },
    ]);

    expect(initialized.bindings).toEqual([
      { founderId: "founder-wt", lineageId: "L1", genotypeId: "WT" },
      {
        founderId: "founder-variant",
        lineageId: "L2",
        genotypeId: "VAR",
      },
    ]);
    expect(initialized.checkpoint.records).toEqual([
      {
        lineageId: "L1",
        parentLineageId: null,
        genotypeId: "WT",
        createdAtHours: 0,
        originCellIndex: null,
        mutationClass: null,
        extinctAtHours: null,
      },
      {
        lineageId: "L2",
        parentLineageId: null,
        genotypeId: "VAR",
        createdAtHours: 0,
        originCellIndex: null,
        mutationClass: null,
        extinctAtHours: null,
      },
    ]);
    expect(initialized.checkpoint.nextId).toBe(3);
  });

  it("preserves allocator continuity for the first mutation child after restore", () => {
    const initialized = initializeFounderLineageRegistry([
      { founderId: "founder-wt", genotypeId: "WT" },
      { founderId: "founder-variant", genotypeId: "VAR" },
    ]);
    const registry = LineageRegistry.restore(initialized.checkpoint);

    const child = registry.create({
      parentLineageId: "L1",
      genotypeId: "MUT",
      createdAtHours: 0.25,
      originCellIndex: 7,
      mutationClass: "target-site",
    });

    expect(child.lineageId).toBe("L3");
    expect(child.parentLineageId).toBe("L1");
    expect(registry.checkpoint().nextId).toBe(4);
  });

  it("is deterministic for the same ordered founder definitions", () => {
    const founders = [
      { founderId: "founder-a", genotypeId: "WT" },
      { founderId: "founder-b", genotypeId: "WT" },
    ] as const;

    expect(initializeFounderLineageRegistry(founders)).toEqual(
      initializeFounderLineageRegistry(founders),
    );
  });

  it("fails closed on duplicate, sparse, or non-canonical founder identity", () => {
    expect(() =>
      initializeFounderLineageRegistry([
        { founderId: "founder-a", genotypeId: "WT" },
        { founderId: "founder-a", genotypeId: "VAR" },
      ]),
    ).toThrow(/definition ids must be unique/);

    const sparse = Array(1) as {
      founderId: string;
      genotypeId: string;
    }[];
    expect(() => initializeFounderLineageRegistry(sparse)).toThrow(/dense/);

    expect(() =>
      initializeFounderLineageRegistry([
        { founderId: " founder-a ", genotypeId: "WT" },
      ]),
    ).toThrow(/canonical non-empty string/);

    expect(() =>
      initializeFounderLineageRegistry([
        { founderId: "founder-a", genotypeId: " WT " },
      ]),
    ).toThrow(/canonical non-empty string/);
  });
});
