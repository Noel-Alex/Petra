import { describe, expect, it } from 'vitest'

import flagshipScenario from '../../../data/presets/ecoli_ciprofloxacin_v1.json'
import {
  ecologyCalibrationObjectiveIdentity,
  ECOLOGY_CALIBRATION_LOSS_POLICY,
  parseEcologyCalibrationObjective,
  runEcologyCalibration,
  type EcologyCalibrationObjective,
} from './calibration'
import {
  ecologyExecutionProfileIdentity,
  parseEcologyExecutionProfile,
} from './executionProfile'
import {
  stepEcology,
  type EcologyState,
  type GrowthParameters,
} from './growth'

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

const lineageParameters = [
  { relativeFitness: 1, deathHazardPerTime: 0 },
] as const

function mechanisticOutputs(
  growth: Readonly<GrowthParameters>,
): Readonly<Record<string, number>> {
  const profile = parseEcologyExecutionProfile(
    flagshipScenario.executionProfile,
  )
  const growthState = oneLineageState(1, [8], [1])
  for (let step = 0; step < 25; step += 1) {
    stepEcology(
      growthState,
      growth,
      lineageParameters,
      profile.hoursPerTick,
    )
  }

  const spreadState = oneLineageState(2, [0, 0], [1, 0])
  stepEcology(
    spreadState,
    growth,
    lineageParameters,
    profile.hoursPerTick,
  )

  return {
    'early-biomass': growthState.lineages[0]![0]!,
    'resource-remaining': growthState.resource[0]!,
    'spread-neighbour-biomass': spreadState.lineages[0]![1]!,
  }
}

function objectiveFixture(): EcologyCalibrationObjective {
  const profile = parseEcologyExecutionProfile(
    flagshipScenario.executionProfile,
  )
  const baseline = mechanisticOutputs(profile.growth)

  return {
    schemaVersion: 1,
    id: 'fixture-ecology-fit',
    version: '1',
    datasetIdentity: 'fixture:deterministic-kernel-observations-v1',
    sourceProfileIdentity: ecologyExecutionProfileIdentity(profile),
    lossPolicy: ECOLOGY_CALIBRATION_LOSS_POLICY,
    candidateBudget: 9,
    acceptableTrainingLoss: 1e-18,
    parameterGrids: [
      {
        parameter: 'halfSaturation',
        minimum: 0.5,
        maximum: 2,
        candidates: [0.5, 1, 2],
      },
      {
        parameter: 'maxDivisionRate',
        minimum: 0.4,
        maximum: 1.2,
        candidates: [0.4, 0.8, 1.2],
      },
    ],
    targets: [
      {
        id: 'resource-depletion',
        behaviorTarget: 'resource-depletion',
        metric: 'resource-remaining',
        role: 'fit',
        observed: baseline['resource-remaining']!,
        scale: 1,
        weight: 1,
        unit: 'model-resource',
        context: 'Deterministic one-cell fixture after 25 profile ticks.',
      },
      {
        id: 'positive-growth',
        behaviorTarget: 'positive-early-growth',
        metric: 'early-biomass',
        role: 'fit',
        observed: baseline['early-biomass']!,
        scale: 1,
        weight: 1,
        unit: 'model-biomass',
        context: 'Deterministic one-cell fixture after 25 profile ticks.',
      },
      {
        id: 'spread-holdout',
        behaviorTarget: 'conservative-neighbour-spread',
        metric: 'spread-neighbour-biomass',
        role: 'validation',
        observed: baseline['spread-neighbour-biomass']!,
        scale: 0.001,
        weight: 1,
        unit: 'model-biomass',
        context: 'One-tick two-cell spread fixture held out from fit loss.',
      },
    ],
    limitation:
      'Fixture-only calibration objective; it does not establish physical MG1655 growth parameters.',
  }
}

describe('bounded ecology calibration contract', () => {
  it('canonicalizes semantically unordered grids/targets into one objective identity', () => {
    const profile = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const objective = objectiveFixture()
    const reordered = {
      ...objective,
      parameterGrids: [...objective.parameterGrids].reverse(),
      targets: [...objective.targets].reverse(),
    }

    const parsed = parseEcologyCalibrationObjective(objective, profile)
    expect(parsed.parameterGrids.map((grid) => grid.parameter)).toEqual([
      'maxDivisionRate',
      'halfSaturation',
    ])
    expect(parsed.targets.map((target) => target.id)).toEqual([
      'positive-growth',
      'resource-depletion',
      'spread-holdout',
    ])
    expect(
      ecologyCalibrationObjectiveIdentity(objective, profile),
    ).toBe(ecologyCalibrationObjectiveIdentity(reordered, profile))
  })

  it('fits only explicit engineering candidates through the mechanistic ecology kernel', () => {
    const profile = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const result = runEcologyCalibration(
      profile,
      objectiveFixture(),
      mechanisticOutputs,
    )

    const best = result.candidates[result.bestCandidateIndex]!
    expect(best.trainingLoss).toBe(0)
    expect(best.growth.maxDivisionRate).toBe(profile.growth.maxDivisionRate)
    expect(best.growth.halfSaturation).toBe(profile.growth.halfSaturation)
    expect(best.validationLoss).toBe(0)

    expect(result.identifiability).toMatchObject({
      status: 'single-acceptable-candidate',
      acceptableCandidateCount: 1,
    })
    expect(result.calibratedValues).toMatchObject({
      classification: 'calibrated',
      datasetIdentity: 'fixture:deterministic-kernel-observations-v1',
      parameterValues: {
        maxDivisionRate: profile.growth.maxDivisionRate,
        halfSaturation: profile.growth.halfSaturation,
      },
    })
  })

  it('reports multiple acceptable solutions and never uses holdout loss for selection', () => {
    const profile = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const objective: EcologyCalibrationObjective = {
      schemaVersion: 1,
      id: 'fixture-holdout-separation',
      version: '1',
      datasetIdentity: 'fixture:holdout-separation-v1',
      sourceProfileIdentity: ecologyExecutionProfileIdentity(profile),
      lossPolicy: ECOLOGY_CALIBRATION_LOSS_POLICY,
      candidateBudget: 3,
      acceptableTrainingLoss: 0,
      parameterGrids: [
        {
          parameter: 'spreadRate',
          minimum: 0,
          maximum: 0.1,
          candidates: [0, 0.05, 0.1],
        },
      ],
      targets: [
        {
          id: 'flat-fit',
          behaviorTarget: 'conservative-neighbour-spread',
          metric: 'flat-fit',
          role: 'fit',
          observed: 1,
          scale: 1,
          weight: 1,
          unit: 'dimensionless',
          context: 'Contract fixture with intentionally flat training loss.',
        },
        {
          id: 'holdout-prefers-last',
          behaviorTarget: 'conservative-neighbour-spread',
          metric: 'holdout',
          role: 'validation',
          observed: 0.1,
          scale: 0.1,
          weight: 1,
          unit: 'dimensionless',
          context: 'Holdout-only fixture; must not choose the fit candidate.',
        },
      ],
      limitation:
        'Fixture proving validation loss remains observational during selection.',
    }

    const result = runEcologyCalibration(
      profile,
      objective,
      (growth) => ({
        'flat-fit': 1,
        holdout: growth.spreadRate,
      }),
    )

    const selected = result.candidates[result.bestCandidateIndex]!
    expect(selected.growth.spreadRate).toBe(0)
    expect(selected.validationLoss).toBe(1)
    expect(result.candidates[2]!.validationLoss).toBe(0)
    expect(result.identifiability).toEqual({
      status: 'multiple-acceptable-candidates',
      acceptableCandidateCount: 3,
      acceptableRanges: [
        {
          parameter: 'spreadRate',
          minimum: 0,
          maximum: 0.1,
          distinctValues: 3,
        },
      ],
    })
  })

  it('emits no calibrated value record when every explicit candidate misses the acceptance gate', () => {
    const profile = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const objective = {
      ...objectiveFixture(),
      acceptableTrainingLoss: 0,
      targets: objectiveFixture().targets.map((target) =>
        target.role === 'fit'
          ? { ...target, observed: target.observed + 100 }
          : target,
      ),
    }

    const result = runEcologyCalibration(
      profile,
      objective,
      mechanisticOutputs,
    )

    expect(result.identifiability.status).toBe('no-acceptable-candidate')
    expect(result.identifiability.acceptableCandidateCount).toBe(0)
    expect(result.calibratedValues).toBeNull()
  })

  it('fails closed on physical-unit claims, detached profile identity, and unstable candidate grids', () => {
    const profile = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const objective = objectiveFixture()

    expect(() =>
      parseEcologyCalibrationObjective(
        {
          ...objective,
          targets: objective.targets.map((target, index) =>
            index === 0 ? { ...target, unit: 'mg/L' } : target,
          ),
        },
        profile,
      ),
    ).toThrow(/model units or dimensionless/)

    expect(() =>
      parseEcologyCalibrationObjective(
        {
          ...objective,
          sourceProfileIdentity: 'detached-profile',
        },
        profile,
      ),
    ).toThrow(/does not match/)

    expect(() =>
      runEcologyCalibration(
        profile,
        {
          ...objective,
          candidateBudget: 2,
        },
        mechanisticOutputs,
      ),
    ).toThrow(/candidateBudget/)

    expect(() =>
      runEcologyCalibration(
        profile,
        {
          ...objective,
          candidateBudget: 3,
          parameterGrids: [
            {
              parameter: 'spreadRate',
              minimum: 0,
              maximum: 20,
              candidates: [0, 0.05, 20],
            },
          ],
        },
        mechanisticOutputs,
      ),
    ).toThrow(/stability bound/)
  })

  it('requires the forward model to produce every explicit finite target metric', () => {
    const profile = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    expect(() =>
      runEcologyCalibration(
        profile,
        objectiveFixture(),
        () => ({
          'early-biomass': 1,
          'resource-remaining': Number.NaN,
        }),
      ),
    ).toThrow(/finite|omitted required metric/)
  })
})
