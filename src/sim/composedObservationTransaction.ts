import { assertComposedParameterSetBindingIdentity } from './parameterSetBinding'
import type { ComposedSimulationCheckpoint, RunIdentity } from './protocol'

export const COMPOSED_STEP_OBSERVATION_POSITION_VERSION = 1 as const

/**
 * Identity for one accepted composed-state position that may own derived,
 * step-local observations.
 *
 * This record is deliberately not checkpoint continuation authority. It exists
 * so a derived observation can be attached to the exact accepted state
 * transaction that produced it and consumers can fail closed on cross-position
 * mixing. The authoritative engine must create/bind the record atomically with
 * the observation; constructing one later does not prove provenance by itself.
 */
export interface ComposedStepObservationPosition {
  readonly version: typeof COMPOSED_STEP_OBSERVATION_POSITION_VERSION
  readonly runIdentity: RunIdentity
  readonly stateVersion: number
  readonly configurationFingerprint: string
  readonly tick: number
  readonly simulationTimeHours: number
  readonly commandCount: number
  readonly width: number
  readonly height: number
  readonly mask: readonly number[]
  readonly lineageIds: readonly string[]
  readonly genotypeIds: readonly string[]
}

function canonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be a canonical non-empty string`)
  }
}

function nonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${name} must be a non-negative safe integer`)
  }
}

function positiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`)
  }
}

function validatePosition(
  position: ComposedStepObservationPosition,
): void {
  if (position.version !== COMPOSED_STEP_OBSERVATION_POSITION_VERSION) {
    throw new Error(
      `unsupported composed step observation position version: ${position.version}`,
    )
  }
  assertComposedParameterSetBindingIdentity(position.runIdentity)
  canonicalText(
    'composed step observation configuration fingerprint',
    position.configurationFingerprint,
  )
  if (
    position.runIdentity.parameterSetBinding.configurationFingerprint !==
    position.configurationFingerprint
  ) {
    throw new Error(
      'composed step observation run binding does not match configuration fingerprint',
    )
  }
  positiveSafeInteger('composed step observation stateVersion', position.stateVersion)
  nonNegativeSafeInteger('composed step observation tick', position.tick)
  nonNegativeSafeInteger(
    'composed step observation commandCount',
    position.commandCount,
  )
  if (
    !Number.isFinite(position.simulationTimeHours) ||
    position.simulationTimeHours < 0
  ) {
    throw new Error(
      'composed step observation simulationTimeHours must be finite and non-negative',
    )
  }
  positiveSafeInteger('composed step observation width', position.width)
  positiveSafeInteger('composed step observation height', position.height)
  const cellCount = position.width * position.height
  if (!Number.isSafeInteger(cellCount) || position.mask.length !== cellCount) {
    throw new Error(
      'composed step observation mask must match safe grid dimensions',
    )
  }
  for (let index = 0; index < position.mask.length; index += 1) {
    if (!(index in position.mask)) {
      throw new Error('composed step observation mask must be dense')
    }
    const value = position.mask[index]
    if (value !== 0 && value !== 1) {
      throw new Error(
        `composed step observation mask must be binary at index ${index}`,
      )
    }
  }
  if (
    position.lineageIds.length !== position.genotypeIds.length ||
    position.lineageIds.length === 0
  ) {
    throw new Error(
      'composed step observation lineage and genotype identities must align',
    )
  }
  const seenLineages = new Set<string>()
  for (let index = 0; index < position.lineageIds.length; index += 1) {
    if (!(index in position.lineageIds) || !(index in position.genotypeIds)) {
      throw new Error(
        'composed step observation lineage and genotype identities must be dense',
      )
    }
    const lineageId = position.lineageIds[index]!
    const genotypeId = position.genotypeIds[index]!
    canonicalText(`composed step observation lineage id at index ${index}`, lineageId)
    canonicalText(`composed step observation genotype id at index ${index}`, genotypeId)
    if (seenLineages.has(lineageId)) {
      throw new Error(`duplicate composed step observation lineage id: ${lineageId}`)
    }
    seenLineages.add(lineageId)
  }
}

export function createComposedStepObservationPosition(
  checkpoint: ComposedSimulationCheckpoint,
): ComposedStepObservationPosition {
  if (checkpoint.authority !== 'composed') {
    throw new Error('composed step observation requires composed checkpoint authority')
  }

  const state = checkpoint.composedState
  const position: ComposedStepObservationPosition = {
    version: COMPOSED_STEP_OBSERVATION_POSITION_VERSION,
    runIdentity: structuredClone(checkpoint.identity),
    stateVersion: state.version,
    configurationFingerprint: state.configurationFingerprint,
    tick: checkpoint.tick,
    simulationTimeHours: checkpoint.simulationTimeHours,
    commandCount: checkpoint.commandCount,
    width: state.width,
    height: state.height,
    mask: Object.freeze(Array.from(state.mask)),
    lineageIds: Object.freeze([...state.lineageIds]),
    genotypeIds: Object.freeze([...state.genotypeIds]),
  }
  validatePosition(position)
  return Object.freeze(position)
}

function sameRunIdentity(a: RunIdentity, b: RunIdentity): boolean {
  return (
    a.engineVersion === b.engineVersion &&
    a.protocolVersion === b.protocolVersion &&
    a.scenarioId === b.scenarioId &&
    a.scenarioVersion === b.scenarioVersion &&
    a.parameterSetId === b.parameterSetId &&
    a.parameterSetVersion === b.parameterSetVersion &&
    a.seed === b.seed &&
    a.parameterSetBinding?.configurationFingerprint ===
      b.parameterSetBinding?.configurationFingerprint
  )
}

function sameDenseArray<T>(
  a: readonly T[],
  b: readonly T[],
): boolean {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (!(index in a) || !(index in b) || a[index] !== b[index]) return false
  }
  return true
}

/**
 * Fails closed unless two derived-observation positions refer to the exact same
 * accepted composed state. Consumers should run this before combining a
 * step-local observation with a snapshot/render/analysis transaction.
 */
export function assertSameComposedStepObservationPosition(
  expected: ComposedStepObservationPosition,
  candidate: ComposedStepObservationPosition,
): void {
  validatePosition(expected)
  validatePosition(candidate)

  const matches =
    sameRunIdentity(expected.runIdentity, candidate.runIdentity) &&
    expected.stateVersion === candidate.stateVersion &&
    expected.configurationFingerprint === candidate.configurationFingerprint &&
    expected.tick === candidate.tick &&
    expected.simulationTimeHours === candidate.simulationTimeHours &&
    expected.commandCount === candidate.commandCount &&
    expected.width === candidate.width &&
    expected.height === candidate.height &&
    sameDenseArray(expected.mask, candidate.mask) &&
    sameDenseArray(expected.lineageIds, candidate.lineageIds) &&
    sameDenseArray(expected.genotypeIds, candidate.genotypeIds)

  if (!matches) {
    throw new Error(
      'composed step observation position does not match the accepted state transaction',
    )
  }
}
