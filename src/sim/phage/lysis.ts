import {
  applyDeterministicPhageBurst,
  type PhageBurstPolicy,
  type PhageBurstPolicyState,
  type PhageLysisBurstResult,
} from "./burstPolicy";
import {
  cohortLysisAtMinutes,
  type LatentInfectionCohort,
  type MaturedLatentInfections,
} from "./latentQueue";
import type { PhageLifeHistoryResolution } from "./lifeHistory";

export type InDomainPhageLifeHistoryResolution = Exclude<
  PhageLifeHistoryResolution,
  { readonly status: "out-of-domain" }
>;

export interface PhageLysisAuthorityProvenance {
  readonly requestedGrowthRatePerHour: number;
  readonly status: "exact" | "interpolated";
  readonly evidenceClass: "measured" | "derived";
  readonly sourceKey: string;
  readonly sourceDoi: string;
  readonly latentPeriodMinutes: number;
  readonly meanBurstPfuPerCell: number;
}

export interface MaturedPhageLysisResult {
  readonly throughMinutes: number;
  readonly maturedCohortSequences: readonly number[];
  readonly provenance: PhageLysisAuthorityProvenance;
  readonly burst: PhageLysisBurstResult;
}

/**
 * Authoritative pure handoff from already-matured infection cohorts to discrete
 * progeny bookkeeping.
 *
 * This function does not mutate host state, latent-queue state, or free-phage
 * fields. A later composition layer must commit those mutations atomically.
 *
 * The supplied life-history resolution must be in-domain and must match the
 * latent period carried by every matured cohort. This prevents one physiological
 * state from providing the maturity delay while another silently provides the
 * burst mean.
 */
export function applyMaturedPhageLysis(
  policy: PhageBurstPolicy,
  state: PhageBurstPolicyState,
  matured: MaturedLatentInfections,
  lifeHistory: PhageLifeHistoryResolution,
): MaturedPhageLysisResult {
  validateMaturedLatentInfections(matured);
  const inDomain = requireInDomainLifeHistory(lifeHistory);
  validateLifeHistoryBinding(matured.cohorts, inDomain);

  const burst = applyDeterministicPhageBurst(policy, state, {
    infectionCount: matured.infectionCount,
    meanBurstPfuPerCell: inDomain.values.burstSizePfuPerCell,
  });

  return {
    throughMinutes: matured.throughMinutes,
    maturedCohortSequences: matured.cohorts.map((cohort) => cohort.sequence),
    provenance: {
      requestedGrowthRatePerHour: inDomain.requestedGrowthRatePerHour,
      status: inDomain.status,
      evidenceClass: inDomain.evidenceClass,
      sourceKey: inDomain.source.key,
      sourceDoi: inDomain.source.doi,
      latentPeriodMinutes: inDomain.values.latentPeriodMinutes,
      meanBurstPfuPerCell: inDomain.values.burstSizePfuPerCell,
    },
    burst,
  };
}

export function validateMaturedLatentInfections(
  matured: MaturedLatentInfections,
): void {
  if (!isRecord(matured)) {
    throw new TypeError("matured latent infections must be an object");
  }

  finiteNonNegative("matured.throughMinutes", matured.throughMinutes);
  nonNegativeSafeInteger("matured.infectionCount", matured.infectionCount);

  if (!Array.isArray(matured.cohorts)) {
    throw new TypeError("matured.cohorts must be an array");
  }

  let infectionCount = 0;
  let previousLysisAtMinutes = Number.NEGATIVE_INFINITY;
  let previousSequence = Number.NEGATIVE_INFINITY;
  const sequences = new Set<number>();

  for (const [index, cohort] of matured.cohorts.entries()) {
    validateMaturedCohort(cohort, index);

    if (sequences.has(cohort.sequence)) {
      throw new RangeError("matured latent cohort sequences must be unique");
    }
    sequences.add(cohort.sequence);

    const lysisAtMinutes = cohortLysisAtMinutes(cohort);
    if (lysisAtMinutes > matured.throughMinutes) {
      throw new RangeError(
        "matured latent cohort cannot precede its lysis boundary",
      );
    }

    if (
      lysisAtMinutes < previousLysisAtMinutes ||
      (lysisAtMinutes === previousLysisAtMinutes &&
        cohort.sequence < previousSequence)
    ) {
      throw new RangeError(
        "matured latent cohorts must remain in deterministic maturity order",
      );
    }

    infectionCount += cohort.infectionCount;
    if (!Number.isSafeInteger(infectionCount)) {
      throw new RangeError(
        "matured latent infection count exceeds safe integer range",
      );
    }

    previousLysisAtMinutes = lysisAtMinutes;
    previousSequence = cohort.sequence;
  }

  if (infectionCount !== matured.infectionCount) {
    throw new RangeError(
      "matured latent infection count must equal the cohort count sum",
    );
  }
}

function validateMaturedCohort(
  cohort: LatentInfectionCohort,
  index: number,
): void {
  if (!isRecord(cohort)) {
    throw new TypeError(`matured cohort ${index} must be an object`);
  }
  nonNegativeSafeInteger(
    `matured cohort ${index} sequence`,
    cohort.sequence,
  );
  positiveSafeInteger(
    `matured cohort ${index} infectionCount`,
    cohort.infectionCount,
  );
  finiteNonNegative(
    `matured cohort ${index} infectedAtMinutes`,
    cohort.infectedAtMinutes,
  );
  finiteNonNegative(
    `matured cohort ${index} latentPeriodMinutes`,
    cohort.latentPeriodMinutes,
  );
}

function requireInDomainLifeHistory(
  lifeHistory: PhageLifeHistoryResolution,
): InDomainPhageLifeHistoryResolution {
  if (!isRecord(lifeHistory)) {
    throw new TypeError("phage life-history resolution must be an object");
  }

  finiteNonNegative(
    "life-history requestedGrowthRatePerHour",
    lifeHistory.requestedGrowthRatePerHour,
  );

  if (lifeHistory.status === "out-of-domain") {
    throw new RangeError(
      "phage lysis requires an in-domain life-history resolution",
    );
  }
  if (lifeHistory.status !== "exact" && lifeHistory.status !== "interpolated") {
    throw new TypeError("unsupported phage life-history resolution status");
  }

  const expectedEvidenceClass =
    lifeHistory.status === "exact" ? "measured" : "derived";
  if (lifeHistory.evidenceClass !== expectedEvidenceClass) {
    throw new TypeError(
      "phage life-history evidence class does not match its resolution status",
    );
  }

  if (!isRecord(lifeHistory.values)) {
    throw new TypeError("in-domain phage life history must include values");
  }
  finiteNonNegative(
    "life-history latentPeriodMinutes",
    lifeHistory.values.latentPeriodMinutes,
  );
  finiteNonNegative(
    "life-history burstSizePfuPerCell",
    lifeHistory.values.burstSizePfuPerCell,
  );

  if (!isRecord(lifeHistory.source)) {
    throw new TypeError("phage life-history resolution must include a source");
  }
  trimmedNonEmpty("life-history source key", lifeHistory.source.key);
  trimmedNonEmpty("life-history source DOI", lifeHistory.source.doi);

  return lifeHistory;
}

function validateLifeHistoryBinding(
  cohorts: readonly LatentInfectionCohort[],
  lifeHistory: InDomainPhageLifeHistoryResolution,
): void {
  for (const cohort of cohorts) {
    if (cohort.latentPeriodMinutes !== lifeHistory.values.latentPeriodMinutes) {
      throw new Error(
        "matured latent cohort latent period does not match the supplied life-history resolution",
      );
    }
  }
}

function trimmedNonEmpty(name: string, value: unknown): void {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(`${name} must be a trimmed non-empty string`);
  }
}

function positiveSafeInteger(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function nonNegativeSafeInteger(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function finiteNonNegative(name: string, value: unknown): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
