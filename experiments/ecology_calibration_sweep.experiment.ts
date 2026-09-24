import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import flagshipScenario from '../data/presets/ecoli_ciprofloxacin_v1.json'
import {
  ECOLOGY_CALIBRATION_LOSS_POLICY,
  runEcologyCalibration,
  type EcologyCalibrationObjective,
  type EcologyCalibrationParameter,
} from '../src/sim/ecology/calibration'
import {
  ecologyExecutionProfileIdentity,
  parseEcologyExecutionProfile,
} from '../src/sim/ecology/executionProfile'
import {
  stepEcology,
  type EcologyState,
  type GrowthParameters,
} from '../src/sim/ecology/growth'

const EXPERIMENT_ID = 'ecology-calibration-sweep'
const OBJECTIVE_ID =
  'ecoli-ciprofloxacin-engineering-qualitative-identifiability'
const OBJECTIVE_VERSION = '1.0.0'
const DATASET_IDENTITY =
  'engineering:self-reference-ecology-behavior-contract-v1'

const INITIAL_RESOURCE = 8
const INITIAL_BIOMASS = 1
const HIGH_RESOURCE = 100
const PROBE_TICKS = 25
const SPREAD_CONSERVATION_TOLERANCE = 1e-6
const FACTORS = [0.5, 1, 2] as const

const lineageParameters = [
  { relativeFitness: 1, deathHazardPerTime: 0 },
] as const

function oneLineageState(
  width: number,
  resource: readonly number[],
  biomass: readonly number[],
): EcologyState {
  return {
    width,
    height: 1,
    mask: new Uint8Array(width).fill(1),
    resource: Float32Array.from(resource),
    lineages: [Float32Array.from(biomass)],
  }
}

interface EcologyProbeOutputs extends Readonly<Record<string, number>> {
  readonly 'positive-growth-violation': number
  readonly 'resource-depletion-violation': number
  readonly 'zero-resource-no-growth-violation': number
  readonly 'capacity-bound-violation': number
  readonly 'neighbour-spread-violation': number
  readonly 'spread-conservation-violation': number
  readonly 'early-biomass': number
  readonly 'resource-remaining': number
  readonly 'neighbour-biomass': number
}

function probeEcology(
  growth: Readonly<GrowthParameters>,
  hoursPerTick: number,
): EcologyProbeOutputs {
  const early = oneLineageState(
    1,
    [INITIAL_RESOURCE],
    [INITIAL_BIOMASS],
  )
  for (let tick = 0; tick < PROBE_TICKS; tick += 1) {
    stepEcology(early, growth, lineageParameters, hoursPerTick)
  }

  const earlyBiomass = early.lineages[0]![0]!
  const resourceRemaining = early.resource[0]!

  const zeroResource = oneLineageState(1, [0], [INITIAL_BIOMASS])
  let zeroResourceDivision = 0
  for (let tick = 0; tick < PROBE_TICKS; tick += 1) {
    zeroResourceDivision += stepEcology(
      zeroResource,
      growth,
      lineageParameters,
      hoursPerTick,
    ).metrics.divisionBiomass
  }

  const atCapacity = oneLineageState(
    1,
    [HIGH_RESOURCE],
    [growth.localCapacity],
  )
  const capacityStep = stepEcology(
    atCapacity,
    growth,
    lineageParameters,
    hoursPerTick,
  )

  const spread = oneLineageState(2, [0, 0], [INITIAL_BIOMASS, 0])
  stepEcology(spread, growth, lineageParameters, hoursPerTick)
  const spreadLeft = spread.lineages[0]![0]!
  const neighbourBiomass = spread.lineages[0]![1]!
  const spreadTotal = spreadLeft + neighbourBiomass

  return Object.freeze({
    'positive-growth-violation':
      earlyBiomass > INITIAL_BIOMASS ? 0 : 1,
    'resource-depletion-violation':
      resourceRemaining < INITIAL_RESOURCE ? 0 : 1,
    'zero-resource-no-growth-violation':
      zeroResourceDivision === 0 &&
      zeroResource.lineages[0]![0] === INITIAL_BIOMASS
        ? 0
        : 1,
    'capacity-bound-violation':
      capacityStep.metrics.divisionBiomass === 0 &&
      atCapacity.lineages[0]![0]! <= growth.localCapacity
        ? 0
        : 1,
    'neighbour-spread-violation': neighbourBiomass > 0 ? 0 : 1,
    'spread-conservation-violation':
      Math.abs(spreadTotal - INITIAL_BIOMASS) <=
      SPREAD_CONSERVATION_TOLERANCE
        ? 0
        : 1,
    'early-biomass': earlyBiomass,
    'resource-remaining': resourceRemaining,
    'neighbour-biomass': neighbourBiomass,
  })
}

function factorGrid(
  parameter: EcologyCalibrationParameter,
  baseline: number,
): EcologyCalibrationObjective['parameterGrids'][number] {
  const candidates = FACTORS.map((factor) => baseline * factor)
  return Object.freeze({
    parameter,
    minimum: candidates[0]!,
    maximum: candidates[candidates.length - 1]!,
    candidates: Object.freeze(candidates),
  })
}

function buildObjective(): EcologyCalibrationObjective {
  const profile = parseEcologyExecutionProfile(
    flagshipScenario.executionProfile,
  )
  const baseline = probeEcology(profile.growth, profile.hoursPerTick)

  return Object.freeze({
    schemaVersion: 1,
    id: OBJECTIVE_ID,
    version: OBJECTIVE_VERSION,
    datasetIdentity: DATASET_IDENTITY,
    sourceProfileIdentity: ecologyExecutionProfileIdentity(profile),
    lossPolicy: ECOLOGY_CALIBRATION_LOSS_POLICY,
    candidateBudget: FACTORS.length ** 5,
    acceptableTrainingLoss: 0,
    parameterGrids: Object.freeze([
      factorGrid(
        'maxDivisionRate',
        profile.growth.maxDivisionRate,
      ),
      factorGrid('halfSaturation', profile.growth.halfSaturation),
      factorGrid('biomassYield', profile.growth.biomassYield),
      factorGrid('localCapacity', profile.growth.localCapacity),
      factorGrid('spreadRate', profile.growth.spreadRate),
    ]),
    targets: Object.freeze([
      Object.freeze({
        id: 'capacity-bound',
        behaviorTarget: 'capacity-bound',
        metric: 'capacity-bound-violation',
        role: 'fit',
        observed: 0,
        scale: 1,
        weight: 1,
        unit: 'dimensionless',
        context:
          'Declared engineering behavior: a cell initialized at local capacity must not create additional division biomass.',
      }),
      Object.freeze({
        id: 'conservative-neighbour-spread',
        behaviorTarget: 'conservative-neighbour-spread',
        metric: 'spread-conservation-violation',
        role: 'fit',
        observed: 0,
        scale: 1,
        weight: 1,
        unit: 'dimensionless',
        context:
          'Declared engineering behavior: one explicit neighbour-spread step conserves model biomass within the existing Float32 regression tolerance.',
      }),
      Object.freeze({
        id: 'neighbour-spread-occurs',
        behaviorTarget: 'conservative-neighbour-spread',
        metric: 'neighbour-spread-violation',
        role: 'fit',
        observed: 0,
        scale: 1,
        weight: 1,
        unit: 'dimensionless',
        context:
          'Declared engineering behavior: positive configured spread moves positive model biomass into an available neighbour.',
      }),
      Object.freeze({
        id: 'positive-early-growth',
        behaviorTarget: 'positive-early-growth',
        metric: 'positive-growth-violation',
        role: 'fit',
        observed: 0,
        scale: 1,
        weight: 1,
        unit: 'dimensionless',
        context:
          'Declared engineering behavior: positive resource and biomass produce positive early growth under the model-unit ecology profile.',
      }),
      Object.freeze({
        id: 'resource-depletion',
        behaviorTarget: 'resource-depletion',
        metric: 'resource-depletion-violation',
        role: 'fit',
        observed: 0,
        scale: 1,
        weight: 1,
        unit: 'dimensionless',
        context:
          'Declared engineering behavior: positive early growth consumes positive model-resource.',
      }),
      Object.freeze({
        id: 'zero-resource-no-growth',
        behaviorTarget: 'zero-resource-no-growth',
        metric: 'zero-resource-no-growth-violation',
        role: 'fit',
        observed: 0,
        scale: 1,
        weight: 1,
        unit: 'dimensionless',
        context:
          'Declared engineering behavior: zero model-resource produces exactly zero division biomass.',
      }),
      Object.freeze({
        id: 'self-reference-early-biomass',
        behaviorTarget: 'positive-early-growth',
        metric: 'early-biomass',
        role: 'validation',
        observed: baseline['early-biomass'],
        scale: Math.abs(baseline['early-biomass']),
        weight: 1,
        unit: 'model-biomass',
        context:
          'Engineering sensitivity reference only: current execution-profile output after the fixed probe horizon. This is not independent biological evidence.',
      }),
      Object.freeze({
        id: 'self-reference-neighbour-biomass',
        behaviorTarget: 'conservative-neighbour-spread',
        metric: 'neighbour-biomass',
        role: 'validation',
        observed: baseline['neighbour-biomass'],
        scale: Math.abs(baseline['neighbour-biomass']),
        weight: 1,
        unit: 'model-biomass',
        context:
          'Engineering sensitivity reference only: current execution-profile one-step neighbour biomass. This is not an observed colony-spread measurement.',
      }),
      Object.freeze({
        id: 'self-reference-resource-remaining',
        behaviorTarget: 'resource-depletion',
        metric: 'resource-remaining',
        role: 'validation',
        observed: baseline['resource-remaining'],
        scale: Math.abs(baseline['resource-remaining']),
        weight: 1,
        unit: 'model-resource',
        context:
          'Engineering sensitivity reference only: current execution-profile resource after the fixed probe horizon. This is not a physical substrate concentration.',
      }),
    ]),
    limitation:
      'Qualitative engineering behavior plus self-reference sensitivity cannot establish physical or uniquely calibrated MG1655 parameters. Multiple acceptable candidates are expected and no fitted value from this experiment is promotable.',
  })
}

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(
    temporary,
    JSON.stringify(result, null, 2) + '\n',
    'utf8',
  )
  renameSync(temporary, output)
}

function parameterValidationSensitivity(
  parameter: EcologyCalibrationParameter,
  values: readonly number[],
  candidates: ReturnType<typeof runEcologyCalibration>['candidates'],
): readonly {
  readonly value: number
  readonly candidateCount: number
  readonly minValidationLoss: number
  readonly meanValidationLoss: number
  readonly maxValidationLoss: number
}[] {
  return Object.freeze(
    values.map((value) => {
      const losses = candidates
        .filter((candidate) => candidate.growth[parameter] === value)
        .map((candidate) => candidate.validationLoss)
      if (
        losses.length === 0 ||
        losses.some((loss) => loss === null || !Number.isFinite(loss))
      ) {
        throw new Error(
          `validation sensitivity for ${parameter}=${value} is incomplete`,
        )
      }
      const finiteLosses = losses as number[]
      const sum = finiteLosses.reduce((total, loss) => total + loss, 0)
      return Object.freeze({
        value,
        candidateCount: finiteLosses.length,
        minValidationLoss: Math.min(...finiteLosses),
        meanValidationLoss: sum / finiteLosses.length,
        maxValidationLoss: Math.max(...finiteLosses),
      })
    }),
  )
}

describe.sequential('engineering ecology calibration/sensitivity local experiment', () => {
  it('demonstrates qualitative-target identifiability limits without promoting fitted values', () => {
    const startedAt = new Date().toISOString()
    const profile = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const objective = buildObjective()

    try {
      const result = runEcologyCalibration(
        profile,
        objective,
        (growth) => probeEcology(growth, profile.hoursPerTick),
      )

      const baselineCandidate = result.candidates.find((candidate) =>
        (
          Object.keys(profile.growth) as EcologyCalibrationParameter[]
        ).every(
          (parameter) =>
            candidate.growth[parameter] === profile.growth[parameter],
        ),
      )
      if (baselineCandidate === undefined) {
        throw new Error(
          'calibration grid did not contain the exact source engineering profile',
        )
      }

      assert.equal(
        baselineCandidate.validationLoss,
        0,
        'self-reference validation must be exact for the source engineering profile',
      )
      assert.equal(
        result.identifiability.status,
        'multiple-acceptable-candidates',
        'qualitative engineering targets must not be presented as a unique calibration',
      )
      assert.ok(
        result.identifiability.acceptableCandidateCount > 1,
        'qualitative behavior must expose multiple acceptable candidates',
      )
      assert.ok(
        result.candidates.every(
          (candidate) => candidate.trainingLoss === 0,
        ),
        'the factor-of-two engineering grid should satisfy the declared qualitative behavior contract',
      )
      assert.ok(
        result.candidates.some(
          (candidate) =>
            candidate.validationLoss !== null &&
            candidate.validationLoss > 0,
        ),
        'self-reference holdouts should expose quantitative sensitivity away from the source profile',
      )

      const sensitivity = objective.parameterGrids.map((grid) =>
        Object.freeze({
          parameter: grid.parameter,
          values: parameterValidationSensitivity(
            grid.parameter,
            grid.candidates,
            result.candidates,
          ),
        }),
      )

      const compactResult = {
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'passed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        classification:
          'engineering qualitative-identifiability + self-reference sensitivity',
        promotable_parameter_fit: false,
        promotion_reason:
          'The fit targets are qualitative engineering invariants and admit multiple solutions; quantitative holdouts are self-references to the existing engineering profile rather than independent biological observations.',
        source_profile: {
          id: profile.id,
          version: profile.version,
          identity: result.sourceProfileIdentity,
          classification: profile.classification,
          units: profile.units,
        },
        objective: {
          id: objective.id,
          version: objective.version,
          identity: result.objectiveIdentity,
          dataset_identity: result.datasetIdentity,
          loss_policy: objective.lossPolicy,
          factor_grid: FACTORS,
          candidate_count: result.candidates.length,
          acceptable_candidate_count:
            result.identifiability.acceptableCandidateCount,
          identifiability_status: result.identifiability.status,
          acceptable_ranges: result.identifiability.acceptableRanges,
        },
        baseline_reference: {
          candidate_index: baselineCandidate.candidateIndex,
          validation_loss: baselineCandidate.validationLoss,
        },
        parameter_validation_sensitivity: sensitivity,
        acceptance: {
          source_profile_present_in_grid: true,
          source_profile_validation_loss_zero: true,
          qualitative_targets_non_identifying:
            result.identifiability.status ===
            'multiple-acceptable-candidates',
          all_grid_candidates_satisfy_qualitative_contract:
            result.candidates.every(
              (candidate) => candidate.trainingLoss === 0,
            ),
          quantitative_self_reference_detects_sensitivity:
            result.candidates.some(
              (candidate) =>
                candidate.validationLoss !== null &&
                candidate.validationLoss > 0,
            ),
        },
        limitations: [
          'Candidate factors are a versioned analysis grid around the existing engineering profile, not proposed biological parameter values.',
          'Quantitative validation observations are generated from the current engineering profile itself and therefore provide sensitivity/regression evidence only.',
          'The experiment deliberately cannot promote a fitted parameter set or close the physical/source-compatible resource binding tracked in #227.',
          'The flagship resource and biomass channels remain model-resource and model-biomass, not glucose, CFU, dry mass, or physical concentration.',
          'A future promotable calibration requires independent versioned targets with compatible units/context and a separately reviewed objective.',
        ],
      }

      writeCompactResult(compactResult)

      expect(result.candidates).toHaveLength(FACTORS.length ** 5)
      expect(result.identifiability.status).toBe(
        'multiple-acceptable-candidates',
      )
      expect(baselineCandidate.validationLoss).toBe(0)
    } catch (error) {
      writeCompactResult({
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  })
})
