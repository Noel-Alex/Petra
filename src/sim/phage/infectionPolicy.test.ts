import { describe, expect, it } from "vitest";
import {
  PHAGE_PRODUCTIVE_INFECTION_POLICY_SCHEMA_VERSION,
  SINGLE_HIT_UNIQUE_HOST_POLICY,
  SINGLE_HIT_UNIQUE_HOST_POLICY_ID,
  phageProductiveInfectionPolicyIdentity,
  resolveProductiveInfections,
  validatePhageProductiveInfectionPolicy,
  type PhageProductiveInfectionPolicy,
} from "./infectionPolicy";

describe("phage productive-infection multiplicity policy", () => {
  it("has a canonical replay/configuration identity with explicit assumption semantics", () => {
    expect(phageProductiveInfectionPolicyIdentity()).toBe(
      JSON.stringify({
        schemaVersion: PHAGE_PRODUCTIVE_INFECTION_POLICY_SCHEMA_VERSION,
        id: SINGLE_HIT_UNIQUE_HOST_POLICY_ID,
        evidenceClass: "mechanistic-approximation",
        adsorptionTargetingScope: "pre-step-susceptible-host-pool",
        susceptibleHostAllocation: "unique-until-saturated",
        superinfection: "non-productive",
        lysisFromWithout: false,
      }),
    );
  });

  it("maps zero adsorbed PFU to zero productive infections", () => {
    expect(
      resolveProductiveInfections({
        adsorbedPfu: 0,
        susceptibleHostOpportunities: 25,
      }),
    ).toMatchObject({
      productiveInfections: 0,
      nonProductiveAdsorptions: 0,
    });
  });

  it("creates one productive infection per adsorption while unique susceptible hosts remain", () => {
    const resolution = resolveProductiveInfections({
      adsorbedPfu: 4,
      susceptibleHostOpportunities: 10,
    });

    expect(resolution.productiveInfections).toBe(4);
    expect(resolution.nonProductiveAdsorptions).toBe(0);
    expect(resolution.productiveInfections).toBeLessThanOrEqual(
      resolution.adsorbedPfu,
    );
    expect(resolution.productiveInfections).toBeLessThanOrEqual(
      resolution.susceptibleHostOpportunities,
    );
  });

  it("saturates at discrete susceptible-host authority without creating duplicate cohorts", () => {
    const resolution = resolveProductiveInfections({
      adsorbedPfu: 9,
      susceptibleHostOpportunities: 3,
    });

    expect(resolution.productiveInfections).toBe(3);
    expect(resolution.nonProductiveAdsorptions).toBe(6);
  });

  it("treats adsorption with no susceptible host opportunities as non-productive", () => {
    const resolution = resolveProductiveInfections({
      adsorbedPfu: 5,
      susceptibleHostOpportunities: 0,
    });

    expect(resolution.productiveInfections).toBe(0);
    expect(resolution.nonProductiveAdsorptions).toBe(5);
  });

  it("accepts safe-integer boundary counts without exceeding either authority", () => {
    const resolution = resolveProductiveInfections({
      adsorbedPfu: Number.MAX_SAFE_INTEGER,
      susceptibleHostOpportunities: 2,
    });

    expect(resolution.productiveInfections).toBe(2);
    expect(resolution.nonProductiveAdsorptions).toBe(
      Number.MAX_SAFE_INTEGER - 2,
    );
  });

  it.each([
    { adsorbedPfu: -1, susceptibleHostOpportunities: 1 },
    { adsorbedPfu: 0.5, susceptibleHostOpportunities: 1 },
    { adsorbedPfu: Number.MAX_SAFE_INTEGER + 1, susceptibleHostOpportunities: 1 },
    { adsorbedPfu: 1, susceptibleHostOpportunities: -1 },
    { adsorbedPfu: 1, susceptibleHostOpportunities: 0.5 },
    { adsorbedPfu: 1, susceptibleHostOpportunities: Number.MAX_SAFE_INTEGER + 1 },
  ])("rejects non-discrete authority %#", (input) => {
    expect(() => resolveProductiveInfections(input)).toThrow(/safe integer/);
  });

  it("fails closed if a serialized policy keeps the id but changes its semantics", () => {
    const drifted = {
      ...SINGLE_HIT_UNIQUE_HOST_POLICY,
      superinfection: "productive",
    } as unknown as PhageProductiveInfectionPolicy;

    expect(() => validatePhageProductiveInfectionPolicy(drifted)).toThrow(
      /semantics do not match v1/,
    );
  });

  it("accepts a serialized clone with the exact reviewed semantics", () => {
    const clone = JSON.parse(
      JSON.stringify(SINGLE_HIT_UNIQUE_HOST_POLICY),
    ) as PhageProductiveInfectionPolicy;

    expect(() => validatePhageProductiveInfectionPolicy(clone)).not.toThrow();
    expect(phageProductiveInfectionPolicyIdentity(clone)).toBe(
      phageProductiveInfectionPolicyIdentity(),
    );
  });
});
