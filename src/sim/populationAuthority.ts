export const DISCRETE_POPULATION_AUTHORITY_SCHEMA_VERSION = 1 as const
export const CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION = 1 as const
export const DISCRETE_POPULATION_POLICY_SCHEMA_VERSION = 1 as const

export const FRACTIONAL_CARRY_POPULATION_POLICY_ID =
  'petra-population-authority/fractional-carry-v1' as const

export type PopulationCalibrationEvidenceClass =
  | 'transferred'
  | 'calibrated'
  | 'engineering'

export interface CellEquivalentCalibration {
  readonly schemaVersion: typeof CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION
  readonly id: string
  readonly modelBiomassPerCellEquivalent: number
  readonly provenance: Readonly<{
    readonly classification: PopulationCalibrationEvidenceClass
    readonly sourceKeys: readonly string[]
    readonly limitation: string
  }>
}

export interface DiscretePopulationPolicy {
  readonly schemaVersion: typeof DISCRETE_POPULATION_POLICY_SCHEMA_VERSION
  readonly id: typeof FRACTIONAL_CARRY_POPULATION_POLICY_ID
  readonly evidenceClass: 'numerical-policy'
  readonly standingHostRule: 'floor-current-cell-equivalents-with-residual'
  readonly divisionOpportunityRule: 'cumulative-division-flux-fractional-carry'
  readonly explicitRemovalRule: 'whole-cell-equivalent-atomic'
}

export const FRACTIONAL_CARRY_POPULATION_POLICY: DiscretePopulationPolicy =
  Object.freeze({
    schemaVersion: DISCRETE_POPULATION_POLICY_SCHEMA_VERSION,
    id: FRACTIONAL_CARRY_POPULATION_POLICY_ID,
    evidenceClass: 'numerical-policy',
    standingHostRule: 'floor-current-cell-equivalents-with-residual',
    divisionOpportunityRule:
      'cumulative-division-flux-fractional-carry',
    explicitRemovalRule: 'whole-cell-equivalent-atomic',
  })

export interface DiscretePopulationAuthorityConfig {
  readonly width: number
  readonly height: number
  readonly mask: readonly number[]
  readonly lineageIds: readonly string[]
  readonly calibration: CellEquivalentCalibration
  readonly policy: DiscretePopulationPolicy
}

export interface DiscretePopulationAuthorityState {
  readonly schemaVersion: typeof DISCRETE_POPULATION_AUTHORITY_SCHEMA_VERSION
  readonly configurationIdentity: string
  readonly revision: number
  readonly width: number
  readonly height: number
  readonly lineageIds: readonly string[]
  readonly standingHostCounts: readonly ArrayLike<number>[]
  readonly standingResidualCellEquivalents: readonly ArrayLike<number>[]
  readonly divisionResidualCellEquivalents: readonly ArrayLike<number>[]
}

export interface DiscretePopulationAdvanceResult {
  readonly state: DiscretePopulationAuthorityState
  readonly divisionOpportunities: readonly ArrayLike<number>[]
  readonly totalStandingHosts: number
  readonly totalDivisionOpportunities: number
}

export interface DiscreteHostRemovalPlan {
  readonly state: DiscretePopulationAuthorityState
  readonly modelBiomassToRemove: readonly ArrayLike<number>[]
  readonly totalRemovedHosts: number
}

export function cellEquivalentCalibrationIdentity(
  calibration: CellEquivalentCalibration,
): string {
  validateCellEquivalentCalibration(calibration)
  return JSON.stringify({
    schemaVersion: calibration.schemaVersion,
    id: calibration.id,
    modelBiomassPerCellEquivalent:
      calibration.modelBiomassPerCellEquivalent,
    provenance: {
      classification: calibration.provenance.classification,
      sourceKeys: [...calibration.provenance.sourceKeys].sort(),
    },
  })
}

export function discretePopulationPolicyIdentity(
  policy: DiscretePopulationPolicy,
): string {
  validateDiscretePopulationPolicy(policy)
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    evidenceClass: policy.evidenceClass,
    standingHostRule: policy.standingHostRule,
    divisionOpportunityRule: policy.divisionOpportunityRule,
    explicitRemovalRule: policy.explicitRemovalRule,
  })
}

export function discretePopulationConfigurationIdentity(
  config: DiscretePopulationAuthorityConfig,
): string {
  validateConfig(config)
  return JSON.stringify({
    width: config.width,
    height: config.height,
    mask: Array.from(config.mask),
    lineageIds: Array.from(config.lineageIds),
    calibration: cellEquivalentCalibrationIdentity(config.calibration),
    policy: discretePopulationPolicyIdentity(config.policy),
  })
}

export function createDiscretePopulationAuthorityState(
  config: DiscretePopulationAuthorityConfig,
  lineageBiomass: readonly ArrayLike<number>[],
): DiscretePopulationAuthorityState {
  validateConfig(config)
  validateBiomassChannels('initial lineage biomass', lineageBiomass, config)

  const standing = decomposeStandingBiomass(lineageBiomass, config)
  return {
    schemaVersion: DISCRETE_POPULATION_AUTHORITY_SCHEMA_VERSION,
    configurationIdentity: discretePopulationConfigurationIdentity(config),
    revision: 0,
    width: config.width,
    height: config.height,
    lineageIds: [...config.lineageIds],
    standingHostCounts: standing.counts,
    standingResidualCellEquivalents: standing.residuals,
    divisionResidualCellEquivalents: config.lineageIds.map(
      () => Array(config.width * config.height).fill(0),
    ),
  }
}

/**
 * Advance the shared discrete authority after one already-authoritative ecology
 * transition.
 *
 * Standing hosts are decomposed from the committed continuous biomass exactly
 * once per transition. Division opportunities are independent: they accumulate
 * only the ecology division-flux ledger, so death/spread/net change can never be
 * misread as mutation supply.
 */
export function advanceDiscretePopulationAuthority(
  state: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
  args: {
    readonly currentLineageBiomass: readonly ArrayLike<number>[]
    readonly divisionBiomass: readonly ArrayLike<number>[]
  },
): DiscretePopulationAdvanceResult {
  validateConfig(config)
  validateStateAgainstConfig(state, config)
  validateBiomassChannels(
    'current lineage biomass',
    args.currentLineageBiomass,
    config,
  )
  validateBiomassChannels(
    'division biomass flux',
    args.divisionBiomass,
    config,
  )

  const standing = decomposeStandingBiomass(
    args.currentLineageBiomass,
    config,
  )
  const divisionOpportunities: number[][] = []
  const divisionResidualCellEquivalents: number[][] = []
  let totalDivisionOpportunities = 0

  for (
    let lineageIndex = 0;
    lineageIndex < config.lineageIds.length;
    lineageIndex += 1
  ) {
    const opportunityChannel: number[] = []
    const residualChannel: number[] = []
    const priorResidual =
      state.divisionResidualCellEquivalents[lineageIndex]!
    const flux = args.divisionBiomass[lineageIndex]!

    for (let cell = 0; cell < flux.length; cell += 1) {
      if (config.mask[cell] === 0) {
        if (priorResidual[cell] !== 0) {
          throw new Error(
            'division residual must remain zero outside population mask',
          )
        }
        opportunityChannel.push(0)
        residualChannel.push(0)
        continue
      }

      const producedCellEquivalents =
        flux[cell]! / config.calibration.modelBiomassPerCellEquivalent
      const accumulated = priorResidual[cell]! + producedCellEquivalents
      const split = splitCellEquivalents(
        'accumulated division cell-equivalents',
        accumulated,
      )
      opportunityChannel.push(split.count)
      residualChannel.push(split.residual)
      totalDivisionOpportunities = safeIntegerAdd(
        'total division opportunities',
        totalDivisionOpportunities,
        split.count,
      )
    }

    divisionOpportunities.push(opportunityChannel)
    divisionResidualCellEquivalents.push(residualChannel)
  }

  const nextState: DiscretePopulationAuthorityState = {
    schemaVersion: DISCRETE_POPULATION_AUTHORITY_SCHEMA_VERSION,
    configurationIdentity: state.configurationIdentity,
    revision: safeIntegerAdd('population authority revision', state.revision, 1),
    width: state.width,
    height: state.height,
    lineageIds: [...state.lineageIds],
    standingHostCounts: standing.counts,
    standingResidualCellEquivalents: standing.residuals,
    divisionResidualCellEquivalents,
  }

  return {
    state: nextState,
    divisionOpportunities,
    totalStandingHosts: sumCounts(
      'total standing hosts',
      nextState.standingHostCounts,
    ),
    totalDivisionOpportunities,
  }
}

/**
 * Plan an exact whole-host removal transaction (for example lysis). The caller
 * must subtract the returned model-biomass deltas from the same authoritative
 * lineage/cell channels in the same higher-level commit.
 *
 * Infection without lysis should not use this helper: infected hosts remain
 * standing biomass and susceptibility must be tracked by the phage authority.
 */
export function planDiscreteHostRemoval(
  state: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
  removals: readonly ArrayLike<number>[],
): DiscreteHostRemovalPlan {
  validateConfig(config)
  validateStateAgainstConfig(state, config)
  validateCountChannels('host removals', removals, config)

  const standingHostCounts: number[][] = []
  const modelBiomassToRemove: number[][] = []
  let totalRemovedHosts = 0

  for (
    let lineageIndex = 0;
    lineageIndex < config.lineageIds.length;
    lineageIndex += 1
  ) {
    const nextCountChannel: number[] = []
    const biomassRemovalChannel: number[] = []
    const current = state.standingHostCounts[lineageIndex]!
    const requested = removals[lineageIndex]!

    for (let cell = 0; cell < current.length; cell += 1) {
      const removal = requested[cell]!
      if (removal > current[cell]!) {
        throw new RangeError(
          'host removal cannot exceed authoritative standing host count',
        )
      }
      nextCountChannel.push(current[cell]! - removal)
      const biomassRemoval =
        removal * config.calibration.modelBiomassPerCellEquivalent
      finiteNonNegative('model biomass removal', biomassRemoval)
      biomassRemovalChannel.push(biomassRemoval)
      totalRemovedHosts = safeIntegerAdd(
        'total removed hosts',
        totalRemovedHosts,
        removal,
      )
    }

    standingHostCounts.push(nextCountChannel)
    modelBiomassToRemove.push(biomassRemovalChannel)
  }

  return {
    state: {
      ...cloneDiscretePopulationAuthorityState(state),
      revision: safeIntegerAdd(
        'population authority revision',
        state.revision,
        1,
      ),
      standingHostCounts,
    },
    modelBiomassToRemove,
    totalRemovedHosts,
  }
}

/**
 * Public fail-closed validation boundary for downstream mechanisms that consume
 * discrete population authority without advancing or mutating it.
 */
export function validateDiscretePopulationAuthorityState(
  state: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
): void {
  validateConfig(config)
  validateStateAgainstConfig(state, config)
}

export function restoreDiscretePopulationAuthorityState(
  serialized: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
  currentLineageBiomass: readonly ArrayLike<number>[],
): DiscretePopulationAuthorityState {
  validateConfig(config)
  validateStateAgainstConfig(serialized, config)
  validateBiomassChannels(
    'restored lineage biomass',
    currentLineageBiomass,
    config,
  )
  validateStandingStateAgainstBiomass(
    serialized,
    config,
    currentLineageBiomass,
  )
  return cloneDiscretePopulationAuthorityState(serialized)
}

export function cloneDiscretePopulationAuthorityState(
  state: DiscretePopulationAuthorityState,
): DiscretePopulationAuthorityState {
  return {
    schemaVersion: state.schemaVersion,
    configurationIdentity: state.configurationIdentity,
    revision: state.revision,
    width: state.width,
    height: state.height,
    lineageIds: [...state.lineageIds],
    standingHostCounts: state.standingHostCounts.map((channel) =>
      Array.from(channel),
    ),
    standingResidualCellEquivalents:
      state.standingResidualCellEquivalents.map((channel) =>
        Array.from(channel),
      ),
    divisionResidualCellEquivalents:
      state.divisionResidualCellEquivalents.map((channel) =>
        Array.from(channel),
      ),
  }
}

export function validateCellEquivalentCalibration(
  calibration: CellEquivalentCalibration,
): void {
  if (
    calibration.schemaVersion !== CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION
  ) {
    throw new Error('unsupported cell-equivalent calibration version')
  }
  canonicalIdentity('cell-equivalent calibration id', calibration.id)
  positiveFinite(
    'modelBiomassPerCellEquivalent',
    calibration.modelBiomassPerCellEquivalent,
  )
  if (
    calibration.provenance.classification !== 'transferred' &&
    calibration.provenance.classification !== 'calibrated' &&
    calibration.provenance.classification !== 'engineering'
  ) {
    throw new Error('unsupported cell-equivalent calibration evidence class')
  }
  if (calibration.provenance.limitation.trim().length === 0) {
    throw new Error('cell-equivalent calibration requires a limitation')
  }
  const sourceKeys = calibration.provenance.sourceKeys
  validateCanonicalStringArray(
    'cell-equivalent calibration source keys',
    sourceKeys,
  )
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    throw new Error(
      'cell-equivalent calibration source keys must be unique',
    )
  }
  if (
    calibration.provenance.classification !== 'engineering' &&
    sourceKeys.length === 0
  ) {
    throw new Error(
      'non-engineering cell-equivalent calibration requires source keys',
    )
  }
}

export function validateDiscretePopulationPolicy(
  policy: DiscretePopulationPolicy,
): void {
  if (
    policy.schemaVersion !== DISCRETE_POPULATION_POLICY_SCHEMA_VERSION
  ) {
    throw new Error('unsupported discrete population policy version')
  }
  if (policy.id !== FRACTIONAL_CARRY_POPULATION_POLICY_ID) {
    throw new Error('unsupported discrete population policy id')
  }
  if (
    policy.evidenceClass !== 'numerical-policy' ||
    policy.standingHostRule !==
      'floor-current-cell-equivalents-with-residual' ||
    policy.divisionOpportunityRule !==
      'cumulative-division-flux-fractional-carry' ||
    policy.explicitRemovalRule !== 'whole-cell-equivalent-atomic'
  ) {
    throw new Error('discrete population policy semantics do not match v1')
  }
}

function validateConfig(config: DiscretePopulationAuthorityConfig): void {
  if (
    !Number.isSafeInteger(config.width) ||
    !Number.isSafeInteger(config.height) ||
    config.width <= 0 ||
    config.height <= 0
  ) {
    throw new Error('population authority dimensions must be positive integers')
  }
  const cells = config.width * config.height
  if (!Number.isSafeInteger(cells)) {
    throw new Error('population authority cell count must be a safe integer')
  }
  if (!Array.isArray(config.mask) || config.mask.length !== cells) {
    throw new Error('population authority mask must match dimensions')
  }
  for (let cell = 0; cell < cells; cell += 1) {
    if (!Object.prototype.hasOwnProperty.call(config.mask, cell)) {
      throw new Error('population authority mask must be dense')
    }
    const value = config.mask[cell]
    if (value !== 0 && value !== 1) {
      throw new Error(
        'population authority mask values must be exactly 0 or 1',
      )
    }
  }
  if (!Array.isArray(config.lineageIds) || config.lineageIds.length === 0) {
    throw new Error('population authority requires at least one lineage')
  }
  validateCanonicalStringArray(
    'population lineage ids',
    config.lineageIds,
  )
  if (new Set(config.lineageIds).size !== config.lineageIds.length) {
    throw new Error('population authority lineage ids must be unique')
  }
  validateCellEquivalentCalibration(config.calibration)
  validateDiscretePopulationPolicy(config.policy)
}

function validateStateAgainstConfig(
  state: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
): void {
  if (
    state.schemaVersion !== DISCRETE_POPULATION_AUTHORITY_SCHEMA_VERSION
  ) {
    throw new Error('unsupported discrete population authority state version')
  }
  if (
    state.configurationIdentity !==
    discretePopulationConfigurationIdentity(config)
  ) {
    throw new Error('discrete population configuration identity mismatch')
  }
  if (
    state.width !== config.width ||
    state.height !== config.height ||
    !Array.isArray(state.lineageIds) ||
    state.lineageIds.length !== config.lineageIds.length
  ) {
    throw new Error('discrete population state shape does not match config')
  }
  validateCanonicalStringArray(
    'discrete population state lineage ids',
    state.lineageIds,
  )
  for (let index = 0; index < state.lineageIds.length; index += 1) {
    if (state.lineageIds[index] !== config.lineageIds[index]) {
      throw new Error('discrete population lineage order does not match config')
    }
  }
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    throw new Error(
      'discrete population revision must be a non-negative safe integer',
    )
  }
  validateCountChannels(
    'standing host counts',
    state.standingHostCounts,
    config,
  )
  validateResidualChannels(
    'standing host residuals',
    state.standingResidualCellEquivalents,
    config,
  )
  validateResidualChannels(
    'division opportunity residuals',
    state.divisionResidualCellEquivalents,
    config,
  )
}

function validateStandingStateAgainstBiomass(
  state: DiscretePopulationAuthorityState,
  config: DiscretePopulationAuthorityConfig,
  lineageBiomass: readonly ArrayLike<number>[],
): void {
  for (
    let lineageIndex = 0;
    lineageIndex < config.lineageIds.length;
    lineageIndex += 1
  ) {
    for (
      let cell = 0;
      cell < config.width * config.height;
      cell += 1
    ) {
      const expectedCellEquivalents =
        lineageBiomass[lineageIndex]![cell]! /
        config.calibration.modelBiomassPerCellEquivalent
      const serializedCellEquivalents =
        state.standingHostCounts[lineageIndex]![cell]! +
        state.standingResidualCellEquivalents[lineageIndex]![cell]!
      if (
        !numbersAgree(
          expectedCellEquivalents,
          serializedCellEquivalents,
        )
      ) {
        throw new Error(
          'standing host authority does not match continuous biomass',
        )
      }
    }
  }
}

function validateBiomassChannels(
  name: string,
  channels: readonly ArrayLike<number>[],
  config: DiscretePopulationAuthorityConfig,
): void {
  validateChannelShape(name, channels, config)
  for (const channel of channels) {
    for (let cell = 0; cell < channel.length; cell += 1) {
      const value = channel[cell]!
      finiteNonNegative(name, value)
      if (config.mask[cell] === 0 && value !== 0) {
        throw new Error(name + ' must be zero outside population mask')
      }
    }
  }
}

function validateCountChannels(
  name: string,
  channels: readonly ArrayLike<number>[],
  config: DiscretePopulationAuthorityConfig,
): void {
  validateChannelShape(name, channels, config)
  for (const channel of channels) {
    for (let cell = 0; cell < channel.length; cell += 1) {
      const value = channel[cell]!
      if (!Number.isSafeInteger(value) || value < 0) {
        throw new RangeError(name + ' must contain non-negative safe integers')
      }
      if (config.mask[cell] === 0 && value !== 0) {
        throw new Error(name + ' must be zero outside population mask')
      }
    }
  }
}

function validateResidualChannels(
  name: string,
  channels: readonly ArrayLike<number>[],
  config: DiscretePopulationAuthorityConfig,
): void {
  validateChannelShape(name, channels, config)
  for (const channel of channels) {
    for (let cell = 0; cell < channel.length; cell += 1) {
      const value = channel[cell]!
      if (!Number.isFinite(value) || value < 0 || value >= 1) {
        throw new RangeError(name + ' must contain finite values in [0, 1)')
      }
      if (config.mask[cell] === 0 && value !== 0) {
        throw new Error(name + ' must be zero outside population mask')
      }
    }
  }
}

function validateChannelShape(
  name: string,
  channels: readonly ArrayLike<number>[],
  config: DiscretePopulationAuthorityConfig,
): void {
  const cells = config.width * config.height
  if (
    !Array.isArray(channels) ||
    channels.length !== config.lineageIds.length
  ) {
    throw new Error(name + ' channels must match lineage/grid dimensions')
  }
  for (let index = 0; index < channels.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(channels, index)) {
      throw new Error(name + ' channels must be dense')
    }
    const channel = channels[index]
    if (
      channel === null ||
      typeof channel !== 'object' ||
      !Number.isSafeInteger(channel.length) ||
      channel.length !== cells
    ) {
      throw new Error(name + ' channels must match lineage/grid dimensions')
    }
  }
}

function decomposeStandingBiomass(
  lineageBiomass: readonly ArrayLike<number>[],
  config: DiscretePopulationAuthorityConfig,
): {
  readonly counts: number[][]
  readonly residuals: number[][]
} {
  const counts: number[][] = []
  const residuals: number[][] = []

  for (
    let lineageIndex = 0;
    lineageIndex < config.lineageIds.length;
    lineageIndex += 1
  ) {
    const countChannel: number[] = []
    const residualChannel: number[] = []
    for (
      let cell = 0;
      cell < config.width * config.height;
      cell += 1
    ) {
      if (config.mask[cell] === 0) {
        countChannel.push(0)
        residualChannel.push(0)
        continue
      }
      const cellEquivalents =
        lineageBiomass[lineageIndex]![cell]! /
        config.calibration.modelBiomassPerCellEquivalent
      const split = splitCellEquivalents(
        'standing host cell-equivalents',
        cellEquivalents,
      )
      countChannel.push(split.count)
      residualChannel.push(split.residual)
    }
    counts.push(countChannel)
    residuals.push(residualChannel)
  }

  return { counts, residuals }
}

function splitCellEquivalents(
  name: string,
  value: number,
): { readonly count: number; readonly residual: number } {
  finiteNonNegative(name, value)
  if (value > Number.MAX_SAFE_INTEGER) {
    throw new RangeError(name + ' exceeds safe integer count authority')
  }

  const count = Math.floor(value)
  const residual = value - count
  if (
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isFinite(residual) ||
    residual < 0 ||
    residual >= 1
  ) {
    throw new Error(name + ' could not be decomposed safely')
  }
  return { count, residual }
}

function sumCounts(
  name: string,
  channels: readonly ArrayLike<number>[],
): number {
  let total = 0
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      total = safeIntegerAdd(name, total, channel[index]!)
    }
  }
  return total
}

function safeIntegerAdd(name: string, left: number, right: number): number {
  const value = left + right
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(name + ' exceeds the safe integer domain')
  }
  return value
}

function validateCanonicalStringArray(
  name: string,
  values: readonly string[],
): void {
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) {
      throw new Error(name + ' must be dense')
    }
    canonicalIdentity(name + ' at index ' + index, values[index]!)
  }
}

function canonicalIdentity(name: string, value: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(name + ' must be a canonical non-empty string')
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(name + ' must be finite and non-negative')
  }
}

function positiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(name + ' must be finite and positive')
  }
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true
  return (
    Math.abs(left - right) <=
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right))
  )
}
