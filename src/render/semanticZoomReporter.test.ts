import { describe, expect, it } from "vitest";

import { resolveSemanticZoomReport } from "./semanticZoomReporter";

describe("resolveSemanticZoomReport", () => {
  it("reports the initial whole-dish level once", () => {
    expect(resolveSemanticZoomReport(null, 1)).toEqual({
      level: "dish",
      changed: true,
    });
    expect(resolveSemanticZoomReport("dish", 1.8)).toEqual({
      level: "dish",
      changed: false,
    });
  });

  it("notifies only when named semantic thresholds are crossed", () => {
    expect(resolveSemanticZoomReport("dish", 2.25)).toEqual({
      level: "colony",
      changed: true,
    });
    expect(resolveSemanticZoomReport("colony", 6.9)).toEqual({
      level: "colony",
      changed: false,
    });
    expect(resolveSemanticZoomReport("colony", 7)).toEqual({
      level: "representative-cell",
      changed: true,
    });
    expect(resolveSemanticZoomReport("representative-cell", 8.5)).toEqual({
      level: "representative-cell",
      changed: false,
    });
  });

  it("reports reset and zoom-out transitions back to whole-dish", () => {
    expect(resolveSemanticZoomReport("representative-cell", 1)).toEqual({
      level: "dish",
      changed: true,
    });
  });
});
