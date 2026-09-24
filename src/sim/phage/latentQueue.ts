export const PHAGE_LATENT_QUEUE_SCHEMA_VERSION = 1 as const;

export interface LatentInfectionCohort {
  readonly sequence: number;
  readonly infectionCount: number;
  readonly infectedAtMinutes: number;
  readonly latentPeriodMinutes: number;
}

export interface LatentInfectionQueueState {
  readonly schemaVersion: typeof PHAGE_LATENT_QUEUE_SCHEMA_VERSION;
  readonly currentTimeMinutes: number;
  readonly nextSequence: number;
  readonly cohorts: readonly LatentInfectionCohort[];
}

export interface MaturedLatentInfections {
  readonly throughMinutes: number;
  readonly infectionCount: number;
  readonly cohorts: readonly LatentInfectionCohort[];
}

/**
 * Framework-neutral delayed-infection scheduler for already-authoritative
 * infection counts.
 *
 * This module deliberately does not convert adsorbed PFU into infections and
 * does not generate burst PFU. Those are separate mechanism contracts.
 */
export function createLatentInfectionQueue(
  currentTimeMinutes = 0,
): LatentInfectionQueueState {
  finiteNonNegative("currentTimeMinutes", currentTimeMinutes);
  return {
    schemaVersion: PHAGE_LATENT_QUEUE_SCHEMA_VERSION,
    currentTimeMinutes,
    nextSequence: 0,
    cohorts: [],
  };
}

export function scheduleLatentInfections(
  state: LatentInfectionQueueState,
  args: {
    readonly infectionCount: number;
    readonly infectedAtMinutes: number;
    readonly latentPeriodMinutes: number;
  },
): LatentInfectionQueueState {
  validateLatentInfectionQueue(state);
  nonNegativeSafeInteger("infectionCount", args.infectionCount);
  finiteNonNegative("infectedAtMinutes", args.infectedAtMinutes);
  finiteNonNegative("latentPeriodMinutes", args.latentPeriodMinutes);

  if (args.infectedAtMinutes < state.currentTimeMinutes) {
    throw new RangeError(
      "infectedAtMinutes cannot precede the latent queue current time",
    );
  }

  if (args.infectionCount === 0) return state;

  if (state.nextSequence === Number.MAX_SAFE_INTEGER) {
    throw new RangeError(
      "latent cohort sequence allocation would exceed safe integer range",
    );
  }

  const cohort: LatentInfectionCohort = {
    sequence: state.nextSequence,
    infectionCount: args.infectionCount,
    infectedAtMinutes: args.infectedAtMinutes,
    latentPeriodMinutes: args.latentPeriodMinutes,
  };

  const cohorts = [...state.cohorts, cohort].sort(compareCohorts);
  return {
    ...state,
    nextSequence: state.nextSequence + 1,
    cohorts,
  };
}

export function advanceLatentInfectionQueue(
  state: LatentInfectionQueueState,
  throughMinutes: number,
): {
  readonly state: LatentInfectionQueueState;
  readonly matured: MaturedLatentInfections;
} {
  validateLatentInfectionQueue(state);
  finiteNonNegative("throughMinutes", throughMinutes);

  if (throughMinutes < state.currentTimeMinutes) {
    throw new RangeError(
      "latent infection queue cannot advance backward in biological time",
    );
  }

  const matured: LatentInfectionCohort[] = [];
  const pending: LatentInfectionCohort[] = [];
  let infectionCount = 0;

  for (const cohort of state.cohorts) {
    if (cohortLysisAtMinutes(cohort) <= throughMinutes) {
      matured.push(cohort);
      infectionCount += cohort.infectionCount;
      if (!Number.isSafeInteger(infectionCount)) {
        throw new RangeError("matured infection count exceeds safe integer range");
      }
    } else {
      pending.push(cohort);
    }
  }

  return {
    state: {
      ...state,
      currentTimeMinutes: throughMinutes,
      cohorts: pending,
    },
    matured: {
      throughMinutes,
      infectionCount,
      cohorts: matured,
    },
  };
}

export function validateLatentInfectionQueue(
  state: LatentInfectionQueueState,
): void {
  if (state.schemaVersion !== PHAGE_LATENT_QUEUE_SCHEMA_VERSION) {
    throw new Error("unsupported phage latent queue schema version");
  }
  finiteNonNegative("currentTimeMinutes", state.currentTimeMinutes);
  nonNegativeSafeInteger("nextSequence", state.nextSequence);

  let previous: LatentInfectionCohort | null = null;
  const sequences = new Set<number>();

  for (const cohort of state.cohorts) {
    nonNegativeSafeInteger("cohort.sequence", cohort.sequence);
    if (cohort.sequence >= state.nextSequence) {
      throw new RangeError(
        "latent cohort sequence must be lower than nextSequence",
      );
    }
    if (sequences.has(cohort.sequence)) {
      throw new RangeError("latent cohort sequences must be unique");
    }
    sequences.add(cohort.sequence);

    positiveSafeInteger("cohort.infectionCount", cohort.infectionCount);
    finiteNonNegative("cohort.infectedAtMinutes", cohort.infectedAtMinutes);
    finiteNonNegative("cohort.latentPeriodMinutes", cohort.latentPeriodMinutes);
    const lysisAtMinutes = cohortLysisAtMinutes(cohort);
    if (lysisAtMinutes < state.currentTimeMinutes) {
      throw new RangeError(
        "latent queue cannot retain cohorts that already matured",
      );
    }
    if (previous !== null && compareCohorts(previous, cohort) > 0) {
      throw new RangeError(
        "latent infection cohorts must remain in deterministic maturity order",
      );
    }
    previous = cohort;
  }
}

function compareCohorts(
  left: LatentInfectionCohort,
  right: LatentInfectionCohort,
): number {
  return (
    cohortLysisAtMinutes(left) - cohortLysisAtMinutes(right) ||
    left.sequence - right.sequence
  );
}

export function cohortLysisAtMinutes(
  cohort: Pick<
    LatentInfectionCohort,
    "infectedAtMinutes" | "latentPeriodMinutes"
  >,
): number {
  finiteNonNegative("cohort.infectedAtMinutes", cohort.infectedAtMinutes);
  finiteNonNegative("cohort.latentPeriodMinutes", cohort.latentPeriodMinutes);
  const value = cohort.infectedAtMinutes + cohort.latentPeriodMinutes;
  finiteNonNegative("cohort lysis time", value);
  return value;
}

function positiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
