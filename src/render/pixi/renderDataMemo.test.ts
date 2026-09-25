import { describe, expect, it } from "vitest";

import { createRevisionMemo } from "./renderDataMemo";

describe("render data revision memo", () => {
  it("reuses one derived product across camera-only redraws", () => {
    const memo = createRevisionMemo<string, number>();
    let computes = 0;

    expect(memo.getOrCompute(4, "density", () => ++computes)).toBe(1);
    expect(memo.getOrCompute(4, "density", () => ++computes)).toBe(1);
    expect(computes).toBe(1);
  });

  it("separates overlay or lineage keys within one scientific frame", () => {
    const memo = createRevisionMemo<string, string>();
    expect(memo.getOrCompute(2, "nutrient", () => "field-a")).toBe("field-a");
    expect(memo.getOrCompute(2, "drug", () => "field-b")).toBe("field-b");
    expect(memo.getOrCompute(2, "nutrient", () => "wrong")).toBe("field-a");
  });

  it("invalidates all derived products when the render-data revision changes", () => {
    const memo = createRevisionMemo<string, number>();
    let computes = 0;
    memo.getOrCompute(8, "contour", () => ++computes);
    expect(memo.getOrCompute(9, "contour", () => ++computes)).toBe(2);
    expect(computes).toBe(2);
  });

  it("does not cache failed computations", () => {
    const memo = createRevisionMemo<string, number>();
    expect(() =>
      memo.getOrCompute(1, "field", () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(memo.getOrCompute(1, "field", () => 7)).toBe(7);
  });

  it("rejects invalid revisions", () => {
    const memo = createRevisionMemo<string, number>();
    expect(() => memo.getOrCompute(-1, "x", () => 1)).toThrow(/revision/);
    expect(() => memo.getOrCompute(1.5, "x", () => 1)).toThrow(/revision/);
  });
});
