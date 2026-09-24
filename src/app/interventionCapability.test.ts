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
  it.each(CASES)("fails closed for %s runtime state", (status, reason) => {
    const view = projectInterventionCapability(status);

    expect(view.available).toBe(false);
    expect(view.reason).toBe(reason);
    expect(view.tools.map((tool) => tool.tool)).toEqual([
      "inoculate",
      "antibiotic",
      "nutrient",
    ]);
    expect(view.tools.every((tool) => tool.available === false)).toBe(true);
  });

  it("explicitly refuses synthetic substitution when runtime is ready", () => {
    const view = projectInterventionCapability("ready");

    expect(view.reason).toBe("authoritative-schema-unavailable");
    expect(view.message).toMatch(/does not expose authoritative intervention commands/i);
    expect(view.message).toMatch(/will not substitute synthetic commands/i);
  });
});
