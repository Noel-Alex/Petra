import { describe, expect, it } from "vitest";

import rawMatrix from "../data/content_support/v1.json";
import rawFlagshipScenario from "../data/presets/ecoli_ciprofloxacin_v1.json";
import rawPresentationIdentity from "../data/presentation/ecoli_k12_mg1655_v1.json";
import { evaluateScienceModeAdmission } from "./sim/scienceModeAdmission";
import {
  findSupportedScenario,
  parseSupportedContentMatrix,
  SUPPORTED_CONTENT_MATRIX,
} from "./contentSupportMatrix";

function cloneMatrix(): Record<string, unknown> {
  return JSON.parse(JSON.stringify(rawMatrix)) as Record<string, unknown>;
}

describe("supported content matrix", () => {
  it("binds the enabled research flagship to exact repository authority", () => {
    const flagship = findSupportedScenario(
      SUPPORTED_CONTENT_MATRIX,
      rawFlagshipScenario.id,
      rawFlagshipScenario.version,
    );
    expect(flagship).not.toBeNull();
    if (flagship === null) throw new Error("expected flagship support entry");

    expect(flagship.availability).toBe("enabled-research");
    expect(flagship.scienceModeStatus).toBe("not-admitted");

    expect(flagship.organisms).toEqual([
      {
        scientificName: rawFlagshipScenario.organism.name,
        background: rawFlagshipScenario.organism.genotypeBackground,
        microbialGroup: "bacterium",
        presentationIdentityId: rawPresentationIdentity.id,
      },
    ]);

    const resourceContext = rawFlagshipScenario.environment.resourceContext;
    expect(flagship.environment).toEqual({
      resourceContextVersion: resourceContext.version,
      resourceBindingStatus: resourceContext.bindingStatus,
      resourceRepresentation: resourceContext.representation,
      medium: resourceContext.medium,
      referenceTemperatureC: resourceContext.referenceTemperatureC,
    });

    const control = rawFlagshipScenario.drug.interventionControl;
    expect(flagship.interventions).toEqual([
      {
        id: rawFlagshipScenario.drug.name,
        kind: "antibiotic",
        protocolCommand: control.protocolCommand,
        concentrationUnit: control.parameter.unit,
        supportedGeometries: control.supportedGeometries,
      },
    ]);

    const scienceAdmission = evaluateScienceModeAdmission(
      rawFlagshipScenario as unknown,
    );
    expect(scienceAdmission.admitted).toBe(false);
    expect(scienceAdmission.reasons.map((reason) => reason.code)).toContain(
      "unbound-required-value",
    );
  });

  it("keeps all requested expansion lanes explicitly blocked on owning issues", () => {
    expect(
      SUPPORTED_CONTENT_MATRIX.expansionQueue.map((entry) => ({
        id: entry.id,
        availability: entry.availability,
        issues: entry.issues,
      })),
    ).toEqual([
      {
        id: "first-shared-resource-bacterial-competitor",
        availability: "blocked-validation",
        issues: [907, 992, 946, 999],
      },
      {
        id: "first-grounded-fungal-competitor",
        availability: "blocked-implementation",
        issues: [615, 974, 1005, 976],
      },
      {
        id: "first-post-ciprofloxacin-antibiotic",
        availability: "blocked-research",
        issues: [928, 938],
      },
      {
        id: "named-microbial-interactions",
        availability: "blocked-research",
        issues: [647],
      },
    ]);
  });

  it("rejects duplicate ids across enabled and blocked content", () => {
    const value = cloneMatrix();
    const supported = value.supportedScenarios as Array<Record<string, unknown>>;
    const queue = value.expansionQueue as Array<Record<string, unknown>>;
    queue[0]!.id = supported[0]!.id;

    expect(() => parseSupportedContentMatrix(value)).toThrow(
      /duplicate content support id/i,
    );
  });

  it("rejects scientific enablement without explicit Science-Mode admission", () => {
    const value = cloneMatrix();
    const supported = value.supportedScenarios as Array<Record<string, unknown>>;
    supported[0]!.availability = "enabled-science";
    supported[0]!.scienceModeStatus = "not-admitted";

    expect(() => parseSupportedContentMatrix(value)).toThrow(
      /requires explicit Science-Mode admission/i,
    );
  });

  it("rejects physical labels on an unbound resource context", () => {
    const value = cloneMatrix();
    const supported = value.supportedScenarios as Array<Record<string, unknown>>;
    const environment = supported[0]!.environment as Record<string, unknown>;
    environment.resourceRepresentation = "physical_concentration";

    expect(() => parseSupportedContentMatrix(value)).toThrow(
      /unbound resource context as physical concentration/i,
    );

    environment.resourceRepresentation = "dimensionless_model_resource";
    environment.medium = "LB";
    expect(() => parseSupportedContentMatrix(value)).toThrow(
      /cannot name a physical medium/i,
    );
  });

  it("rejects Science-Mode enablement while resource authority is unbound", () => {
    const value = cloneMatrix();
    const supported = value.supportedScenarios as Array<Record<string, unknown>>;
    supported[0]!.availability = "enabled-science";
    supported[0]!.scienceModeStatus = "admitted";

    expect(() => parseSupportedContentMatrix(value)).toThrow(
      /cannot use an unbound resource context/i,
    );
  });

  it("rejects malformed issue dependencies and unknown expansion fields", () => {
    const malformedIssue = cloneMatrix();
    const queue = malformedIssue.expansionQueue as Array<
      Record<string, unknown>
    >;
    queue[0]!.issues = [0];
    expect(() => parseSupportedContentMatrix(malformedIssue)).toThrow(
      /positive safe integer/i,
    );

    const hiddenAuthority = cloneMatrix();
    const hiddenQueue = hiddenAuthority.expansionQueue as Array<
      Record<string, unknown>
    >;
    hiddenQueue[0]!.scenario = {
      id: "invented",
      version: "1",
    };
    expect(() => parseSupportedContentMatrix(hiddenAuthority)).toThrow(
      /unexpected shape/i,
    );
  });
});
