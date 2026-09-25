import { describe, expect, it } from "vitest";

import { buildDefaultFlagshipRun } from "./flagshipRunPreset";

import {
  CIPROFLOXACIN_TOOL_AUTHORITY_SCHEMA_VERSION,
  parseCiprofloxacinToolAuthority,
  toCiprofloxacinIntentAuthority,
} from "./ciprofloxacinToolAuthority";

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

describe("ciprofloxacin tool authority", () => {
  it("parses exact protocol-v5 presentation/command metadata without inventing values", () => {
    const authority = parseCiprofloxacinToolAuthority(metadata);

    expect(authority).toEqual(metadata);
    expect(toCiprofloxacinIntentAuthority(authority)).toEqual({
      schemaVersion: 1,
      concentrationParameterKey: "concentration",
      concentrationUnit: "mg/L",
      minimumMgPerL: 0,
      maximumMgPerL: 2,
      blendMode: "set",
    });
  });

  it("allows an explicit supported-geometry subset while refusing point geometry", () => {
    expect(
      parseCiprofloxacinToolAuthority({
        ...metadata,
        supportedGeometries: ["global", "paint"],
      }).supportedGeometries,
    ).toEqual(["global", "paint"]);

    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        supportedGeometries: ["global", "point"],
      }),
    ).toThrow(/supportedGeometries\[1\] is unsupported/);
  });

  it("rejects duplicate geometry and unknown fields rather than normalizing them", () => {
    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        supportedGeometries: ["global", "global"],
      }),
    ).toThrow(/duplicate .* geometry/i);

    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        extra: "ignored",
      }),
    ).toThrow(/unknown field "extra"/);
  });

  it("requires the default to remain finite, non-negative, and within declared bounds", () => {
    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        parameter: { ...metadata.parameter, defaultValue: 3 },
      }),
    ).toThrow(/default must lie within bounds/);

    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        parameter: { ...metadata.parameter, defaultValue: Number.NaN },
      }),
    ).toThrow(/default must be finite and non-negative/);
  });

  it("accepts the exact scenario-projected flagship control authority", () => {
    const { ciprofloxacinToolAuthority } = buildDefaultFlagshipRun();
    const authority = parseCiprofloxacinToolAuthority(
      ciprofloxacinToolAuthority,
    );

    expect(authority.parameter).toEqual({
      key: "ciprofloxacin-concentration",
      label: "Ciprofloxacin concentration",
      unit: "mg/L",
      minimum: 0,
      maximum: 2,
      defaultValue: 0,
      precision: 3,
    });
    expect(authority.supportedGeometries).toEqual([
      "global",
      "radial",
      "stripe",
      "paint",
    ]);
    expect(authority.blendMode).toBe("set");
  });

  it("requires canonical labels/keys, mg/L, bounded precision, and explicit blend semantics", () => {
    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        parameter: { ...metadata.parameter, key: " concentration " },
      }),
    ).toThrow(/canonical non-empty string/);

    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        parameter: { ...metadata.parameter, unit: "ug/mL" },
      }),
    ).toThrow(/unit must be mg\/L/);

    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        parameter: { ...metadata.parameter, precision: 7 },
      }),
    ).toThrow(/precision must be an integer from 0 to 6/);

    expect(() =>
      parseCiprofloxacinToolAuthority({
        ...metadata,
        blendMode: "replace",
      }),
    ).toThrow(/blend mode must be set or add/);
  });
});
