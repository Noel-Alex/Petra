import { describe, expect, it } from "vitest";

import {
  CIPROFLOXACIN_COMMIT_AUTHORITY_SCHEMA_VERSION,
  assertCiprofloxacinCommitAuthority,
  ciprofloxacinCommitAuthorityIdentity,
  planCiprofloxacinInterventionCommand,
  type CiprofloxacinCommitAuthority,
} from "./ciprofloxacinInterventionAdapter";
import type { InterventionCommitIntent } from "../ui/interventionPreview";

function authority(
  overrides: Partial<CiprofloxacinCommitAuthority> = {},
): CiprofloxacinCommitAuthority {
  return {
    schemaVersion: CIPROFLOXACIN_COMMIT_AUTHORITY_SCHEMA_VERSION,
    tool: "antibiotic",
    concentration: {
      parameterKey: "ciprofloxacin-concentration",
      label: "Ciprofloxacin concentration",
      unit: "mg/L",
      min: 0,
      max: 1,
      defaultValue: 0.125,
    },
    blendMode: "set",
    supportedGeometry: ["global", "radial", "stripe", "paint"],
    ...overrides,
  };
}

function intent(
  overrides: Partial<InterventionCommitIntent> = {},
): InterventionCommitIntent {
  return {
    type: "apply-intervention",
    intentId: "preview-1",
    tool: "antibiotic",
    geometry: {
      kind: "radial",
      center: { x: 0.25, y: 0.75 },
      radiusFraction: 0.2,
    },
    parameters: [
      {
        key: "ciprofloxacin-concentration",
        value: 0.25,
        unit: "mg/L",
      },
    ],
    ...overrides,
  };
}

describe("ciprofloxacin intervention commit adapter", () => {
  it("plans an exact protocol-v5 antibiotic command from supplied authority", () => {
    const metadata = authority();
    const result = planCiprofloxacinInterventionCommand(
      intent(),
      metadata,
      "command-1",
    );

    expect(result).toEqual({
      status: "ready",
      sourceIntentId: "preview-1",
      authorityIdentity: ciprofloxacinCommitAuthorityIdentity(metadata),
      command: {
        id: "command-1",
        type: "apply-ciprofloxacin",
        intervention: {
          schemaVersion: 1,
          concentrationMgPerL: 0.25,
          concentrationUnit: "mg/L",
          blendMode: "set",
          geometry: {
            kind: "radial",
            center: { x: 0.25, y: 0.75 },
            radiusFraction: 0.2,
          },
        },
      },
    });
  });

  it("preserves supported global, stripe, and paint geometry without reinterpretation", () => {
    const cases: InterventionCommitIntent["geometry"][] = [
      { kind: "global" },
      {
        kind: "stripe",
        axis: "x",
        centerFraction: 0.4,
        widthFraction: 0.1,
      },
      {
        kind: "paint",
        samples: [
          { x: 0.2, y: 0.3 },
          { x: 0.6, y: 0.7 },
        ],
        brushRadiusFraction: 0.05,
      },
    ];

    for (const geometry of cases) {
      const result = planCiprofloxacinInterventionCommand(
        intent({ geometry }),
        authority(),
        `command-${geometry.kind}`,
      );
      expect(result.status).toBe("ready");
      if (result.status !== "ready") throw new Error(result.message);
      expect(result.command.intervention.geometry).toEqual(geometry);
    }
  });

  it("refuses point geometry instead of inventing a biological footprint", () => {
    const result = planCiprofloxacinInterventionCommand(
      intent({
        geometry: { kind: "point", point: { x: 0.5, y: 0.5 } },
      }),
      authority(),
      "command-point",
    );

    expect(result).toMatchObject({
      status: "refused",
      reason: "unsupported-geometry",
    });
    if (result.status !== "refused") throw new Error("expected refusal");
    expect(result.message).toContain("will not be expanded");
  });

  it("refuses non-antibiotic tools and unsupported geometry metadata", () => {
    expect(
      planCiprofloxacinInterventionCommand(
        intent({ tool: "nutrient" }),
        authority(),
        "command-nutrient",
      ),
    ).toMatchObject({
      status: "refused",
      reason: "unsupported-tool",
    });

    expect(
      planCiprofloxacinInterventionCommand(
        intent(),
        authority({ supportedGeometry: ["global"] }),
        "command-radial",
      ),
    ).toMatchObject({
      status: "refused",
      reason: "unsupported-geometry",
    });
  });

  it("requires the exact authoritative parameter key and unit", () => {
    expect(
      planCiprofloxacinInterventionCommand(
        intent({
          parameters: [
            {
              key: "dose",
              value: 0.25,
              unit: "mg/L",
            },
          ],
        }),
        authority(),
        "command-key",
      ),
    ).toMatchObject({
      status: "refused",
      reason: "parameter-shape-mismatch",
    });

    expect(
      planCiprofloxacinInterventionCommand(
        intent({
          parameters: [
            {
              key: "ciprofloxacin-concentration",
              value: 0.25,
              unit: "ug/mL",
            },
          ],
        }),
        authority(),
        "command-unit",
      ),
    ).toMatchObject({
      status: "refused",
      reason: "parameter-unit-mismatch",
    });
  });

  it("refuses extra parameters and values outside supplied bounds", () => {
    expect(
      planCiprofloxacinInterventionCommand(
        intent({
          parameters: [
            ...intent().parameters,
            { key: "hidden-extra", value: 1, unit: "model-unit" },
          ],
        }),
        authority(),
        "command-extra",
      ),
    ).toMatchObject({
      status: "refused",
      reason: "parameter-shape-mismatch",
    });

    expect(
      planCiprofloxacinInterventionCommand(
        intent({
          parameters: [
            {
              key: "ciprofloxacin-concentration",
              value: 2,
              unit: "mg/L",
            },
          ],
        }),
        authority(),
        "command-range",
      ),
    ).toMatchObject({
      status: "refused",
      reason: "parameter-out-of-range",
    });
  });

  it("requires canonical command and intent ids", () => {
    expect(
      planCiprofloxacinInterventionCommand(
        intent(),
        authority(),
        " command ",
      ),
    ).toMatchObject({
      status: "refused",
      reason: "invalid-command-id",
    });
    expect(
      planCiprofloxacinInterventionCommand(
        intent({ intentId: "" }),
        authority(),
        "command",
      ),
    ).toMatchObject({
      status: "refused",
      reason: "invalid-intent-id",
    });
  });

  it("validates metadata instead of deriving fallback bounds or defaults", () => {
    expect(() =>
      assertCiprofloxacinCommitAuthority(
        authority({
          concentration: {
            parameterKey: "ciprofloxacin-concentration",
            label: "Ciprofloxacin concentration",
            unit: "mg/L",
            min: 0,
            max: 1,
            defaultValue: 2,
          },
        }),
      ),
    ).toThrow(/defaultValue/);

    expect(() =>
      assertCiprofloxacinCommitAuthority(
        authority({
          supportedGeometry: ["radial", "radial"],
        }),
      ),
    ).toThrow(/unique/);
  });

  it("canonicalizes authority identity independent of geometry declaration order", () => {
    const left = authority({
      supportedGeometry: ["paint", "global", "stripe", "radial"],
    });
    const right = authority({
      supportedGeometry: ["global", "radial", "stripe", "paint"],
    });

    expect(ciprofloxacinCommitAuthorityIdentity(left)).toBe(
      ciprofloxacinCommitAuthorityIdentity(right),
    );
  });
});
