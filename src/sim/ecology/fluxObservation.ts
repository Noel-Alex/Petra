import type { EcologyState, EcologyStepResult } from './growth'

export const ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION = 1 as const
export const ECOLOGY_FLUX_BIOMASS_UNIT = 'model-biomass' as const

/**
 * Step-local read-only observation of the ecology kernel's exact local
 * growth/loss ledger.
 *
 * This is derived output, not checkpoint state and not future biological
 * authority. It records continuous model-biomass flux over one ecology
 * interval. It is not a count of cells or discrete division events.
 *
 * `netLocalBiomassChangeByCell` is division minus first-order loss before
 * coarse spatial spread. It therefore must not be interpreted as the final
 * per-cell biomass delta after the complete ecology step.
 */
export interface EcologyFluxObservation {
  readonly schemaVersion: typeof ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION
  readonly biomassUnit: typeof ECOLOGY_FLUX_BIOMASS_UNIT
  readonly width: number
  readonly height: number
  readonly mask: readonly number[]
  readonly lineageIds: readonly string[]
  /**
   * Duration in the caller/composition's configured ecology time unit.
   * The generic ecology layer deliberately does not relabel this as hours.
   */
  readonly stepDuration: number
  readonly divisionBiomassByLineage: readonly (readonly number[])[]
  readonly deathBiomassByLineage: readonly (readonly number[])[]
  readonly divisionBiomassByCell: readonly number[]
  readonly deathBiomassByCell: readonly number[]
  readonly netLocalBiomassChangeByCell: readonly number[]
  readonly totalDivisionBiomass: number
  readonly totalDeathBiomass: number
}

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`)
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
}

function canonicalIdentity(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be canonical with no surrounding whitespace`)
  }
}

function aggregateTolerance(
  expected: number,
  actual: number,
  cellCount: number,
  lineageCount: number,
): number {
  const operations = Math.max(8, cellCount * Math.max(1, lineageCount))
  return Number.EPSILON * Math.max(1, Math.abs(expected), Math.abs(actual)) * operations
}

function assertAggregateClose(
  name: string,
  expected: number,
  actual: number,
  cellCount: number,
  lineageCount: number,
): void {
  if (
    Math.abs(expected - actual) >
    aggregateTolerance(expected, actual, cellCount, lineageCount)
  ) {
    throw new Error(
      `${name} does not match the ecology step ledger: expected ${expected}, got ${actual}`,
    )
  }
}

function freezeChannel(channel: readonly number[]): readonly number[] {
  return Object.freeze([...channel])
}

export function projectEcologyFluxObservation(args: {
  readonly state: Pick<EcologyState, 'width' | 'height' | 'mask'>
  readonly lineageIds: readonly string[]
  readonly stepDuration: number
  readonly result: EcologyStepResult
}): EcologyFluxObservation {
  const { state, lineageIds, result, stepDuration } = args

  assertPositiveSafeInteger('width', state.width)
  assertPositiveSafeInteger('height', state.height)
  const cellCount = state.width * state.height
  if (!Number.isSafeInteger(cellCount)) {
    throw new Error('ecology flux observation grid cell count must be a safe integer')
  }
  if (state.mask.length !== cellCount) {
    throw new Error('ecology flux observation mask must match grid dimensions')
  }
  assertFiniteNonNegative('stepDuration', stepDuration)

  if (
    result.fluxes.divisionBiomass.length !== lineageIds.length ||
    result.fluxes.deathBiomass.length !== lineageIds.length
  ) {
    throw new Error('ecology flux observation requires one flux channel per lineage id')
  }

  lineageIds.forEach((lineageId, index) =>
    canonicalIdentity(`lineage id at index ${index}`, lineageId),
  )
  if (new Set(lineageIds).size !== lineageIds.length) {
    throw new Error('ecology flux observation lineage ids must be unique')
  }

  const mask = Array.from(state.mask)
  for (let cell = 0; cell < cellCount; cell += 1) {
    const value = mask[cell]!
    if (value !== 0 && value !== 1) {
      throw new Error(
        `ecology flux observation mask must be binary 0 or 1 at cell ${cell}`,
      )
    }
  }

  const divisionByCell = new Array<number>(cellCount).fill(0)
  const deathByCell = new Array<number>(cellCount).fill(0)
  const divisionByLineage: readonly number[][] = result.fluxes.divisionBiomass.map(
    (channel, lineageIndex) => {
      if (channel.length !== cellCount) {
        throw new Error(
          `division flux channel ${lineageIndex} must match grid dimensions`,
        )
      }
      const copied = Array.from(channel)
      for (let cell = 0; cell < cellCount; cell += 1) {
        const value = copied[cell]!
        assertFiniteNonNegative(
          `division flux[${lineageIndex}][${cell}]`,
          value,
        )
        if (mask[cell] === 0 && value !== 0) {
          throw new Error(
            `division flux must be zero outside ecology mask at cell ${cell}`,
          )
        }
        divisionByCell[cell] = divisionByCell[cell]! + value
      }
      return copied
    },
  )
  const deathByLineage: readonly number[][] = result.fluxes.deathBiomass.map(
    (channel, lineageIndex) => {
      if (channel.length !== cellCount) {
        throw new Error(
          `death flux channel ${lineageIndex} must match grid dimensions`,
        )
      }
      const copied = Array.from(channel)
      for (let cell = 0; cell < cellCount; cell += 1) {
        const value = copied[cell]!
        assertFiniteNonNegative(
          `death flux[${lineageIndex}][${cell}]`,
          value,
        )
        if (mask[cell] === 0 && value !== 0) {
          throw new Error(
            `death flux must be zero outside ecology mask at cell ${cell}`,
          )
        }
        deathByCell[cell] = deathByCell[cell]! + value
      }
      return copied
    },
  )

  let totalDivisionBiomass = 0
  let totalDeathBiomass = 0
  const netLocalBiomassChangeByCell = new Array<number>(cellCount)
  for (let cell = 0; cell < cellCount; cell += 1) {
    const division = divisionByCell[cell]!
    const death = deathByCell[cell]!
    const net = division - death
    if (!Number.isFinite(net)) {
      throw new Error(`net local biomass change became non-finite at cell ${cell}`)
    }
    netLocalBiomassChangeByCell[cell] = net
    totalDivisionBiomass += division
    totalDeathBiomass += death
  }

  assertAggregateClose(
    'total division biomass',
    result.metrics.divisionBiomass,
    totalDivisionBiomass,
    cellCount,
    lineageIds.length,
  )
  assertAggregateClose(
    'total death biomass',
    result.metrics.deathBiomass,
    totalDeathBiomass,
    cellCount,
    lineageIds.length,
  )

  return Object.freeze({
    schemaVersion: ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
    biomassUnit: ECOLOGY_FLUX_BIOMASS_UNIT,
    width: state.width,
    height: state.height,
    mask: freezeChannel(mask),
    lineageIds: Object.freeze([...lineageIds]),
    stepDuration,
    divisionBiomassByLineage: Object.freeze(
      divisionByLineage.map((channel) => freezeChannel(channel)),
    ),
    deathBiomassByLineage: Object.freeze(
      deathByLineage.map((channel) => freezeChannel(channel)),
    ),
    divisionBiomassByCell: freezeChannel(divisionByCell),
    deathBiomassByCell: freezeChannel(deathByCell),
    netLocalBiomassChangeByCell: freezeChannel(netLocalBiomassChangeByCell),
    totalDivisionBiomass,
    totalDeathBiomass,
  })
}
