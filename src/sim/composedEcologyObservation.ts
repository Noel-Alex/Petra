import type { EcologyFluxObservation } from './ecology/fluxObservation'
import {
  ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
} from './ecology/fluxObservation'
import {
  assertSameComposedStepObservationPosition,
  type ComposedStepObservationPosition,
} from './composedObservationTransaction'

export const COMPOSED_ECOLOGY_OBSERVATION_ENVELOPE_VERSION = 1 as const

export interface ComposedEcologyObservationEnvelope {
  readonly version: typeof COMPOSED_ECOLOGY_OBSERVATION_ENVELOPE_VERSION
  readonly position: ComposedStepObservationPosition
  readonly observation: EcologyFluxObservation
  readonly intervalStartSimulationTimeHours: number
  readonly intervalEndSimulationTimeHours: number
}

function canonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be a canonical non-empty string`)
  }
}

function positiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`)
  }
}

function finitePositive(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be finite and positive`)
  }
}

function finite(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be finite`)
  }
}

function sameDenseArray<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (!(index in a) || !(index in b) || a[index] !== b[index]) {
      return false
    }
  }
  return true
}

function assertCellChannel(
  name: string,
  values: readonly number[],
  cellCount: number,
  predicate: (value: number) => boolean,
): void {
  if (values.length !== cellCount) {
    throw new Error(`${name} must match composed observation grid dimensions`)
  }
  for (let index = 0; index < values.length; index += 1) {
    if (!(index in values)) {
      throw new Error(`${name} must be dense`)
    }
    const value = values[index]!
    finite(`${name}[${index}]`, value)
    if (!predicate(value)) {
      throw new Error(`${name} contains an invalid value at index ${index}`)
    }
  }
}

function validateObservationStructure(
  observation: EcologyFluxObservation,
): void {
  if (
    observation.schemaVersion !== ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION
  ) {
    throw new Error(
      `unsupported ecology flux observation schema version: ${observation.schemaVersion}`,
    )
  }
  positiveSafeInteger('ecology observation width', observation.width)
  positiveSafeInteger('ecology observation height', observation.height)
  const cellCount = observation.width * observation.height
  if (!Number.isSafeInteger(cellCount)) {
    throw new Error('ecology observation cell count must be a safe integer')
  }

  canonicalText('ecology observation biomassUnit', observation.biomassUnit)
  canonicalText('ecology observation timeUnit', observation.timeUnit)
  finitePositive('ecology observation stepDuration', observation.stepDuration)

  if (observation.mask.length !== cellCount) {
    throw new Error('ecology observation mask must match grid dimensions')
  }
  for (let index = 0; index < observation.mask.length; index += 1) {
    if (!(index in observation.mask)) {
      throw new Error('ecology observation mask must be dense')
    }
    const value = observation.mask[index]
    if (value !== 0 && value !== 1) {
      throw new Error(
        `ecology observation mask must be binary at index ${index}`,
      )
    }
  }

  if (observation.lineageIds.length === 0) {
    throw new Error('ecology observation must contain at least one lineage')
  }
  const seenLineages = new Set<string>()
  for (let index = 0; index < observation.lineageIds.length; index += 1) {
    if (!(index in observation.lineageIds)) {
      throw new Error('ecology observation lineageIds must be dense')
    }
    const id = observation.lineageIds[index]!
    canonicalText(`ecology observation lineage id at index ${index}`, id)
    if (seenLineages.has(id)) {
      throw new Error(`duplicate ecology observation lineage id: ${id}`)
    }
    seenLineages.add(id)
  }

  for (const [name, channels] of [
    ['divisionBiomassByLineage', observation.divisionBiomassByLineage],
    ['deathBiomassByLineage', observation.deathBiomassByLineage],
  ] as const) {
    if (channels.length !== observation.lineageIds.length) {
      throw new Error(`${name} must contain one channel per lineage`)
    }
    for (let lineage = 0; lineage < channels.length; lineage += 1) {
      if (!(lineage in channels)) {
        throw new Error(`${name} must be dense`)
      }
      assertCellChannel(
        `${name}[${lineage}]`,
        channels[lineage]!,
        cellCount,
        (value) => value >= 0,
      )
    }
  }

  for (const [name, values, predicate] of [
    [
      'divisionBiomassByCell',
      observation.divisionBiomassByCell,
      (value: number) => value >= 0,
    ],
    [
      'deathBiomassByCell',
      observation.deathBiomassByCell,
      (value: number) => value >= 0,
    ],
    [
      'netLocalBiomassChangeByCell',
      observation.netLocalBiomassChangeByCell,
      (_value: number) => true,
    ],
    [
      'averageDivisionBiomassRateByCell',
      observation.averageDivisionBiomassRateByCell,
      (value: number) => value >= 0,
    ],
    [
      'averageDeathBiomassRateByCell',
      observation.averageDeathBiomassRateByCell,
      (value: number) => value >= 0,
    ],
    [
      'averageNetLocalBiomassRateByCell',
      observation.averageNetLocalBiomassRateByCell,
      (_value: number) => true,
    ],
  ] as const) {
    assertCellChannel(name, values, cellCount, predicate)
  }

  if (
    !Number.isFinite(observation.totalDivisionBiomass) ||
    observation.totalDivisionBiomass < 0
  ) {
    throw new Error(
      'ecology observation totalDivisionBiomass must be finite and non-negative',
    )
  }
  if (
    !Number.isFinite(observation.totalDeathBiomass) ||
    observation.totalDeathBiomass < 0
  ) {
    throw new Error(
      'ecology observation totalDeathBiomass must be finite and non-negative',
    )
  }
}

function assertObservationMatchesPosition(
  position: ComposedStepObservationPosition,
  observation: EcologyFluxObservation,
): void {
  validateObservationStructure(observation)
  assertSameComposedStepObservationPosition(position, position)

  if (
    observation.width !== position.width ||
    observation.height !== position.height
  ) {
    throw new Error(
      'ecology observation dimensions do not match the accepted composed position',
    )
  }
  if (!sameDenseArray(observation.mask, position.mask)) {
    throw new Error(
      'ecology observation mask does not match the accepted composed position',
    )
  }
  if (!sameDenseArray(observation.lineageIds, position.lineageIds)) {
    throw new Error(
      'ecology observation lineage order does not match the accepted composed position',
    )
  }

  if (observation.biomassUnit !== 'model-biomass') {
    throw new Error(
      'composed ecology observation biomassUnit must be model-biomass',
    )
  }
  if (observation.timeUnit !== 'hour') {
    throw new Error('composed ecology observation timeUnit must be hour')
  }

  if (position.simulationTimeHours < observation.stepDuration) {
    throw new Error(
      'ecology observation duration cannot precede simulation time zero',
    )
  }
}

function freezeChannel(values: readonly number[]): readonly number[] {
  return Object.freeze([...values])
}

function cloneObservation(
  observation: EcologyFluxObservation,
): EcologyFluxObservation {
  return Object.freeze({
    ...observation,
    mask: freezeChannel(observation.mask),
    lineageIds: Object.freeze([...observation.lineageIds]),
    divisionBiomassByLineage: Object.freeze(
      observation.divisionBiomassByLineage.map((channel) =>
        freezeChannel(channel),
      ),
    ),
    deathBiomassByLineage: Object.freeze(
      observation.deathBiomassByLineage.map((channel) =>
        freezeChannel(channel),
      ),
    ),
    divisionBiomassByCell: freezeChannel(observation.divisionBiomassByCell),
    deathBiomassByCell: freezeChannel(observation.deathBiomassByCell),
    netLocalBiomassChangeByCell: freezeChannel(
      observation.netLocalBiomassChangeByCell,
    ),
    averageDivisionBiomassRateByCell: freezeChannel(
      observation.averageDivisionBiomassRateByCell,
    ),
    averageDeathBiomassRateByCell: freezeChannel(
      observation.averageDeathBiomassRateByCell,
    ),
    averageNetLocalBiomassRateByCell: freezeChannel(
      observation.averageNetLocalBiomassRateByCell,
    ),
  })
}

function clonePosition(
  position: ComposedStepObservationPosition,
): ComposedStepObservationPosition {
  const copy = structuredClone(position)
  return Object.freeze({
    ...copy,
    mask: Object.freeze([...copy.mask]),
    lineageIds: Object.freeze([...copy.lineageIds]),
    genotypeIds: Object.freeze([...copy.genotypeIds]),
  })
}

/**
 * Structurally binds one detached ecology-flux observation to one exact accepted
 * composed-state position.
 *
 * This helper does not prove causal provenance by itself. The composed engine
 * must create the position and observation from the same accepted ecology step
 * transaction before publishing this envelope. Runtime history generation
 * identity remains an app/runtime concern and is intentionally absent here.
 */
export function createComposedEcologyObservationEnvelope(
  position: ComposedStepObservationPosition,
  observation: EcologyFluxObservation,
): ComposedEcologyObservationEnvelope {
  assertObservationMatchesPosition(position, observation)

  const intervalEndSimulationTimeHours = position.simulationTimeHours
  const intervalStartSimulationTimeHours =
    intervalEndSimulationTimeHours - observation.stepDuration
  if (
    !Number.isFinite(intervalStartSimulationTimeHours) ||
    intervalStartSimulationTimeHours < 0
  ) {
    throw new Error('composed ecology observation interval is invalid')
  }

  return Object.freeze({
    version: COMPOSED_ECOLOGY_OBSERVATION_ENVELOPE_VERSION,
    position: clonePosition(position),
    observation: cloneObservation(observation),
    intervalStartSimulationTimeHours,
    intervalEndSimulationTimeHours,
  })
}

export function assertComposedEcologyObservationEnvelopeMatchesPosition(
  expectedPosition: ComposedStepObservationPosition,
  envelope: ComposedEcologyObservationEnvelope,
): void {
  if (
    envelope.version !== COMPOSED_ECOLOGY_OBSERVATION_ENVELOPE_VERSION
  ) {
    throw new Error(
      `unsupported composed ecology observation envelope version: ${envelope.version}`,
    )
  }
  assertObservationMatchesPosition(envelope.position, envelope.observation)
  assertSameComposedStepObservationPosition(
    expectedPosition,
    envelope.position,
  )
  if (
    envelope.intervalEndSimulationTimeHours !==
      envelope.position.simulationTimeHours ||
    envelope.intervalStartSimulationTimeHours !==
      envelope.intervalEndSimulationTimeHours -
        envelope.observation.stepDuration
  ) {
    throw new Error(
      'composed ecology observation interval does not match envelope position and step duration',
    )
  }
}
