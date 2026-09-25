import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  composedConfigurationFingerprint,
  createComposedState,
  stepComposedStateDetailed,
  type ComposedMetrics,
  type ComposedSimulationConfig,
  type ComposedSimulationState,
} from '../src/sim/authoritative'
import {
  mutationEdgesForSource,
  type CuratedMutationEdge,
} from '../src/sim/evolution/graph'
import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from '../src/sim/flagshipComposition'
import {
  CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
  FRACTIONAL_CARRY_POPULATION_POLICY,
  type CellEquivalentCalibration,
} from '../src/sim/populationAuthority'

const EXPERIMENT_ID = 'population-scale-calibration'
const SEED = 0x7960_0001
const HORIZON_TICKS = 1_024
const HUSEBY_SOURCE_KEY = 'huseby_2017'
const CANDIDATE_TARGETS = Object.freeze([
  Object.freeze({
    id: 'lower-supply-control',
    terminalCellEquivalents: 4e8,
    interpretation: 'one-decade lower effective-population control',
  }),
  Object.freeze({
    id: 'huseby-standard',
    terminalCellEquivalents: 4e9,
    interpretation: 'Huseby-compatible standard terminal effective-population target',
  }),
  Object.freeze({
    id: 'huseby-tenfold-sensitivity',
    terminalCellEquivalents: 4e10,
    interpretation: 'Huseby-compatible tenfold population-sensitivity target',
  }),
])

const ENGINEERING_INITIALIZATION = Object.freeze({
  initialResourceLevel: 8,
  inocula: Object.freeze([
    Object.freeze({
      lineageId: 'founder-wt',
      x: 80,
      y: 80,
      biomass: 1,
    }),
  ]),
})

interface CumulativeEcology {
  readonly divisionBiomass: number
  readonly deathBiomass: number
  readonly resourceConsumed: number
}

interface BaselineRun {
  readonly state: ComposedSimulationState
  readonly initialTotalBiomass: number
  readonly initialTotalResource: number
  readonly finalMetrics: ComposedMetrics
  readonly cumulative: CumulativeEcology
}

interface CandidateRun {
  readonly targetId: string
  readonly targetTerminalCellEquivalents: number
  readonly interpretation: string
  readonly calibration: CellEquivalentCalibration
  readonly configurationFingerprint: string
  readonly founderEffectiveCellEquivalents: number
  readonly initialStandingHosts: number
  readonly finalStandingHosts: number
  readonly finalStandingResidualCellEquivalents: number
  readonly cumulativeDivisionOpportunities: number
  readonly cumulativeDivisionOpportunitiesByLineage: Readonly<Record<string, number>>
  readonly finalDivisionResidualCellEquivalents: number
  readonly cumulativeDivisionCellEquivalents: number
  readonly divisionOpportunityReconciliationError: number
  readonly finalCellEquivalentsFromBiomass: number
  readonly finalStandingReconciliationError: number
  readonly maximumObservedDiscreteCount: number
  readonly safeIntegerHeadroom: number
  readonly expectedMutationSupply: readonly MutationSupplyRecord[]
  readonly continuousEcologyUnchanged: true
}

interface MutationSupplyRecord {
  readonly fromGenotypeId: string
  readonly toGenotypeId: string
  readonly probabilityPerDivision: number
  readonly mutationClass: string
  readonly citationKey: string
  readonly sourceDivisionOpportunities: number
  readonly expectedMutationEvents: number
  readonly sourceGenotypeActiveInCalibrationRun: boolean
}

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = `${output}.tmp`
  writeFileSync(temporary, JSON.stringify(result, null, 2) + '\n', 'utf8')
  renameSync(temporary, output)
}

function initialization(): FlagshipRunInitialization {
  return {
    seed: SEED,
    initialResourceLevel: ENGINEERING_INITIALIZATION.initialResourceLevel,
    inocula: ENGINEERING_INITIALIZATION.inocula,
  }
}

function sum(values: readonly number[]): number {
  let total = 0
  for (const value of values) total += value
  return total
}

function sumInMask(values: readonly number[], mask: readonly number[]): number {
  let total = 0
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1) total += values[index]!
  }
  return total
}

function totalBiomass(state: ComposedSimulationState): number {
  let total = 0
  for (const channel of state.lineageBiomass) {
    total += sumInMask(channel, state.mask)
  }
  return total
}

function totalResource(state: ComposedSimulationState): number {
  return sumInMask(state.resource, state.mask)
}

function safeIntegerAdd(name: string, left: number, right: number): number {
  if (!Number.isSafeInteger(left) || left < 0) {
    throw new Error(`${name} accumulator must be a non-negative safe integer`)
  }
  if (!Number.isSafeInteger(right) || right < 0) {
    throw new Error(`${name} increment must be a non-negative safe integer`)
  }
  const next = left + right
  if (!Number.isSafeInteger(next)) {
    throw new Error(`${name} exceeded the safe-integer domain`)
  }
  return next
}

function sumSafeIntegerChannels(
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

function sumResidualChannels(channels: readonly ArrayLike<number>[]): number {
  let total = 0
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const value = channel[index]!
      assert.ok(
        Number.isFinite(value) && value >= 0 && value < 1,
        'population residuals must remain finite and in [0, 1)',
      )
      total += value
    }
  }
  return total
}

function maximumSafeIntegerChannelValue(
  channels: readonly ArrayLike<number>[],
): number {
  let maximum = 0
  for (const channel of channels) {
    for (let index = 0; index < channel.length; index += 1) {
      const value = channel[index]!
      assert.ok(
        Number.isSafeInteger(value) && value >= 0,
        'population count channels must remain non-negative safe integers',
      )
      if (value > maximum) maximum = value
    }
  }
  return maximum
}

function cumulativeAdd(
  cumulative: CumulativeEcology,
  metrics: ComposedMetrics,
): CumulativeEcology {
  return {
    divisionBiomass: cumulative.divisionBiomass + metrics.divisionBiomass,
    deathBiomass: cumulative.deathBiomass + metrics.deathBiomass,
    resourceConsumed: cumulative.resourceConsumed + metrics.resourceConsumed,
  }
}

function runBaseline(config: ComposedSimulationConfig): BaselineRun {
  assert.equal(
    config.populationAuthority,
    null,
    'calibration baseline must remain population-unbound',
  )
  assert.ok(
    config.ciprofloxacinConcentrationMgPerL.every((value) => value === 0),
    'population calibration must run at exactly zero ciprofloxacin',
  )

  const state = createComposedState(config)
  const initialTotalBiomass = totalBiomass(state)
  const initialTotalResource = totalResource(state)
  let cumulative: CumulativeEcology = {
    divisionBiomass: 0,
    deathBiomass: 0,
    resourceConsumed: 0,
  }
  let finalMetrics: ComposedMetrics | null = null

  for (let tick = 0; tick < HORIZON_TICKS; tick += 1) {
    const step = stepComposedStateDetailed(state, config)
    assert.equal(
      step.divisionOpportunities,
      null,
      'population-unbound baseline must not emit discrete division opportunities',
    )
    assert.equal(
      step.totalDivisionOpportunities,
      null,
      'population-unbound baseline must not emit a discrete opportunity total',
    )
    cumulative = cumulativeAdd(cumulative, step.metrics)
    finalMetrics = step.metrics
  }

  assert.ok(finalMetrics !== null, 'fixed calibration horizon must advance at least once')
  return {
    state,
    initialTotalBiomass,
    initialTotalResource,
    finalMetrics,
    cumulative,
  }
}

function calibratedPopulationConfig(
  baselineConfig: ComposedSimulationConfig,
  targetId: string,
  terminalCellEquivalents: number,
  finalModelBiomass: number,
): {
  readonly config: ComposedSimulationConfig
  readonly calibration: CellEquivalentCalibration
} {
  assert.ok(
    Number.isFinite(finalModelBiomass) && finalModelBiomass > 0,
    'final model biomass must be positive before deriving an effective-population scale',
  )
  assert.ok(
    Number.isSafeInteger(terminalCellEquivalents) && terminalCellEquivalents > 0,
    'terminal cell-equivalent target must be a positive safe integer',
  )

  const modelBiomassPerCellEquivalent =
    finalModelBiomass / terminalCellEquivalents
  assert.ok(
    Number.isFinite(modelBiomassPerCellEquivalent) &&
      modelBiomassPerCellEquivalent > 0,
    'derived effective-population scale must be positive and finite',
  )

  const calibration: CellEquivalentCalibration = Object.freeze({
    schemaVersion: CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
    id: `petra-effective-population/${targetId}-at-${HORIZON_TICKS}-ticks-v1`,
    modelBiomassPerCellEquivalent,
    provenance: Object.freeze({
      classification: 'calibrated',
      sourceKeys: Object.freeze([HUSEBY_SOURCE_KEY]),
      limitation:
        'Effective mutation-supply calibration only. This does not claim that Petra model biomass is a measured CFU, bacterial mass, volume, glucose yield, or physical local density; Huseby uses a well-mixed/passaged MG1655 population context while this flagship uses engineering model-resource/model-biomass spatial ecology.',
    }),
  })

  return {
    calibration,
    config: {
      ...baselineConfig,
      populationAuthority: {
        calibration,
        policy: FRACTIONAL_CARRY_POPULATION_POLICY,
      },
    },
  }
}

function assertContinuousStateEqual(
  candidate: ComposedSimulationState,
  reference: ComposedSimulationState,
): void {
  assert.deepStrictEqual(candidate.mask, reference.mask)
  assert.deepStrictEqual(candidate.resource, reference.resource)
  assert.deepStrictEqual(candidate.lineageIds, reference.lineageIds)
  assert.deepStrictEqual(candidate.genotypeIds, reference.genotypeIds)
  assert.deepStrictEqual(candidate.lineageBiomass, reference.lineageBiomass)
  assert.deepStrictEqual(
    candidate.ciprofloxacinConcentrationMgPerL,
    reference.ciprofloxacinConcentrationMgPerL,
  )
}

function mutationSupplyForCandidate(
  config: ComposedSimulationConfig,
  lineageDivisionOpportunities: Readonly<Record<string, number>>,
): readonly MutationSupplyRecord[] {
  const opportunitiesByGenotype = new Map<string, number>()
  for (const lineage of config.lineages) {
    const lineageOpportunities = lineageDivisionOpportunities[lineage.id] ?? 0
    opportunitiesByGenotype.set(
      lineage.genotypeId,
      safeIntegerAdd(
        `division opportunities for genotype ${lineage.genotypeId}`,
        opportunitiesByGenotype.get(lineage.genotypeId) ?? 0,
        lineageOpportunities,
      ),
    )
  }

  return Object.freeze(
    config.evolutionGraph.transitions.map((edge: CuratedMutationEdge) => {
      const sourceDivisionOpportunities =
        opportunitiesByGenotype.get(edge.fromGenotypeId) ?? 0
      return Object.freeze({
        fromGenotypeId: edge.fromGenotypeId,
        toGenotypeId: edge.toGenotypeId,
        probabilityPerDivision: edge.probabilityPerDivision,
        mutationClass: edge.mutationClass,
        citationKey: edge.citationKey,
        sourceDivisionOpportunities,
        expectedMutationEvents:
          sourceDivisionOpportunities * edge.probabilityPerDivision,
        sourceGenotypeActiveInCalibrationRun:
          opportunitiesByGenotype.has(edge.fromGenotypeId),
      })
    }),
  )
}

function runCandidate(args: {
  readonly baselineConfig: ComposedSimulationConfig
  readonly baseline: BaselineRun
  readonly targetId: string
  readonly terminalCellEquivalents: number
  readonly interpretation: string
}): CandidateRun {
  const { config, calibration } = calibratedPopulationConfig(
    args.baselineConfig,
    args.targetId,
    args.terminalCellEquivalents,
    args.baseline.finalMetrics.totalBiomass,
  )
  const referenceState = createComposedState(args.baselineConfig)
  const candidateState = createComposedState(config)
  assert.ok(
    candidateState.discretePopulation !== null,
    'candidate run must initialize discrete population authority',
  )

  const founderEffectiveCellEquivalents =
    args.baseline.initialTotalBiomass /
    calibration.modelBiomassPerCellEquivalent
  const initialStandingHosts = sumSafeIntegerChannels(
    'initial standing hosts',
    candidateState.discretePopulation.standingHostCounts,
  )

  let cumulative: CumulativeEcology = {
    divisionBiomass: 0,
    deathBiomass: 0,
    resourceConsumed: 0,
  }
  let cumulativeDivisionOpportunities = 0
  const lineageDivisionOpportunities = Object.fromEntries(
    config.lineages.map((lineage) => [lineage.id, 0]),
  ) as Record<string, number>

  for (let tick = 0; tick < HORIZON_TICKS; tick += 1) {
    const referenceStep = stepComposedStateDetailed(
      referenceState,
      args.baselineConfig,
    )
    const candidateStep = stepComposedStateDetailed(candidateState, config)

    assert.deepStrictEqual(
      candidateStep.metrics,
      referenceStep.metrics,
      `population authority changed continuous ecology metrics at tick ${tick + 1}`,
    )
    assert.ok(
      candidateStep.divisionOpportunities !== null &&
        candidateStep.totalDivisionOpportunities !== null,
      'calibrated run must emit exact discrete division opportunities',
    )
    assert.equal(
      candidateStep.divisionOpportunities.length,
      config.lineages.length,
      'division-opportunity lineage count must match composed lineage order',
    )

    cumulative = cumulativeAdd(cumulative, candidateStep.metrics)
    cumulativeDivisionOpportunities = safeIntegerAdd(
      'cumulative division opportunities',
      cumulativeDivisionOpportunities,
      candidateStep.totalDivisionOpportunities,
    )

    for (
      let lineageIndex = 0;
      lineageIndex < config.lineages.length;
      lineageIndex += 1
    ) {
      const lineage = config.lineages[lineageIndex]!
      const channelTotal = sumSafeIntegerChannels(
        `division opportunities for lineage ${lineage.id}`,
        [candidateStep.divisionOpportunities[lineageIndex]!],
      )
      lineageDivisionOpportunities[lineage.id] = safeIntegerAdd(
        `cumulative division opportunities for lineage ${lineage.id}`,
        lineageDivisionOpportunities[lineage.id]!,
        channelTotal,
      )
    }
  }

  assertContinuousStateEqual(candidateState, referenceState)
  assert.deepStrictEqual(
    cumulative,
    args.baseline.cumulative,
    'candidate and baseline cumulative continuous ecology must remain identical',
  )
  assert.deepStrictEqual(
    {
      totalBiomass: totalBiomass(candidateState),
      totalResource: totalResource(candidateState),
    },
    {
      totalBiomass: args.baseline.finalMetrics.totalBiomass,
      totalResource: args.baseline.finalMetrics.totalResource,
    },
    'candidate final continuous state must equal the unbound baseline',
  )

  const population = candidateState.discretePopulation
  assert.ok(population !== null, 'candidate must retain discrete population state')

  const finalStandingHosts = sumSafeIntegerChannels(
    'final standing hosts',
    population.standingHostCounts,
  )
  const finalStandingResidualCellEquivalents = sumResidualChannels(
    population.standingResidualCellEquivalents,
  )
  const finalDivisionResidualCellEquivalents = sumResidualChannels(
    population.divisionResidualCellEquivalents,
  )
  const finalCellEquivalentsFromBiomass =
    args.baseline.finalMetrics.totalBiomass /
    calibration.modelBiomassPerCellEquivalent
  const finalStandingReconciliationError = Math.abs(
    finalStandingHosts +
      finalStandingResidualCellEquivalents -
      finalCellEquivalentsFromBiomass,
  )

  const cumulativeDivisionCellEquivalents =
    args.baseline.cumulative.divisionBiomass /
    calibration.modelBiomassPerCellEquivalent
  const divisionOpportunityReconciliationError = Math.abs(
    cumulativeDivisionOpportunities +
      finalDivisionResidualCellEquivalents -
      cumulativeDivisionCellEquivalents,
  )

  const maximumObservedDiscreteCount = Math.max(
    finalStandingHosts,
    cumulativeDivisionOpportunities,
    maximumSafeIntegerChannelValue(population.standingHostCounts),
  )
  assert.ok(
    Number.isSafeInteger(maximumObservedDiscreteCount),
    'reported discrete counts must stay inside safe-integer authority',
  )
  const safeIntegerHeadroom =
    Number.MAX_SAFE_INTEGER - maximumObservedDiscreteCount

  const numericalTolerance = Math.max(
    1e-6,
    1e-10 * Math.max(1, finalCellEquivalentsFromBiomass),
  )
  assert.ok(
    finalStandingReconciliationError <= numericalTolerance,
    'standing host + residual authority must reconcile with final biomass scale',
  )
  assert.ok(
    divisionOpportunityReconciliationError <= numericalTolerance,
    'cumulative division opportunities + residual must reconcile with division biomass scale',
  )

  return Object.freeze({
    targetId: args.targetId,
    targetTerminalCellEquivalents: args.terminalCellEquivalents,
    interpretation: args.interpretation,
    calibration,
    configurationFingerprint: composedConfigurationFingerprint(config),
    founderEffectiveCellEquivalents,
    initialStandingHosts,
    finalStandingHosts,
    finalStandingResidualCellEquivalents,
    cumulativeDivisionOpportunities,
    cumulativeDivisionOpportunitiesByLineage: Object.freeze({
      ...lineageDivisionOpportunities,
    }),
    finalDivisionResidualCellEquivalents,
    cumulativeDivisionCellEquivalents,
    divisionOpportunityReconciliationError,
    finalCellEquivalentsFromBiomass,
    finalStandingReconciliationError,
    maximumObservedDiscreteCount,
    safeIntegerHeadroom,
    expectedMutationSupply: mutationSupplyForCandidate(
      config,
      lineageDivisionOpportunities,
    ),
    continuousEcologyUnchanged: true,
  })
}

describe.sequential('population scale calibration local experiment', () => {
  it('measures an effective mutation-supply scale without inventing physical biomass or feeding discreteness back into ecology', () => {
    const startedAt = new Date().toISOString()
    let evidenceWritten = false

    try {
      const plan = buildFlagshipComposedRunPlan(initialization())
      assert.equal(
        plan.config.populationAuthority,
        null,
        'current flagship must remain population-unbound until calibration is promoted explicitly',
      )
      assert.ok(
        plan.config.ciprofloxacinConcentrationMgPerL.every(
          (value) => value === 0,
        ),
        'calibration baseline must use exact zero ciprofloxacin',
      )

      const founderLineage = plan.config.lineages.find(
        (lineage) => lineage.id === 'founder-wt',
      )
      assert.ok(
        founderLineage !== undefined,
        'flagship calibration requires the founder-wt lineage',
      )

      const baseline = runBaseline(plan.config)
      const candidates = CANDIDATE_TARGETS.map((target) =>
        runCandidate({
          baselineConfig: plan.config,
          baseline,
          targetId: target.id,
          terminalCellEquivalents: target.terminalCellEquivalents,
          interpretation: target.interpretation,
        }),
      )

      const founderEdges = mutationEdgesForSource(
        plan.config.evolutionGraph,
        founderLineage.genotypeId,
      )
      assert.ok(
        founderEdges.length > 0,
        'calibration requires at least one curated mutation edge from the founder genotype',
      )

      const allNumericallySound = candidates.every(
        (candidate) =>
          candidate.continuousEcologyUnchanged &&
          candidate.safeIntegerHeadroom > 0 &&
          Number.isSafeInteger(candidate.cumulativeDivisionOpportunities) &&
          Number.isSafeInteger(candidate.finalStandingHosts),
      )

      const compactResult = {
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: allNumericallySound ? 'passed' : 'failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        authority: {
          scenario_id: plan.identity.scenarioId,
          scenario_version: plan.identity.scenarioVersion,
          parameter_set_id: plan.identity.parameterSetId,
          parameter_set_version: plan.identity.parameterSetVersion,
          baseline_configuration_fingerprint:
            plan.parameterSetBinding.configurationFingerprint,
          population_policy_id: FRACTIONAL_CARRY_POPULATION_POLICY.id,
          source_key: HUSEBY_SOURCE_KEY,
          evidence_class: 'calibrated',
        },
        workload: {
          seed: SEED,
          horizon_ticks: HORIZON_TICKS,
          hours_per_tick: plan.config.hoursPerTick,
          simulated_hours: HORIZON_TICKS * plan.config.hoursPerTick,
          initial_resource_level:
            ENGINEERING_INITIALIZATION.initialResourceLevel,
          founder_inoculum: ENGINEERING_INITIALIZATION.inocula,
          ciprofloxacin_mg_per_l: 0,
          horizon_policy:
            'Fixed 1024-tick engineering horizon selected before fitting and aligned with flagship-long-soak default; no resource-depletion or plateau claim is implied.',
        },
        continuous_ecology: {
          initial_total_model_biomass: baseline.initialTotalBiomass,
          final_total_model_biomass: baseline.finalMetrics.totalBiomass,
          initial_total_model_resource: baseline.initialTotalResource,
          final_total_model_resource: baseline.finalMetrics.totalResource,
          cumulative_division_model_biomass:
            baseline.cumulative.divisionBiomass,
          cumulative_death_model_biomass: baseline.cumulative.deathBiomass,
          cumulative_model_resource_consumed:
            baseline.cumulative.resourceConsumed,
          final_occupied_cells: baseline.finalMetrics.occupiedCells,
        },
        candidates,
        acceptance: {
          all_candidate_runs_preserve_continuous_ecology_exactly:
            candidates.every(
              (candidate) => candidate.continuousEcologyUnchanged,
            ),
          all_discrete_totals_remain_safe_integers:
            candidates.every(
              (candidate) =>
                candidate.safeIntegerHeadroom > 0 &&
                Number.isSafeInteger(
                  candidate.cumulativeDivisionOpportunities,
                ) &&
                Number.isSafeInteger(candidate.finalStandingHosts),
            ),
          all_population_reconciliations_within_declared_tolerance:
            candidates.every(
              (candidate) =>
                candidate.finalStandingReconciliationError <=
                  Math.max(
                    1e-6,
                    1e-10 *
                      Math.max(
                        1,
                        candidate.finalCellEquivalentsFromBiomass,
                      ),
                  ) &&
                candidate.divisionOpportunityReconciliationError <=
                  Math.max(
                    1e-6,
                    1e-10 *
                      Math.max(
                        1,
                        candidate.finalCellEquivalentsFromBiomass,
                      ),
                  ),
            ),
          numerical_preparation_passed: allNumericallySound,
          calibration_promoted: false,
          selected_candidate_id: null,
        },
        limitations: [
          'A cell-equivalent here is an effective mutation-supply opportunity unit calibrated to a declared terminal population target; it is not a measured CFU, bacterial mass, volume, glucose yield, or physical local density.',
          'Huseby provides MG1655 mutation-supply/population-scale context, but its well-mixed/passaged physical-resource model is not a physical calibration of Petra\'s engineering model-resource/model-biomass spatial ecology.',
          'This experiment uses no mutation child materialization. Curated edges whose source genotype is absent from the founder-only calibration run therefore receive zero source division opportunities rather than an invented downstream supply.',
          'Passing this experiment does not promote a candidate. #796 must review sensitivity and identity/provenance, and #5/#740 must later consume the same candidate bracket for many-seed mutation-emergence evidence before activation.',
          'Renderer glyph counts remain presentation-only regardless of this effective population calibration.',
        ],
      }

      writeCompactResult(compactResult)
      evidenceWritten = true

      expect(candidates).toHaveLength(CANDIDATE_TARGETS.length)
      expect(allNumericallySound).toBe(true)
      expect(
        candidates.every(
          (candidate) => candidate.continuousEcologyUnchanged,
        ),
      ).toBe(true)
    } catch (error) {
      if (!evidenceWritten) {
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
      }
      throw error
    }
  })
})
