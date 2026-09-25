import { describe, expect, it } from "vitest";

import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  buildFlagshipCiprofloxacinControlAuthority,
  resolveDefaultFlagshipCiprofloxacinToolAuthority,
} from "./flagshipInterventionAuthority";

describe("flagship ciprofloxacin intervention authority", () => {
  it("binds the source-tested domain and engineering reference default without inferring genotype MICs", () => {
    const resolved = buildFlagshipCiprofloxacinControlAuthority();

    expect(resolved.toolAuthority).toMatchObject({
      tool: "antibiotic",
      protocolCommand: "apply-ciprofloxacin",
      parameter: {
        key: "concentration",
        unit: "mg/L",
        minimum: 0,
        maximum: 2,
        defaultValue: 0.03,
        precision: 3,
      },
      supportedGeometries: ["global", "radial", "stripe", "paint"],
      blendMode: "set",
    });
    expect(resolved.sourceTestedDomain).toEqual({
      minimumMgPerL: 0,
      maximumMgPerL: 2,
    });
    expect(resolved.defaultSelectionMgPerL).toBe(0.03);
    expect(resolveDefaultFlagshipCiprofloxacinToolAuthority()).toEqual(
      resolved.toolAuthority,
    );
  });

  it("fails closed if tool bounds drift away from the cited source-tested domain", () => {
    const scenario = structuredClone(flagshipScenario);
    scenario.drug.interventionControl.toolAuthority.parameter.maximum = 1.5;

    expect(() => buildFlagshipCiprofloxacinControlAuthority(scenario)).toThrow(
      /tool bounds must match the source-tested domain/,
    );
  });

  it("fails closed if the engineering default stops matching the cited conventional MIC anchor", () => {
    const scenario = structuredClone(flagshipScenario);
    scenario.drug.interventionControl.defaultSelection.valueMgPerL = 0.04;
    scenario.drug.interventionControl.toolAuthority.parameter.defaultValue = 0.04;

    expect(() => buildFlagshipCiprofloxacinControlAuthority(scenario)).toThrow(
      /must remain anchored to the source conventional MIC/,
    );
  });

  it("requires explicit transfer provenance for the control envelope", () => {
    const scenario = structuredClone(flagshipScenario);
    scenario.drug.interventionControl.sourceTestedDomain.provenance.classification =
      "engineering";

    expect(() => buildFlagshipCiprofloxacinControlAuthority(scenario)).toThrow(
      /explicit regoes_2004 transfer/,
    );
  });
});
