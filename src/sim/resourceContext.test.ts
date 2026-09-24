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
        transferNote: "synthetic cross-context transfer fixture",
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

  it("mirrors source requirements for evidence-bearing provenance classes", () => {
    const physicalBase = {
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
    };

    expect(() =>
      parseScenarioResourceContext({
        ...physicalBase,
        provenance: {
          classification: "measured",
          context: "fixture",
        },
      }),
    ).toThrow(/requires at least one citation key for measured/);

    expect(() =>
      parseScenarioResourceContext({
        ...physicalBase,
        provenance: {
          classification: "derived",
          citation: "source-a",
          context: "fixture",
        },
      }),
    ).toThrow(/transformation is required for derived evidence/);

    expect(() =>
      parseScenarioResourceContext({
        ...physicalBase,
        provenance: {
          classification: "transferred",
          citation: "source-a",
          context: "fixture",
        },
      }),
    ).toThrow(/transferNote is required for transferred evidence/);

    expect(() =>
      parseScenarioResourceContext({
        ...physicalBase,
        provenance: {
          classification: "mechanistic_approximation",
          citation: "source-a",
          context: "fixture",
        },
      }),
    ).toThrow(/limitation is required for model approximations/);

    expect(() =>
      parseScenarioResourceContext({
        ...physicalBase,
        provenance: {
          classification: "transferred_mechanistic_approximation",
          citation: "source-a",
          transferNote: "fixture transfer",
          context: "fixture",
        },
      }),
    ).toThrow(/limitation is required for model approximations/);
  });

  it("accepts complete evidence-bearing provenance without changing identity semantics", () => {
    const context = parseScenarioResourceContext({
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
        classification: "transferred_mechanistic_approximation",
        citations: ["source-b", "source-a"],
        context: "fixture",
        transferNote: "fixture transfer",
        limitation: "fixture limitation",
      },
    });

    expect(context.provenance.citations).toEqual(["source-b", "source-a"]);
    expect(resourceContextIdentity(context)).toContain(
      '"citations":["source-a","source-b"]',
    );
  });

  it("rejects unknown resource-context fields instead of erasing them from identity", () => {
    const base = flagship.environment.resourceContext;

    expect(() =>
      parseScenarioResourceContext({
        ...base,
        physicalScale: "unknown future semantic field",
      }),
    ).toThrow(/resourceContext contains unsupported field: physicalScale/);
  });

  it("rejects unknown provenance fields instead of erasing them from identity", () => {
    const base = flagship.environment.resourceContext;

    expect(() =>
      parseScenarioResourceContext({
        ...base,
        provenance: {
          ...base.provenance,
          methodology: "unknown provenance semantics",
        },
      }),
    ).toThrow(
      /resourceContext\.provenance contains unsupported field: methodology/,
    );
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
