import { describe, expect, it } from "vitest";
import {
  resolveTimeBoundCompareSurface,
  type TimeBoundCompareSurface,
} from "./timeBoundSurface";

function surface(
  branchId = "left",
  simulationTimeHours = 4,
): TimeBoundCompareSurface<string> {
  return {
    identity: {
      kind: "authoritative-sample",
      branchId,
      sampleId: `${branchId}-sample-${simulationTimeHours}`,
      simulationTimeHours,
    },
    content: "scientific surface",
  };
}

describe("time-bound compare surfaces", () => {
  it("accepts an exact authoritative branch/time identity", () => {
    const resolved = resolveTimeBoundCompareSurface({
      expectedBranchId: "left",
      expectedTimeHours: 4,
      surface: surface(),
    });

    expect(resolved.status).toBe("ready");
    expect(resolved.mismatchReason).toBeNull();
    expect(resolved.surface.identity.sampleId).toBe("left-sample-4");
  });

  it("quarantines a surface from the wrong branch", () => {
    const resolved = resolveTimeBoundCompareSurface({
      expectedBranchId: "left",
      expectedTimeHours: 4,
      surface: surface("right", 4),
    });

    expect(resolved.status).toBe("mismatch");
    expect(resolved.mismatchReason).toBe("branch");
    expect(resolved.warning).toMatch(/does not match expected branch/i);
  });

  it("quarantines latest-state content under an older synchronized label", () => {
    const resolved = resolveTimeBoundCompareSurface({
      expectedBranchId: "left",
      expectedTimeHours: 4,
      surface: surface("left", 5),
    });

    expect(resolved.status).toBe("mismatch");
    expect(resolved.mismatchReason).toBe("time");
    expect(resolved.warning).toMatch(/does not match expected synchronized time/i);
  });

  it("requires exact authoritative sample time rather than implicit interpolation", () => {
    const resolved = resolveTimeBoundCompareSurface({
      expectedBranchId: "left",
      expectedTimeHours: 4,
      surface: surface("left", 4.000001),
    });

    expect(resolved.status).toBe("mismatch");
  });

  it("rejects malformed authoritative identity", () => {
    expect(() =>
      resolveTimeBoundCompareSurface({
        expectedBranchId: "left",
        expectedTimeHours: 4,
        surface: {
          identity: {
            kind: "authoritative-sample",
            branchId: "left",
            sampleId: "",
            simulationTimeHours: 4,
          },
          content: "surface",
        },
      }),
    ).toThrow(/sample id/i);

    expect(() =>
      resolveTimeBoundCompareSurface({
        expectedBranchId: "left",
        expectedTimeHours: -1,
        surface: surface(),
      }),
    ).toThrow(/finite and non-negative/i);
  });
});
