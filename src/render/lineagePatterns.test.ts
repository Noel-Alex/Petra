import { describe, expect, it } from "vitest";

import {
  LINEAGE_PATTERN_SCHEMA_VERSION,
  LINEAGE_PATTERN_TOKENS,
  isLineagePatternToken,
  resolveLineagePattern,
} from "./lineagePatterns";

describe("lineage pattern geometry", () => {
  it("keeps a bounded versioned pattern vocabulary", () => {
    expect(LINEAGE_PATTERN_SCHEMA_VERSION).toBe(1);
    expect(LINEAGE_PATTERN_TOKENS).toEqual([
      "solid-ring",
      "double-ring",
    ]);
  });

  it("resolves supported tokens to distinct non-color ring geometry", () => {
    const solid = resolveLineagePattern("solid-ring");
    const double = resolveLineagePattern("double-ring");

    expect(solid.ringScales).toEqual([1]);
    expect(double.ringScales).toEqual([1, 1.45]);
    expect(double.ringScales).not.toEqual(solid.ringScales);
  });

  it("rejects arbitrary strings instead of silently treating them as accessible identity", () => {
    expect(isLineagePatternToken("solid-ring")).toBe(true);
    expect(isLineagePatternToken("double-ring")).toBe(true);
    expect(isLineagePatternToken("dotted-maybe")).toBe(false);
    expect(() => resolveLineagePattern("dotted-maybe")).toThrow(
      /unsupported lineage pattern token/,
    );
  });
});
