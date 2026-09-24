import { describe, expect, it } from "vitest";

import {
  projectInterventionCapability,
  type InterventionUnavailableReason,
} from "./interventionCapability";
import type { RuntimeUiStatus } from "./runtimeView";

const CASES: readonly [
  RuntimeUiStatus,
  InterventionUnavailableReason,
][] = [
  ["unavailable", "runtime-unavailable"],
  ["starting", "runtime-starting"],
  ["pending", "runtime-pending"],
  ["error", "runtime-error"],
  ["ready", "authoritative-schema-unavailable"],
];

describe("projectInterventionCapability", () => {
  it.each(CASES)("fails scientific application closed for %s runtime state", (status, reason) => {
    const view = projectInterventionCapability(status);

    expect(view.available).toBe(false);
    expect(view.reason).toBe(reason);
    expect(view.tools.map((tool) => tool.tool)).toEqual([
      "inoculate",
      "fungus",
      "antibiotic",
      "nutrient",
    ]);
    expect(view.tools.every((tool) => tool.available === false)).toBe(true);
  });

  it("keeps presentation-only placement usable during ready and pending runtime states", () => {
    expect(projectInterventionCapability("ready").previewAvailable).toBe(true);
    expect(projectInterventionCapability("pending").previewAvailable).toBe(true);
    for (const status of ["unavailable", "starting", "error"] as const) {
      expect(projectInterventionCapability(status).previewAvailable).toBe(false);
    }
  });

  it("explicitly refuses synthetic substitution when runtime is ready", () => {
    const view = projectInterventionCapability("ready");

    expect(view.reason).toBe("authoritative-schema-unavailable");
    expect(view.message).toMatch(/placement preview is available/i);
    expect(view.message).toMatch(/does not expose authoritative intervention commands/i);
    expect(view.message).toMatch(/will not substitute synthetic commands/i);
  });
});
