import type { GrowthParameters } from './growth'
import {
  ecologyExecutionProfileIdentity,
  parseEcologyExecutionProfile,
  type EcologyExecutionBehaviorTarget,
  type EcologyExecutionProfile,
} from './executionProfile'

export const ECOLOGY_CALIBRATION_OBJECTIVE_SCHEMA_VERSION = 1 as const
export const ECOLOGY_CALIBRATION_RESULT_SCHEMA_VERSION = 1 as const
export const ECOLOGY_CALIBRATION_LOSS_POLICY =
  'weighted-squared-scaled-error-v1' as const
export const ECOLOGY_CALIBRATION_SELECTION_POLICY =
  'lowest-training-loss-grid-candidate-v1' as const
export const MAX_ECOLOGY_CALIBRATION_CANDIDATES = 100_000 as const

export const CALIBRATABLE_ECOLOGY_PARAMETERS = [
  'maxDivisionRate',
  'halfSaturation',
  'biomassYield',
  'localCapacity',
  'spreadRate',
] as const satisfies readonly (keyof GrowthParameters)[]

export type EcologyCalibrationParameter =
  (typeof CALIBRATABLE_ECOLOGY_PARAMETERS)[number]

export type EcologyCalibrationTargetRole = 'fit' | 'validation'

export type EcologyCalibrationTargetUnit =
  | 'dimensionless'
  | 'hour'
  | 'model-resource'
  | 'model-biomass'
  | 'model-biomass/hour'
  | 'model-resource/hour'
  | 'grid-cell'

export interface EcologyCalibrationParameterGrid {
  readonly parameter: EcologyCalibrationParameter
  readonly minimum: number
  readonly maximum: number
  readonly candidates: readonly number[]
}

export interface EcologyCalibrationTarget {
  readonly id: string
  readonly behaviorTarget: EcologyExecutionBehaviorTarget
  readonly metric: string
  readonly role: EcologyCalibrationTargetRole
  readonly observed: number
  readonly scale: number
  readonly weight: number
  readonly unit: EcologyCalibrationTargetUnit
  readonly context: string
}

export interface EcologyCalibrationObjective {
  readonly schemaVersion: typeof ECOLOGY_CALIBRATION_OBJECTIVE_SCHEMA_VERSION
  readonly id: string
  readonly version: string
  readonly datasetIdentity: string
  readonly sourceProfileIdentity: string
  readonly lossPolicy: typeof ECOLOGY_CALIBRATION_LOSS_POLICY
  readonly candidateBudget: number
  readonly acceptableTrainingLoss: number
  readonly parameterGrids: readonly EcologyCalibrationParameterGrid[]
  readonly targets: readonly EcologyCalibrationTarget[]
  readonly limitation: string
}

export type EcologyCalibrationForwardModel = (
  growth: Readonly<GrowthParameters>,
) => Readonly<Record<string, number>>

export interface EcologyCalibrationCandidateResult {
  readonly candidateIndex: number
  readonly growth: Readonly<GrowthParameters>
  readonly outputs: Readonly<Record<string, number>>
  readonly trainingLoss: number
  readonly validationLoss: number | null
  readonly acceptable: boolean
}

export interface EcologyCalibrationParameterRange {
  readonly parameter: EcologyCalibrationParameter
  readonly minimum: number
  readonly maximum: number
  readonly distinctValues: number
}

export interface EcologyCalibrationSensitivityPoint {
  readonly value: number
  readonly bestTrainingLoss: number
}

export interface EcologyCalibrationSensitivityProfile {
  readonly parameter: EcologyCalibrationParameter
  readonly points: readonly EcologyCalibrationSensitivityPoint[]
}

export interface EcologyCalibrationIdentifiability {
  readonly status:
    | 'no-acceptable-candidate'
    | 'single-acceptable-candidate'
    | 'multiple-acceptable-candidates'
  readonly acceptableCandidateCount: number
  readonly acceptableRanges: readonly EcologyCalibrationParameterRange[]
}

export interface EcologyCalibratedValueRecord {
  readonly classification: 'calibrated'
  readonly objectiveId: string
  readonly objectiveVersion: string
  readonly objectiveIdentity: string
  readonly datasetIdentity: string
  readonly sourceProfileIdentity: string
  readonly selectionPolicy: typeof ECOLOGY_CALIBRATION_SELECTION_POLICY
  readonly selectedCandidateIndex: number
  readonly parameterValues: Readonly<
    Partial<Record<EcologyCalibrationParameter, number>>
  >
  readonly limitation: string
}

export interface EcologyCalibrationResult {
  readonly schemaVersion: typeof ECOLOGY_CALIBRATION_RESULT_SCHEMA_VERSION
  readonly objectiveIdentity: string
  readonly sourceProfileIdentity: string
  readonly datasetIdentity: string
  readonly bestCandidateIndex: number
  readonly candidates: readonly EcologyCalibrationCandidateResult[]
  readonly identifiability: EcologyCalibrationIdentifiability
  readonly sensitivity: readonly EcologyCalibrationSensitivityProfile[]
  readonly calibratedValues: EcologyCalibratedValueRecord | null
}

type UnknownRecord = Record<string, unknown>

const OBJECTIVE_KEYS = new Set([
  'schemaVersion',
  'id',
  'version',
  'datasetIdentity',
  'sourceProfileIdentity',
  'lossPolicy',
  'candidateBudget',
  'acceptableTrainingLoss',
  'parameterGrids',
  'targets',
  'limitation',
])

const GRID_KEYS = new Set(['parameter', 'minimum', 'maximum', 'candidates'])

const TARGET_KEYS = new Set([
  'id',
  'behaviorTarget',
  'metric',
  'role',
  'observed',
  'scale',
  'weight',
  'unit',
  'context',
])

const PARAMETER_SET = new Set<string>(CALIBRATABLE_ECOLOGY_PARAMETERS)
const TARGET_UNITS = new Set<string>([
  'dimensionless',
  'hour',
  'model-resource',
  'model-biomass',
  'model-biomass/hour',
  'model-resource/hour',
  'grid-cell',
])

const PARAMETER_ORDER: Readonly<
  Record<EcologyCalibrationParameter, number>
> = Object.freeze({
  maxDivisionRate: 0,
  halfSaturation: 1,
  biomassYield: 2,
  localCapacity: 3,
  spreadRate: 4,
})

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as UnknownRecord
}

function assertOnlyKnownKeys(
  name: string,
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unknown field ${JSON.stringify(key)}`)
    }
  }
}

function requireCanonicalText(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be canonical with no surrounding whitespace`)
  }
  return value
}

function requireFinite(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} must be finite`)
  }
  return value
}

function requireFiniteNonNegative(name: string, value: unknown): number {
  const parsed = requireFinite(name, value)
  if (parsed < 0) throw new Error(`${name} must be non-negative`)
  return parsed
}

function requirePositiveFinite(name: string, value: unknown): number {
  const parsed = requireFinite(name, value)
  if (parsed <= 0) throw new Error(`${name} must be positive`)
  return parsed
}

function requirePositiveSafeInteger(name: string, value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${name} must be a positive safe integer`)
  }
  return value
}

function parseParameter(value: unknown): EcologyCalibrationParameter {
  const parameter = requireCanonicalText('calibration parameter', value)
  if (!PARAMETER_SET.has(parameter)) {
    throw new Error(
      `unsupported ecology calibration parameter ${JSON.stringify(parameter)}`,
    )
  }
  return parameter as EcologyCalibrationParameter
}

function requireParameterDomainValue(
  name: string,
  parameter: EcologyCalibrationParameter,
  value: unknown,
): number {
  if (parameter === 'maxDivisionRate' || parameter === 'spreadRate') {
    return requireFiniteNonNegative(name, value)
  }
  return requirePositiveFinite(name, value)
}

function parseParameterGrid(
  value: unknown,
  profile: EcologyExecutionProfile,
  index: number,
): EcologyCalibrationParameterGrid {
  const name = `calibration.parameterGrids[${index}]`
  const record = requireRecord(name, value)
  assertOnlyKnownKeys(name, record, GRID_KEYS)

  const parameter = parseParameter(record.parameter)
  const minimum = requireParameterDomainValue(
    `${name}.minimum`,
    parameter,
    record.minimum,
  )
  const maximum = requireParameterDomainValue(
    `${name}.maximum`,
    parameter,
    record.maximum,
  )
  if (minimum > maximum) {
    throw new Error(`${name}.minimum must be <= maximum`)
  }

  const baseline = profile.growth[parameter]
  if (baseline < minimum || baseline > maximum) {
    throw new Error(
      `${name} bounds must contain the source profile value for ${parameter}`,
    )
  }

  if (!Array.isArray(record.candidates) || record.candidates.length === 0) {
    throw new Error(`${name}.candidates must be a non-empty dense array`)
  }

  const candidates: number[] = []
  let previous = Number.NEGATIVE_INFINITY
  for (let candidateIndex = 0; candidateIndex < record.candidates.length; candidateIndex += 1) {
    if (!(candidateIndex in record.candidates)) {
      throw new Error(`${name}.candidates must be dense`)
    }
    const candidate = requireParameterDomainValue(
      `${name}.candidates[${candidateIndex}]`,
      parameter,
      record.candidates[candidateIndex],
    )
    if (candidate < minimum || candidate > maximum) {
      throw new Error(`${name}.candidates must remain within explicit bounds`)
    }
    if (candidate <= previous) {
      throw new Error(
        `${name}.candidates must be strictly increasing and duplicate-free`,
      )
    }
    previous = candidate
    candidates.push(candidate)
  }

  return Object.freeze({
    parameter,
    minimum,
    maximum,
    candidates: Object.freeze(candidates),
  })
}

function parseTarget(
  value: unknown,
  profile: EcologyExecutionProfile,
  index: number,
): EcologyCalibrationTarget {
  const name = `calibration.targets[${index}]`
  const record = requireRecord(name, value)
  assertOnlyKnownKeys(name, record, TARGET_KEYS)

  const behaviorTarget = requireCanonicalText(
    `${name}.behaviorTarget`,
    record.behaviorTarget,
  )
  if (!profile.behaviorTargets.includes(
    behaviorTarget as EcologyExecutionBehaviorTarget,
  )) {
    throw new Error(
      `${name}.behaviorTarget is not declared by the source execution profile`,
    )
  }

  const role = requireCanonicalText(`${name}.role`, record.role)
  if (role !== 'fit' && role !== 'validation') {
    throw new Error(`${name}.role must be "fit" or "validation"`)
  }

  const unit = requireCanonicalText(`${name}.unit`, record.unit)
  if (!TARGET_UNITS.has(unit)) {
    throw new Error(
      `${name}.unit must remain in Petra model units or dimensionless form`,
    )
  }

  return Object.freeze({
    id: requireCanonicalText(`${name}.id`, record.id),
    behaviorTarget:
      behaviorTarget as EcologyExecutionBehaviorTarget,
    metric: requireCanonicalText(`${name}.metric`, record.metric),
    role,
    observed: requireFinite(`${name}.observed`, record.observed),
    scale: requirePositiveFinite(`${name}.scale`, record.scale),
    weight: requirePositiveFinite(`${name}.weight`, record.weight),
    unit: unit as EcologyCalibrationTargetUnit,
    context: requireCanonicalText(`${name}.context`, record.context),
  })
}

export function parseEcologyCalibrationObjective(
  value: unknown,
  sourceProfileValue: unknown,
): EcologyCalibrationObjective {
  const profile = parseEcologyExecutionProfile(sourceProfileValue)
  const sourceProfileIdentity = ecologyExecutionProfileIdentity(profile)
  const record = requireRecord('calibration objective', value)
  assertOnlyKnownKeys('calibration objective', record, OBJECTIVE_KEYS)

  if (record.schemaVersion !== ECOLOGY_CALIBRATION_OBJECTIVE_SCHEMA_VERSION) {
    throw new Error('unsupported ecology calibration objective schema version')
  }
  if (record.lossPolicy !== ECOLOGY_CALIBRATION_LOSS_POLICY) {
    throw new Error('unsupported ecology calibration loss policy')
  }
  if (record.sourceProfileIdentity !== sourceProfileIdentity) {
    throw new Error(
      'calibration objective sourceProfileIdentity does not match the execution profile',
    )
  }

  const candidateBudget = requirePositiveSafeInteger(
    'calibration.candidateBudget',
    record.candidateBudget,
  )
  if (candidateBudget > MAX_ECOLOGY_CALIBRATION_CANDIDATES) {
    throw new Error(
      `calibration.candidateBudget must be <= ${MAX_ECOLOGY_CALIBRATION_CANDIDATES}`,
    )
  }

  if (!Array.isArray(record.parameterGrids) || record.parameterGrids.length === 0) {
    throw new Error('calibration.parameterGrids must be a non-empty array')
  }
  const parameterGrids = record.parameterGrids.map((grid, index) =>
    parseParameterGrid(grid, profile, index),
  )
  const seenParameters = new Set<EcologyCalibrationParameter>()
  for (const grid of parameterGrids) {
    if (seenParameters.has(grid.parameter)) {
      throw new Error(
        `calibration.parameterGrids contains duplicate parameter ${grid.parameter}`,
      )
    }
    seenParameters.add(grid.parameter)
  }
  parameterGrids.sort(
    (left, right) =>
      PARAMETER_ORDER[left.parameter] - PARAMETER_ORDER[right.parameter],
  )

  let candidateCount = 1
  for (const grid of parameterGrids) {
    candidateCount *= grid.candidates.length
    if (
      !Number.isSafeInteger(candidateCount) ||
      candidateCount > candidateBudget
    ) {
      throw new Error(
        'calibration candidate grid exceeds the explicit candidateBudget',
      )
    }
  }

  if (!Array.isArray(record.targets) || record.targets.length === 0) {
    throw new Error('calibration.targets must be a non-empty array')
  }
  const targets = record.targets.map((target, index) =>
    parseTarget(target, profile, index),
  )
  const seenTargetIds = new Set<string>()
  const seenMetrics = new Set<string>()
  let fitTargetCount = 0
  for (const target of targets) {
    if (seenTargetIds.has(target.id)) {
      throw new Error(
        `calibration.targets contains duplicate id ${JSON.stringify(target.id)}`,
      )
    }
    if (seenMetrics.has(target.metric)) {
      throw new Error(
        `calibration.targets contains duplicate metric ${JSON.stringify(target.metric)}`,
      )
    }
    seenTargetIds.add(target.id)
    seenMetrics.add(target.metric)
    if (target.role === 'fit') fitTargetCount += 1
  }
  if (fitTargetCount === 0) {
    throw new Error('calibration.targets must contain at least one fit target')
  }
  targets.sort((left, right) =>
    left.id < right.id ? -1 : left.id > right.id ? 1 : 0,
  )

  return Object.freeze({
    schemaVersion: ECOLOGY_CALIBRATION_OBJECTIVE_SCHEMA_VERSION,
    id: requireCanonicalText('calibration.id', record.id),
    version: requireCanonicalText('calibration.version', record.version),
    datasetIdentity: requireCanonicalText(
      'calibration.datasetIdentity',
      record.datasetIdentity,
    ),
    sourceProfileIdentity,
    lossPolicy: ECOLOGY_CALIBRATION_LOSS_POLICY,
    candidateBudget,
    acceptableTrainingLoss: requireFiniteNonNegative(
      'calibration.acceptableTrainingLoss',
      record.acceptableTrainingLoss,
    ),
    parameterGrids: Object.freeze(parameterGrids),
    targets: Object.freeze(targets),
    limitation: requireCanonicalText(
      'calibration.limitation',
      record.limitation,
    ),
  })
}

export function ecologyCalibrationObjectiveIdentity(
  value: unknown,
  sourceProfileValue: unknown,
): string {
  const objective = parseEcologyCalibrationObjective(
    value,
    sourceProfileValue,
  )
  return JSON.stringify({
    schemaVersion: objective.schemaVersion,
    id: objective.id,
    version: objective.version,
    datasetIdentity: objective.datasetIdentity,
    sourceProfileIdentity: objective.sourceProfileIdentity,
    lossPolicy: objective.lossPolicy,
    candidateBudget: objective.candidateBudget,
    acceptableTrainingLoss: objective.acceptableTrainingLoss,
    parameterGrids: objective.parameterGrids.map((grid) => ({
      parameter: grid.parameter,
      minimum: grid.minimum,
      maximum: grid.maximum,
      candidates: [...grid.candidates],
    })),
    targets: objective.targets.map((target) => ({
      id: target.id,
      behaviorTarget: target.behaviorTarget,
      metric: target.metric,
      role: target.role,
      observed: target.observed,
      scale: target.scale,
      weight: target.weight,
      unit: target.unit,
      context: target.context,
    })),
    limitation: objective.limitation,
  })
}

function validateCandidateGrowth(
  growth: Readonly<GrowthParameters>,
  hoursPerTick: number,
): void {
  requireFiniteNonNegative('candidate.maxDivisionRate', growth.maxDivisionRate)
  requirePositiveFinite('candidate.halfSaturation', growth.halfSaturation)
  requirePositiveFinite('candidate.biomassYield', growth.biomassYield)
  requirePositiveFinite('candidate.localCapacity', growth.localCapacity)
  requireFiniteNonNegative('candidate.spreadRate', growth.spreadRate)
  if (growth.spreadRate * hoursPerTick > 0.25) {
    throw new Error(
      'candidate spreadRate * hoursPerTick exceeds the ecology stability bound',
    )
  }
}

function withParameter(
  growth: Readonly<GrowthParameters>,
  parameter: EcologyCalibrationParameter,
  value: number,
): GrowthParameters {
  const next: GrowthParameters = {
    maxDivisionRate: growth.maxDivisionRate,
    halfSaturation: growth.halfSaturation,
    biomassYield: growth.biomassYield,
    localCapacity: growth.localCapacity,
    spreadRate: growth.spreadRate,
  }
  next[parameter] = value
  return next
}

function computeRoleLoss(
  role: EcologyCalibrationTargetRole,
  targets: readonly EcologyCalibrationTarget[],
  outputs: Readonly<Record<string, number>>,
): number | null {
  let weightedSquaredError = 0
  let totalWeight = 0
  for (const target of targets) {
    if (target.role !== role) continue
    const predicted = outputs[target.metric]
    if (typeof predicted !== 'number' || !Number.isFinite(predicted)) {
      throw new Error(
        `forward model must return finite metric ${JSON.stringify(target.metric)}`,
      )
    }
    const scaledResidual = (predicted - target.observed) / target.scale
    weightedSquaredError += target.weight * scaledResidual * scaledResidual
    totalWeight += target.weight
  }
  if (totalWeight === 0) return null
  const loss = weightedSquaredError / totalWeight
  if (!Number.isFinite(loss)) {
    throw new Error(`calibration ${role} loss became non-finite`)
  }
  return loss
}

function sanitizeOutputs(
  targets: readonly EcologyCalibrationTarget[],
  raw: Readonly<Record<string, number>>,
): Readonly<Record<string, number>> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('ecology calibration forward model must return an object')
  }
  const outputs: Record<string, number> = {}
  for (const target of targets) {
    if (!Object.prototype.hasOwnProperty.call(raw, target.metric)) {
      throw new Error(
        `forward model omitted required metric ${JSON.stringify(target.metric)}`,
      )
    }
    const predicted = raw[target.metric]
    if (typeof predicted !== 'number' || !Number.isFinite(predicted)) {
      throw new Error(
        `forward model metric ${JSON.stringify(target.metric)} must be finite`,
      )
    }
    outputs[target.metric] = predicted
  }
  return Object.freeze(outputs)
}

function enumerateCandidates(
  profile: EcologyExecutionProfile,
  objective: EcologyCalibrationObjective,
): readonly Readonly<GrowthParameters>[] {
  let candidates: GrowthParameters[] = [{
    maxDivisionRate: profile.growth.maxDivisionRate,
    halfSaturation: profile.growth.halfSaturation,
    biomassYield: profile.growth.biomassYield,
    localCapacity: profile.growth.localCapacity,
    spreadRate: profile.growth.spreadRate,
  }]

  for (const grid of objective.parameterGrids) {
    const next: GrowthParameters[] = []
    for (const growth of candidates) {
      for (const value of grid.candidates) {
        const candidate = withParameter(growth, grid.parameter, value)
        validateCandidateGrowth(candidate, profile.hoursPerTick)
        next.push(candidate)
      }
    }
    candidates = next
  }

  if (candidates.length > objective.candidateBudget) {
    throw new Error('calibration candidate enumeration exceeded candidateBudget')
  }
  return Object.freeze(candidates.map((growth) => Object.freeze(growth)))
}

function compareTrainingLoss(
  left: EcologyCalibrationCandidateResult,
  right: EcologyCalibrationCandidateResult,
): number {
  if (left.trainingLoss !== right.trainingLoss) {
    return left.trainingLoss - right.trainingLoss
  }
  return left.candidateIndex - right.candidateIndex
}

function parameterRanges(
  grids: readonly EcologyCalibrationParameterGrid[],
  acceptable: readonly EcologyCalibrationCandidateResult[],
): readonly EcologyCalibrationParameterRange[] {
  if (acceptable.length === 0) return Object.freeze([])

  return Object.freeze(
    grids.map((grid) => {
      const values = acceptable.map((candidate) => candidate.growth[grid.parameter])
      const distinct = new Set(values)
      return Object.freeze({
        parameter: grid.parameter,
        minimum: Math.min(...values),
        maximum: Math.max(...values),
        distinctValues: distinct.size,
      })
    }),
  )
}

function sensitivityProfiles(
  grids: readonly EcologyCalibrationParameterGrid[],
  candidates: readonly EcologyCalibrationCandidateResult[],
): readonly EcologyCalibrationSensitivityProfile[] {
  return Object.freeze(
    grids.map((grid) =>
      Object.freeze({
        parameter: grid.parameter,
        points: Object.freeze(
          grid.candidates.map((value) => {
            let bestTrainingLoss = Number.POSITIVE_INFINITY
            for (const candidate of candidates) {
              if (
                candidate.growth[grid.parameter] === value &&
                candidate.trainingLoss < bestTrainingLoss
              ) {
                bestTrainingLoss = candidate.trainingLoss
              }
            }
            if (!Number.isFinite(bestTrainingLoss)) {
              throw new Error(
                `no calibration candidate exists for ${grid.parameter}=${value}`,
              )
            }
            return Object.freeze({ value, bestTrainingLoss })
          }),
        ),
      }),
    ),
  )
}

function variedParameterValues(
  grids: readonly EcologyCalibrationParameterGrid[],
  growth: Readonly<GrowthParameters>,
): Readonly<Partial<Record<EcologyCalibrationParameter, number>>> {
  const values: Partial<Record<EcologyCalibrationParameter, number>> = {}
  for (const grid of grids) values[grid.parameter] = growth[grid.parameter]
  return Object.freeze(values)
}

export function runEcologyCalibration(
  sourceProfileValue: unknown,
  objectiveValue: unknown,
  forwardModel: EcologyCalibrationForwardModel,
): EcologyCalibrationResult {
  const profile = parseEcologyExecutionProfile(sourceProfileValue)
  const objective = parseEcologyCalibrationObjective(
    objectiveValue,
    profile,
  )
  const objectiveIdentity = ecologyCalibrationObjectiveIdentity(
    objective,
    profile,
  )
  const sourceProfileIdentity = ecologyExecutionProfileIdentity(profile)
  const candidateGrowth = enumerateCandidates(profile, objective)

  const candidates: EcologyCalibrationCandidateResult[] = candidateGrowth.map(
    (growth, candidateIndex) => {
      const outputs = sanitizeOutputs(
        objective.targets,
        forwardModel(growth),
      )
      const trainingLoss = computeRoleLoss(
        'fit',
        objective.targets,
        outputs,
      )
      if (trainingLoss === null) {
        throw new Error('calibration objective unexpectedly has no fit targets')
      }
      const validationLoss = computeRoleLoss(
        'validation',
        objective.targets,
        outputs,
      )
      return Object.freeze({
        candidateIndex,
        growth,
        outputs,
        trainingLoss,
        validationLoss,
        acceptable: trainingLoss <= objective.acceptableTrainingLoss,
      })
    },
  )

  if (candidates.length === 0) {
    throw new Error('calibration candidate grid produced no candidates')
  }

  const best = [...candidates].sort(compareTrainingLoss)[0]!
  const acceptable = candidates.filter((candidate) => candidate.acceptable)
  const acceptableRanges = parameterRanges(
    objective.parameterGrids,
    acceptable,
  )
  const status =
    acceptable.length === 0
      ? 'no-acceptable-candidate'
      : acceptable.length === 1
        ? 'single-acceptable-candidate'
        : 'multiple-acceptable-candidates'

  const identifiability: EcologyCalibrationIdentifiability = Object.freeze({
    status,
    acceptableCandidateCount: acceptable.length,
    acceptableRanges,
  })

  const calibratedValues: EcologyCalibratedValueRecord | null =
    acceptable.length === 0
      ? null
      : Object.freeze({
          classification: 'calibrated',
          objectiveId: objective.id,
          objectiveVersion: objective.version,
          objectiveIdentity,
          datasetIdentity: objective.datasetIdentity,
          sourceProfileIdentity,
          selectionPolicy: ECOLOGY_CALIBRATION_SELECTION_POLICY,
          selectedCandidateIndex: best.candidateIndex,
          parameterValues: variedParameterValues(
            objective.parameterGrids,
            best.growth,
          ),
          limitation: objective.limitation,
        })

  return Object.freeze({
    schemaVersion: ECOLOGY_CALIBRATION_RESULT_SCHEMA_VERSION,
    objectiveIdentity,
    sourceProfileIdentity,
    datasetIdentity: objective.datasetIdentity,
    bestCandidateIndex: best.candidateIndex,
    candidates: Object.freeze(candidates),
    identifiability,
    sensitivity: sensitivityProfiles(
      objective.parameterGrids,
      candidates,
    ),
    calibratedValues,
  })
}
