import { describe, expect, it } from "vitest";

import { buildLineageTree } from "./model";
import { buildLineageTreeVisibilityPlan } from "./lineageTreeVisibility";

const tree = buildLineageTree([
  {
    lineageId: "root",
    parentLineageId: null,
    genotypeId: "WT",
    createdAtHours: 0,
    extinctAtHours: null,
  },
  {
    lineageId: "a",
    parentLineageId: "root",
    genotypeId: "A",
    createdAtHours: 1,
    extinctAtHours: null,
  },
  {
    lineageId: "a1",
    parentLineageId: "a",
    genotypeId: "A1",
    createdAtHours: 2,
    extinctAtHours: null,
  },
  {
    lineageId: "b",
    parentLineageId: "root",
    genotypeId: "B",
    createdAtHours: 3,
    extinctAtHours: null,
  },
  {
    lineageId: "b1",
    parentLineageId: "b",
    genotypeId: "B1",
    createdAtHours: 4,
    extinctAtHours: null,
  },
  {
    lineageId: "c",
    parentLineageId: "root",
    genotypeId: "C",
    createdAtHours: 5,
    extinctAtHours: null,
  },
]);

describe("buildLineageTreeVisibilityPlan", () => {
  it("keeps only authoritative nodes while counting hidden descendants exactly", () => {
    const plan = buildLineageTreeVisibilityPlan(tree, {
      maxVisibleNodes: 3,
    });

    expect(plan.nodes.map((node) => node.lineageId)).toEqual([
      "root",
      "a",
      "b",
    ]);
    expect(plan.edges).toEqual([
      { parentLineageId: "root", childLineageId: "a" },
      { parentLineageId: "root", childLineageId: "b" },
    ]);
    expect(plan.hiddenLineageCount).toBe(3);
    expect(plan.collapsedFrontiers).toEqual([
      { lineageId: "root", hiddenDescendantCount: 1 },
      { lineageId: "a", hiddenDescendantCount: 1 },
      { lineageId: "b", hiddenDescendantCount: 1 },
    ]);
    expect(plan.budgetExceededForPreservedAncestry).toBe(false);
  });

  it("preserves a selected lineage and every ancestor needed to interpret it", () => {
    const plan = buildLineageTreeVisibilityPlan(tree, {
      maxVisibleNodes: 3,
      preserveLineageIds: ["b1"],
    });

    expect(plan.nodes.map((node) => node.lineageId)).toEqual([
      "root",
      "b",
      "b1",
    ]);
    expect(plan.edges).toEqual([
      { parentLineageId: "root", childLineageId: "b" },
      { parentLineageId: "b", childLineageId: "b1" },
    ]);
    expect(plan.collapsedFrontiers).toEqual([
      { lineageId: "root", hiddenDescendantCount: 3 },
    ]);
  });

  it("lets preserved root ancestry exceed the presentation budget rather than hiding truth", () => {
    const plan = buildLineageTreeVisibilityPlan(tree, {
      maxVisibleNodes: 2,
      preserveLineageIds: ["b1"],
    });

    expect(plan.nodes.map((node) => node.lineageId)).toEqual([
      "root",
      "b",
      "b1",
    ]);
    expect(plan.budgetExceededForPreservedAncestry).toBe(true);
    expect(plan.maxVisibleNodes).toBe(2);
  });

  it("fails closed on invalid budgets and unknown preserved lineage ids", () => {
    expect(() =>
      buildLineageTreeVisibilityPlan(tree, { maxVisibleNodes: 0 }),
    ).toThrow(/positive safe integer/);

    expect(() =>
      buildLineageTreeVisibilityPlan(tree, {
        maxVisibleNodes: 3,
        preserveLineageIds: ["missing"],
      }),
    ).toThrow(/unknown preserved lineage/);
  });
});
