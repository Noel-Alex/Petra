export const PERSISTENCE_COMPARTMENT_STATE_SCHEMA_VERSION = 1 as const
export const PERSISTENCE_SWITCHING_POLICY_VERSION = 1 as const

export const PERSISTENCE_SWITCHING_MODE =
  'deterministic-compartment-expectation' as const

/**
 * Reversible phenotype compartments inside one already-authoritative
 * lineage/genotype. These are model-biomass partitions, not cell counts.
 */
export interface PersistenceCompartmentState {
  readonly schemaVersion: typeof PERSISTENCE_COMPARTMENT_STATE_SCHEMA_VERSION
  readonly normalModelBiomass: number
  readonly persisterModelBiomass: number
}

/**
 * Continuous-time two-state switching policy:
 *
 *   N --normalToPersisterPerHour--> Q
 *   Q --persisterToNormalPerHour--> N
 *
 * The v1 policy advances the deterministic compartment expectation exactly for
 * constant rates over one supplied biological interval. It does not claim
 * individual-cell switching events and consumes no RNG.
 */
export interface PersistenceSwitchingPolicy {
  readonly version: typeof PERSISTENCE_SWITCHING_POLICY_VERSION
  readonly mode: typeof PERSISTENCE_SWITCHING_MODE
  readonly normalToPersisterPerHour: number
  readonly persisterToNormalPerHour: number
}

const STATE_KEYS = new Set([
  'schemaVersion',
  'normalModelBiomass',
  'persisterModelBiomass',
])

const POLICY_KEYS = new Set([
  'version',
  'mode',
  'normalToPersisterPerHour',
  'persisterToNormalPerHour',
])

export function createPersistenceCompartmentState(args: {
  readonly normalModelBiomass: number
  readonly persisterModelBiomass: number
}): PersistenceCompartmentState {
  const state: PersistenceCompartmentState = {
    schemaVersion: PERSISTENCE_COMPARTMENT_STATE_SCHEMA_VERSION,
    normalModelBiomass: args.normalModelBiomass,
    persisterModelBiomass: args.persisterModelBiomass,
  }
  assertPersistenceCompartmentState(state)
  return freezeState(state)
}

export function assertPersistenceCompartmentState(
  value: unknown,
): asserts value is PersistenceCompartmentState {
  const state = requireRecord(value, 'persistence compartment state')
  assertOnlyKeys(state, STATE_KEYS, 'persistence compartment state')
  if (
    state.schemaVersion !== PERSISTENCE_COMPARTMENT_STATE_SCHEMA_VERSION
  ) {
    throw new Error('unsupported persistence compartment state schema version')
  }

  const normal = finiteNonNegative(
    'persistence normal model biomass',
    state.normalModelBiomass,
  )
  const persister = finiteNonNegative(
    'persistence persister model biomass',
    state.persisterModelBiomass,
  )
  if (!Number.isFinite(normal + persister)) {
    throw new RangeError(
      'persistence total model biomass must remain finite',
    )
  }
}

export function assertPersistenceSwitchingPolicy(
  value: unknown,
): asserts value is PersistenceSwitchingPolicy {
  const policy = requireRecord(value, 'persistence switching policy')
  assertOnlyKeys(policy, POLICY_KEYS, 'persistence switching policy')

  if (policy.version !== PERSISTENCE_SWITCHING_POLICY_VERSION) {
    throw new Error('unsupported persistence switching policy version')
  }
  if (policy.mode !== PERSISTENCE_SWITCHING_MODE) {
    throw new Error('unsupported persistence switching mode')
  }

  const normalToPersister = finiteNonNegative(
    'persistence normal-to-persister rate',
    policy.normalToPersisterPerHour,
  )
  const persisterToNormal = finiteNonNegative(
    'persistence persister-to-normal rate',
    policy.persisterToNormalPerHour,
  )
  if (!Number.isFinite(normalToPersister + persisterToNormal)) {
    throw new RangeError(
      'persistence switching rate sum must remain finite',
    )
  }
}

/**
 * Stable semantic identity for later composed fingerprint/checkpoint binding.
 *
 * No source or scenario identity is invented here; a scientific preset must
 * bind its own provenance separately.
 */
export function persistenceSwitchingPolicyIdentity(
  policy: unknown,
): string {
  assertPersistenceSwitchingPolicy(policy)
  return [
    'persistence-switching',
    'v1',
    PERSISTENCE_SWITCHING_MODE,
    'n-to-q=' + canonicalNumber(policy.normalToPersisterPerHour),
    'q-to-n=' + canonicalNumber(policy.persisterToNormalPerHour),
  ].join(':')
}

/**
 * Advance reversible N/Q phenotype switching for one existing lineage/genotype.
 *
 * For constant rates a=N→Q and b=Q→N, the two-state continuous-time system has
 * the exact expectation
 *
 *   N(t+dt) = N_eq + (N(t) - N_eq) exp(-(a+b) dt)
 *
 * with N_eq = (N+Q) b/(a+b). The implementation uses the equivalent transition
 * fraction -expm1(-(a+b)dt) for numerical accuracy at small intervals.
 *
 * Switching is conservative: it neither creates nor removes model biomass,
 * creates no lineage/genotype identity, consumes no RNG, and applies no growth
 * or drug loss. Those mechanisms must be composed explicitly by higher-level
 * authority.
 */
export function stepPersistenceSwitching(
  stateValue: unknown,
  policyValue: unknown,
  durationHours: number,
): PersistenceCompartmentState {
  assertPersistenceCompartmentState(stateValue)
  assertPersistenceSwitchingPolicy(policyValue)
  const duration = finiteNonNegative(
    'persistence switching duration hours',
    durationHours,
  )

  const normal = stateValue.normalModelBiomass
  const persister = stateValue.persisterModelBiomass
  const total = normal + persister
  const normalToPersister = policyValue.normalToPersisterPerHour
  const persisterToNormal = policyValue.persisterToNormalPerHour
  const totalSwitchingRate = normalToPersister + persisterToNormal

  if (duration === 0 || total === 0 || totalSwitchingRate === 0) {
    return freezeState(stateValue)
  }

  const transitionFraction = -Math.expm1(-totalSwitchingRate * duration)
  if (
    !Number.isFinite(transitionFraction) ||
    transitionFraction < 0 ||
    transitionFraction > 1
  ) {
    throw new RangeError(
      'persistence switching transition fraction left the probability domain',
    )
  }

  const equilibriumNormal =
    total * (persisterToNormal / totalSwitchingRate)
  const nextNormal =
    normal + (equilibriumNormal - normal) * transitionFraction
  const nextPersister = total - nextNormal

  const next = createPersistenceCompartmentState({
    normalModelBiomass: normalizeZero(nextNormal),
    persisterModelBiomass: normalizeZero(nextPersister),
  })

  // Keep conservation as an executable numerical invariant. This does not
  // repair caller state or clamp a scientific quantity.
  const nextTotal =
    next.normalModelBiomass + next.persisterModelBiomass
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(total)) * 8
  if (Math.abs(nextTotal - total) > tolerance) {
    throw new Error(
      'persistence switching failed model-biomass conservation',
    )
  }

  return next
}

export function persistenceTotalModelBiomass(
  stateValue: unknown,
): number {
  assertPersistenceCompartmentState(stateValue)
  return stateValue.normalModelBiomass + stateValue.persisterModelBiomass
}

function freezeState(
  state: PersistenceCompartmentState,
): PersistenceCompartmentState {
  return Object.freeze({
    schemaVersion: PERSISTENCE_COMPARTMENT_STATE_SCHEMA_VERSION,
    normalModelBiomass: normalizeZero(state.normalModelBiomass),
    persisterModelBiomass: normalizeZero(state.persisterModelBiomass),
  })
}

function canonicalNumber(value: number): string {
  return String(normalizeZero(value))
}

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value
}

function finiteNonNegative(name: string, value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < 0
  ) {
    throw new RangeError(`${name} must be finite and non-negative`)
  }
  return normalizeZero(value)
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  name: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(
        `${name} contains unsupported field ${JSON.stringify(key)}`,
      )
    }
  }
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}
