import { describe, expect, it } from "vitest";

import {
  projectInterventionCapability,
  type InterventionUnavailableReason,
} from "./interventionCapability";
import { CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION } from "./ciprofloxacinToolAuthority";
import type { RuntimeUiStatus } from "./runtimeView";

const CASES: readonly [
  RuntimeUiStatus,
  InterventionUnavailableReason,
][] = [
  ["unavailable", "runtime-unavailable"],
  ["starting", "runtime-starting"],
  ["pending", "runtime-pending"],
  ["error", "runtime-error"],
  ["ready", "authoritative-metadata-unavailable"],
];

const metadata = {
  schemaVersion: CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION,
  tool: "antibiotic",
  protocolCommand: "apply-ciprofloxacin",
  parameter: {
    key: "concentration",
    label: "Ciprofloxacin concentration",
    unit: "mg/L",
    minimum: 0,
    maximum: 2,
    defaultValue: 0.125,
    precision: 3,
  },
  supportedGeometries: ["global", "radial", "stripe", "paint"],
  blendMode: "set",
} as const;

describe("projectInterventionCapability", () => {
  it.each(CASES)(
    "fails scientific application closed for %s runtime state without metadata",
    (status, reason) => {
      const view = projectInterventionCapability(status);

      expect(view.available).toBe(false);
      expect(view.reason).toBe(reason);
      expect(view.ciprofloxacinAuthority).toBeNull();
      expect(view.tools.map((tool) => tool.tool)).toEqual([
        "inoculate",
        "fungus",
        "antibiotic",
        "nutrient",
      ]);
      expect(view.tools.every((tool) => tool.available === false)).toBe(true);
    },
  );

  it("keeps presentation-only placement usable during ready and pending runtime states", () => {
    expect(projectInterventionCapability("ready").previewAvailable).toBe(true);
    expect(
      projectInterventionCapability("pending", metadata).previewAvailable,
    ).toBe(true);
    for (const status of ["unavailable", "starting", "error"] as const) {
      expect(
        projectInterventionCapability(status, metadata).previewAvailable,
      ).toBe(false);
    }
  });

  it("reports the actual ready-state blocker instead of claiming protocol v5 lacks commands", () => {
    const view = projectInterventionCapability("ready");

    expect(view.reason).toBe("authoritative-metadata-unavailable");
    expect(view.message).toMatch(/protocol v5 supports authoritative ciprofloxacin/i);
    expect(view.message).toMatch(/has not supplied exact intervention bounds, default/i);
    expect(view.message).toMatch(/will not infer dose controls from mic values or test fixtures/i);
    expect(view.message).not.toMatch(/protocol does not expose/i);
  });

  it("enables only antibiotic application when ready metadata validates", () => {
    const view = projectInterventionCapability("ready", metadata);

    expect(view.available).toBe(true);
    expect(view.reason).toBeNull();
    expect(view.ciprofloxacinAuthority).toEqual(metadata);
    expect(
      view.tools.map(({ tool, available }) => [tool, available]),
    ).toEqual([
      ["inoculate", false],
      ["fungus", false],
      ["antibiotic", true],
      ["nutrient", false],
    ]);
  });

  it("fails malformed metadata closed without surfacing parser diagnostics as product copy", () => {
    const view = projectInterventionCapability("ready", {
      ...metadata,
      parameter: { ...metadata.parameter, maximum: -1 },
    });

    expect(view.available).toBe(false);
    expect(view.reason).toBe("authoritative-metadata-invalid");
    expect(view.ciprofloxacinAuthority).toBeNull();
    expect(view.message).toMatch(/supplied invalid ciprofloxacin intervention metadata/i);
    expect(view.message).not.toMatch(/maximum/);
    expect(view.tools.every((tool) => tool.available === false)).toBe(true);
  });

  it("never allows a busy worker to apply even when metadata is valid", () => {
    const view = projectInterventionCapability("pending", metadata);

    expect(view.available).toBe(false);
    expect(view.reason).toBe("runtime-pending");
    expect(view.tools.every((tool) => tool.available === false)).toBe(true);
  });
});
