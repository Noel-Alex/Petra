import { describe, expect, it } from "vitest";

import flagship from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  parseScenarioResourceContext,
  resourceContextIdentity,
  type ScenarioResourceContext,
} from "./resourceContext";

describe("scenario resource context identity", () => {
  it("parses the flagship's explicit unbound model-resource contract", () => {
    const context = parseScenarioResourceContext(
      flagship.environment.resourceContext,
    );

    expect(context).toMatchObject({
      version: "unbound-model-resource-v1",
      bindingStatus: "unbound",
      representation: "dimensionless_model_resource",
      concentrationUnit: "model-resource",
      limitingSubstrate: null,
      medium: null,
      referenceTemperatureC: 37,
      boundary: "no_flux",
      provenance: {
        classification: "engineering",
      },
    });
    expect(context.provenance.limitation).toMatch(/dimensionless model resource/i);
    expect(Object.isFrozen(context)).toBe(true);
    expect(Object.isFrozen(context.provenance)).toBe(true);
  });

  it("rejects a physical label or unit smuggled into an unbound context", () => {
    const base = flagship.environment.resourceContext;

    expect(() =>
      parseScenarioResourceContext({
        ...base,
        limitingSubstrate: "glucose",
      }),
    ).toThrow(/must not claim a physical substrate or medium/);

    expect(() =>
      parseScenarioResourceContext({
        ...base,
        concentrationUnit: "mg/L",
      }),
    ).toThrow(/must use model-resource units/);
  });

  it("requires physical resource contexts to name substrate, medium, and units", () => {
    const physical: ScenarioResourceContext = {
      version: "glucose-minimal-v1",
      bindingStatus: "calibrated",
      representation: "physical_concentration",
      concentrationUnit: "mg/L",
      limitingSubstrate: "glucose",
      medium: "defined minimal medium",
      referenceTemperatureC: 37,
      boundary: "no_flux",
      initialCondition: "caller-supplied calibrated glucose concentration",
      biomassMapping: "scenario-owned calibrated model biomass mapping",
      provenance: {
        classification: "calibrated",
        context: "synthetic contract fixture",
      },
    };

    expect(parseScenarioResourceContext(physical)).toEqual(physical);
    expect(() =>
      parseScenarioResourceContext({ ...physical, medium: null }),
    ).toThrow(/requires limiting substrate and medium/);
    expect(() =>
      parseScenarioResourceContext({
        ...physical,
        concentrationUnit: "model-resource",
      }),
    ).toThrow(/cannot use model-resource/);
  });

  it("canonicalizes citation ordering but changes identity for semantic changes", () => {
    const base: ScenarioResourceContext = {
      version: "glucose-minimal-v1",
      bindingStatus: "measured_or_transferred",
      representation: "physical_concentration",
      concentrationUnit: "mg/L",
      limitingSubstrate: "glucose",
      medium: "defined minimal medium",
      referenceTemperatureC: 37,
      boundary: "no_flux",
      initialCondition: "1 mg/L",
      biomassMapping: "source-compatible biomass mapping",
      provenance: {
        classification: "transferred",
        citations: ["source-b", "source-a"],
        context: "fixture",
      },
    };

    const reordered: ScenarioResourceContext = {
      ...base,
      provenance: {
        ...base.provenance,
        citations: ["source-a", "source-b"],
      },
    };

    expect(resourceContextIdentity(base)).toBe(resourceContextIdentity(reordered));
    expect(
      resourceContextIdentity({ ...base, concentrationUnit: "g/L" }),
    ).not.toBe(resourceContextIdentity(base));
    expect(
      resourceContextIdentity({ ...base, boundary: "external_feed" }),
    ).not.toBe(resourceContextIdentity(base));
  });

  it("rejects ambiguous provenance and malformed identity fields", () => {
    const base = flagship.environment.resourceContext;

    expect(() =>
      parseScenarioResourceContext({
        ...base,
        version: " unbound-model-resource-v1 ",
      }),
    ).toThrow(/must be trimmed/);

    expect(() =>
      parseScenarioResourceContext({
        ...base,
        provenance: {
          ...base.provenance,
          citations: ["source-a", "source-a"],
        },
      }),
    ).toThrow(/must be unique/);
  });
});
