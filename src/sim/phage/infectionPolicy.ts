export const PHAGE_PRODUCTIVE_INFECTION_POLICY_SCHEMA_VERSION = 1 as const;

export const SINGLE_HIT_UNIQUE_HOST_POLICY_ID =
  "petra-phage-productive-infection/single-hit-unique-host-v1" as const;

export type ProductiveInfectionEvidenceClass = "mechanistic-approximation";

export interface PhageProductiveInfectionPolicy {
  readonly schemaVersion: typeof PHAGE_PRODUCTIVE_INFECTION_POLICY_SCHEMA_VERSION;
  readonly id: typeof SINGLE_HIT_UNIQUE_HOST_POLICY_ID;
  readonly evidenceClass: ProductiveInfectionEvidenceClass;
  /**
   * Adsorption is resolved against the pre-step susceptible-host pool.
   * Renderer glyphs and continuous biomass are not valid host-count authority.
   */
  readonly adsorptionTargetingScope: "pre-step-susceptible-host-pool";
  /**
   * Deterministic closure used when several adsorbed PFU compete for a finite
   * discrete susceptible-host pool.
   */
  readonly susceptibleHostAllocation: "unique-until-saturated";
  /** Further adsorption after a host is already infected creates no new cohort. */
  readonly superinfection: "non-productive";
  /** High-MOI lysis from without is intentionally not part of this policy. */
  readonly lysisFromWithout: false;
}

export const SINGLE_HIT_UNIQUE_HOST_POLICY: PhageProductiveInfectionPolicy =
  Object.freeze({
    schemaVersion: PHAGE_PRODUCTIVE_INFECTION_POLICY_SCHEMA_VERSION,
    id: SINGLE_HIT_UNIQUE_HOST_POLICY_ID,
    evidenceClass: "mechanistic-approximation",
    adsorptionTargetingScope: "pre-step-susceptible-host-pool",
    susceptibleHostAllocation: "unique-until-saturated",
    superinfection: "non-productive",
    lysisFromWithout: false,
  });

export interface ProductiveInfectionResolution {
  readonly policyIdentity: string;
  readonly adsorbedPfu: number;
  readonly susceptibleHostOpportunities: number;
  readonly productiveInfections: number;
  readonly nonProductiveAdsorptions: number;
}

/**
 * Canonical replay/configuration identity for the reviewed adsorption→infection
 * closure. No biological probability is hidden outside this identity.
 */
export function phageProductiveInfectionPolicyIdentity(
  policy: PhageProductiveInfectionPolicy = SINGLE_HIT_UNIQUE_HOST_POLICY,
): string {
  validatePhageProductiveInfectionPolicy(policy);
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    evidenceClass: policy.evidenceClass,
    adsorptionTargetingScope: policy.adsorptionTargetingScope,
    susceptibleHostAllocation: policy.susceptibleHostAllocation,
    superinfection: policy.superinfection,
    lysisFromWithout: policy.lysisFromWithout,
  });
}

/**
 * Resolve an already-authoritative discrete adsorption outcome into newly
 * infected hosts under Petra's first reviewed multiplicity closure.
 *
 * Scientific boundary:
 * - Nabergoj et al. 2018 measures adsorption, not productive-entry efficiency.
 * - v1 therefore makes a visible model assumption: each adsorbed PFU occupies
 *   one distinct susceptible host until the discrete susceptible pool is
 *   exhausted.
 * - excess/repeat adsorption is non-productive; already-infected hosts do not
 *   create another latent cohort; lysis from without remains disabled.
 *
 * The caller must supply a discrete safe-integer susceptible-host opportunity
 * count from simulation authority. This function never rounds continuous
 * biomass/cell-equivalents or infers host counts from presentation state.
 */
export function resolveProductiveInfections(
  args: {
    readonly adsorbedPfu: number;
    readonly susceptibleHostOpportunities: number;
  },
  policy: PhageProductiveInfectionPolicy = SINGLE_HIT_UNIQUE_HOST_POLICY,
): ProductiveInfectionResolution {
  validatePhageProductiveInfectionPolicy(policy);
  nonNegativeSafeInteger("adsorbedPfu", args.adsorbedPfu);
  nonNegativeSafeInteger(
    "susceptibleHostOpportunities",
    args.susceptibleHostOpportunities,
  );

  const productiveInfections = Math.min(
    args.adsorbedPfu,
    args.susceptibleHostOpportunities,
  );
  const nonProductiveAdsorptions = args.adsorbedPfu - productiveInfections;

  return {
    policyIdentity: phageProductiveInfectionPolicyIdentity(policy),
    adsorbedPfu: args.adsorbedPfu,
    susceptibleHostOpportunities: args.susceptibleHostOpportunities,
    productiveInfections,
    nonProductiveAdsorptions,
  };
}

export function validatePhageProductiveInfectionPolicy(
  policy: PhageProductiveInfectionPolicy,
): void {
  if (
    policy.schemaVersion !== PHAGE_PRODUCTIVE_INFECTION_POLICY_SCHEMA_VERSION
  ) {
    throw new Error("unsupported phage productive-infection policy version");
  }
  if (policy.id !== SINGLE_HIT_UNIQUE_HOST_POLICY_ID) {
    throw new Error("unsupported phage productive-infection policy id");
  }
  if (policy.evidenceClass !== "mechanistic-approximation") {
    throw new Error(
      "phage productive-infection policy must remain a mechanistic approximation",
    );
  }
  if (
    policy.adsorptionTargetingScope !== "pre-step-susceptible-host-pool" ||
    policy.susceptibleHostAllocation !== "unique-until-saturated" ||
    policy.superinfection !== "non-productive" ||
    policy.lysisFromWithout !== false
  ) {
    throw new Error("phage productive-infection policy semantics do not match v1");
  }
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
