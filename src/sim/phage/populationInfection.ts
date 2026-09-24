import {
  discretePopulationConfigurationIdentity,
  validateDiscretePopulationAuthorityState,
  type DiscretePopulationAuthorityConfig,
  type DiscretePopulationAuthorityState,
} from "../populationAuthority";
import {
  SINGLE_HIT_UNIQUE_HOST_POLICY,
  phageProductiveInfectionPolicyIdentity,
  resolveProductiveInfections,
  type PhageProductiveInfectionPolicy,
} from "./infectionPolicy";

export const POPULATION_BACKED_INFECTION_PLAN_SCHEMA_VERSION = 1 as const;

export interface PopulationBackedInfectionTarget {
  /** Exact lineage identity from the shared population authority. */
  readonly lineageId: string;
  /** Flat authoritative grid-cell index. */
  readonly cellIndex: number;
  /** Already-authoritative adsorption allocation for this lineage/cell target. */
  readonly adsorbedPfu: number;
  /**
   * Phage-owned occupied hosts before this adsorption batch.
   *
   * Infected hosts remain standing biomass until lysis, so this count must be
   * subtracted from shared standing-host authority before infectionPolicy sees
   * a susceptible opportunity count.
   */
  readonly alreadyInfectedHosts: number;
}

export interface PopulationBackedInfectionTargetResolution {
  readonly lineageId: string;
  readonly lineageIndex: number;
  readonly cellIndex: number;
  readonly adsorbedPfu: number;
  readonly standingHosts: number;
  readonly infectedHostsBefore: number;
  readonly susceptibleHostOpportunities: number;
  readonly productiveInfections: number;
  readonly nonProductiveAdsorptions: number;
  readonly infectedHostsAfter: number;
}

export interface PopulationBackedInfectionPlan {
  readonly schemaVersion: typeof POPULATION_BACKED_INFECTION_PLAN_SCHEMA_VERSION;
  readonly populationConfigurationIdentity: string;
  readonly populationRevision: number;
  readonly infectionPolicyIdentity: string;
  readonly targets: readonly PopulationBackedInfectionTargetResolution[];
  readonly totalAdsorbedPfu: number;
  readonly totalProductiveInfections: number;
  readonly totalNonProductiveAdsorptions: number;
}

/**
 * Resolve explicitly allocated per-lineage/per-cell adsorption against the
 * shared #562 standing-host authority without mutating population state.
 *
 * This is deliberately a plan, not a commit:
 * - standing hosts come only from validated DiscretePopulationAuthorityState;
 * - already-infected occupancy remains phage-owned and explicit;
 * - the existing reviewed infection policy receives only the resulting
 *   susceptible safe-integer count;
 * - configuration identity + revision are carried so higher-level composition
 *   can reject the plan if population authority changed before commit.
 *
 * This adapter does not allocate one free-PFU pool across multiple targets,
 * schedule latent cohorts, decrement hosts, or place progeny. Those operations
 * require their own authoritative transaction boundaries.
 */
export function planPopulationBackedProductiveInfections(
  state: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
  targets: readonly PopulationBackedInfectionTarget[],
  policy: PhageProductiveInfectionPolicy = SINGLE_HIT_UNIQUE_HOST_POLICY,
): PopulationBackedInfectionPlan {
  validateDiscretePopulationAuthorityState(state, config);
  if (!Array.isArray(targets)) {
    throw new TypeError("population-backed infection targets must be an array");
  }

  const configurationIdentity = discretePopulationConfigurationIdentity(config);
  const infectionPolicyIdentity = phageProductiveInfectionPolicyIdentity(policy);
  const seenTargets = new Set<string>();
  const resolutions: PopulationBackedInfectionTargetResolution[] = [];
  let totalAdsorbedPfu = 0;
  let totalProductiveInfections = 0;
  let totalNonProductiveAdsorptions = 0;

  for (let targetIndex = 0; targetIndex < targets.length; targetIndex += 1) {
    if (!Object.prototype.hasOwnProperty.call(targets, targetIndex)) {
      throw new TypeError("population-backed infection targets must be dense");
    }
    const target = targets[targetIndex]!;
    if (typeof target !== "object" || target === null || Array.isArray(target)) {
      throw new TypeError("population-backed infection target must be an object");
    }

    const lineageIndex = state.lineageIds.indexOf(target.lineageId);
    if (lineageIndex < 0) {
      throw new Error(
        "population-backed infection target lineageId is not present in population authority",
      );
    }

    nonNegativeSafeInteger("population-backed infection cellIndex", target.cellIndex);
    const cellCount = state.width * state.height;
    if (target.cellIndex >= cellCount) {
      throw new RangeError(
        "population-backed infection cellIndex must lie within the authoritative grid",
      );
    }
    if (config.mask[target.cellIndex] !== 1) {
      throw new Error(
        "population-backed infection target must lie inside the population mask",
      );
    }

    const targetKey = `${lineageIndex}:${target.cellIndex}`;
    if (seenTargets.has(targetKey)) {
      throw new Error(
        "population-backed infection targets must not spend one lineage/cell susceptible pool twice",
      );
    }
    seenTargets.add(targetKey);

    const standingHosts =
      state.standingHostCounts[lineageIndex]![target.cellIndex]!;
    nonNegativeSafeInteger(
      "population-backed infection standingHosts",
      standingHosts,
    );
    nonNegativeSafeInteger(
      "population-backed infection alreadyInfectedHosts",
      target.alreadyInfectedHosts,
    );
    if (target.alreadyInfectedHosts > standingHosts) {
      throw new RangeError(
        "already-infected hosts cannot exceed authoritative standing hosts",
      );
    }

    const susceptibleHostOpportunities =
      standingHosts - target.alreadyInfectedHosts;
    const infection = resolveProductiveInfections(
      {
        adsorbedPfu: target.adsorbedPfu,
        susceptibleHostOpportunities,
      },
      policy,
    );
    const infectedHostsAfter = safeCountAdd(
      "population-backed infected hosts after adsorption",
      target.alreadyInfectedHosts,
      infection.productiveInfections,
    );
    if (infectedHostsAfter > standingHosts) {
      throw new Error(
        "productive infection plan cannot exceed authoritative standing hosts",
      );
    }

    totalAdsorbedPfu = safeCountAdd(
      "total population-backed adsorbed PFU",
      totalAdsorbedPfu,
      infection.adsorbedPfu,
    );
    totalProductiveInfections = safeCountAdd(
      "total population-backed productive infections",
      totalProductiveInfections,
      infection.productiveInfections,
    );
    totalNonProductiveAdsorptions = safeCountAdd(
      "total population-backed non-productive adsorptions",
      totalNonProductiveAdsorptions,
      infection.nonProductiveAdsorptions,
    );

    resolutions.push({
      lineageId: target.lineageId,
      lineageIndex,
      cellIndex: target.cellIndex,
      adsorbedPfu: infection.adsorbedPfu,
      standingHosts,
      infectedHostsBefore: target.alreadyInfectedHosts,
      susceptibleHostOpportunities,
      productiveInfections: infection.productiveInfections,
      nonProductiveAdsorptions: infection.nonProductiveAdsorptions,
      infectedHostsAfter,
    });
  }

  return {
    schemaVersion: POPULATION_BACKED_INFECTION_PLAN_SCHEMA_VERSION,
    populationConfigurationIdentity: configurationIdentity,
    populationRevision: state.revision,
    infectionPolicyIdentity,
    targets: resolutions,
    totalAdsorbedPfu,
    totalProductiveInfections,
    totalNonProductiveAdsorptions,
  };
}

function safeCountAdd(name: string, left: number, right: number): number {
  nonNegativeSafeInteger(`${name} left operand`, left);
  nonNegativeSafeInteger(`${name} right operand`, right);
  const value = left + right;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} exceeds the safe integer count range`);
  }
  return value;
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}
