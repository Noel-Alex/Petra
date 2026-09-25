import { describe, expect, it } from "vitest";
import runPresetData from "../../data/run_presets/ecoli_ciprofloxacin_baseline_v1.json";
import { PROTOCOL_VERSION } from "../sim/protocol";
import {
  buildDefaultFlagshipRun,
  buildFlagshipRunFromPreset,
  parseFlagshipRunPreset,
} from "./flagshipRunPreset";

describe("default flagship run preset", () => {
  it("binds the current composed flagship authority without upgrading engineering run state", () => {
    const { preset, plan, ciprofloxacinToolAuthority, ciprofloxacinControlProvenance } = buildDefaultFlagshipRun();

    expect(preset.version).toBe("1.0.2");
    expect(preset.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(preset.classification).toBe("engineering");
    expect(preset.usageScope).toBe("research-expo-engineering-default");
    expect(plan.identity.scenarioId).toBe("ecoli-ciprofloxacin-spatial");
    expect(plan.identity.scenarioVersion).toBe("1.5.0-research");
    expect(plan.identity.parameterSetId).toBe(
      "ecoli-ciprofloxacin-baseline-composed",
    );
    expect(plan.identity.parameterSetVersion).toBe("1.1.0");
    expect(plan.identity.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(plan.identity.seed).toBe(preset.seed);
    expect(plan.config.ciprofloxacinConcentrationMgPerL.every((value) => value === 0)).toBe(true);
    expect(ciprofloxacinToolAuthority).toMatchObject({
      protocolCommand: "apply-ciprofloxacin",
      parameter: {
        unit: "mg/L",
        minimum: 0,
        maximum: 2,
        defaultValue: 0,
        precision: 3,
      },
      supportedGeometries: ["global", "radial", "stripe", "paint"],
      blendMode: "set",
    });
    expect(ciprofloxacinControlProvenance).toMatchObject({
      classification: "transferred",
      citation: "regoes_2004",
      sourceTestedRangeMgPerL: { minimum: 0, maximum: 2 },
      defaultClassification: "engineering",
    });
  });

  it("rejects stale mechanism identity rather than silently rebinding the preset", () => {
    const stale = structuredClone(runPresetData);
    stale.parameterSetVersion = "1.0.0";

    expect(() => buildFlagshipRunFromPreset(stale)).toThrow(
      "flagship run preset parameter-set identity does not match composed authority",
    );
  });

  it("rejects unknown fields and incompatible protocol identity", () => {
    expect(() =>
      parseFlagshipRunPreset({ ...structuredClone(runPresetData), extra: true }),
    ).toThrow("unknown field");

    expect(() =>
      parseFlagshipRunPreset({
        ...structuredClone(runPresetData),
        protocolVersion: 5,
      }),
    ).toThrow("protocol version does not match");
  });
});
