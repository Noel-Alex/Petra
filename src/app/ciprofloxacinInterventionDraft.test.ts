import { describe, expect, it } from "vitest";

import {
  CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION,
  type CiprofloxacinToolAuthority,
} from "./ciprofloxacinToolAuthority";
import {
  buildCiprofloxacinInterventionDraft,
  createCiprofloxacinInterventionPreview,
} from "./ciprofloxacinInterventionDraft";

const authority: CiprofloxacinToolAuthority = {
  schemaVersion: CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION,
  tool: "antibiotic",
  protocolCommand: "apply-ciprofloxacin",
  parameter: {
    key: "ciprofloxacin-concentration",
    label: "Ciprofloxacin concentration",
    unit: "mg/L",
    minimum: 0,
    maximum: 2,
    defaultValue: 0,
    precision: 3,
  },
  supportedGeometries: ["global", "radial", "stripe", "paint"],
  blendMode: "set",
};

describe("authoritative ciprofloxacin intervention draft", () => {
  it("copies scenario-owned parameter metadata and the neutral default", () => {
    const draft = buildCiprofloxacinInterventionDraft(authority, {
      intentId: "cipro-1",
      geometry: {
        kind: "radial",
        center: { x: 0.25, y: 0.75 },
        radiusFraction: 0.1,
      },
    });

    expect(draft).toEqual({
      intentId: "cipro-1",
      tool: "antibiotic",
      geometry: {
        kind: "radial",
        center: { x: 0.25, y: 0.75 },
        radiusFraction: 0.1,
      },
      parameters: [
        {
          key: "ciprofloxacin-concentration",
          label: "Ciprofloxacin concentration",
          value: 0,
          unit: "mg/L",
          precision: 3,
          min: 0,
          max: 2,
        },
      ],
    });
  });

  it("detaches caller-authored paint geometry", () => {
    const samples = [{ x: 0.2, y: 0.3 }];
    const draft = buildCiprofloxacinInterventionDraft(authority, {
      intentId: "cipro-paint",
      geometry: {
        kind: "paint",
        samples,
        brushRadiusFraction: 0.05,
      },
    });

    samples[0]!.x = 0.9;

    expect(draft.geometry).toEqual({
      kind: "paint",
      samples: [{ x: 0.2, y: 0.3 }],
      brushRadiusFraction: 0.05,
    });
  });

  it("refuses point cursors and scenario-disabled geometry", () => {
    expect(() =>
      buildCiprofloxacinInterventionDraft(authority, {
        intentId: "cursor",
        geometry: { kind: "point", point: { x: 0.5, y: 0.5 } },
      }),
    ).toThrow(/point geometry is presentation-only/);

    expect(() =>
      buildCiprofloxacinInterventionDraft(
        { ...authority, supportedGeometries: ["global"] },
        {
          intentId: "stripe",
          geometry: {
            kind: "stripe",
            axis: "x",
            centerFraction: 0.5,
            widthFraction: 0.2,
          },
        },
      ),
    ).toThrow(/not enabled by scenario authority/);
  });

  it("uses the existing preview validator for explicit concentration bounds", () => {
    const valid = createCiprofloxacinInterventionPreview(
      authority,
      {
        intentId: "valid-dose",
        geometry: { kind: "global" },
        concentrationMgPerL: 1.25,
      },
      "off",
    );
    expect(valid.status).toBe("valid");
    expect(valid.commitIntent?.parameters).toEqual([
      {
        key: "ciprofloxacin-concentration",
        value: 1.25,
        unit: "mg/L",
      },
    ]);

    const invalid = createCiprofloxacinInterventionPreview(
      authority,
      {
        intentId: "invalid-dose",
        geometry: { kind: "global" },
        concentrationMgPerL: 2.5,
      },
      "off",
    );
    expect(invalid.status).toBe("invalid");
    expect(invalid.canCommit).toBe(false);
    expect(invalid.issues).toContainEqual(
      expect.objectContaining({ code: "parameter-out-of-range" }),
    );
  });

  it("fails closed when authority metadata itself is malformed", () => {
    expect(() =>
      buildCiprofloxacinInterventionDraft(
        {
          ...authority,
          parameter: { ...authority.parameter, maximum: Number.NaN },
        },
        {
          intentId: "bad-authority",
          geometry: { kind: "global" },
        },
      ),
    ).toThrow(/maximum must be finite and non-negative/);
  });
});
