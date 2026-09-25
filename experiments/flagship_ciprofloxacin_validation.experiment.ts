import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createComposedState,
  stepComposedState,
  type ComposedSimulationConfig,
} from '../src/sim/authoritative'
import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
} from '../src/sim/ciprofloxacinIntervention'
import { ComposedSimulationEngine } from '../src/sim/composedEngine'
import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from '../src/sim/flagshipComposition'
import type { SimulationCommand } from '../src/sim/protocol'

const EXPERIMENT_ID = 'flagship-ciprofloxacin-validation'
const SEED = 0x5eed1234

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

const CONCENTRATION_MULTIPLIERS = Object.freeze([0, 1, 2] as const)

interface ResponsePoint {
  readonly multiplier: number
  readonly concentrationMgPerL: number
  readonly storedConcentrationMgPerL: number
  readonly appliedTick: number
  readonly appliedSimulationTimeHours: number
  readonly appliedCommandCount: number
  readonly advancedTick: number
  readonly advancedSimulationTimeHours: number
  readonly totalBiomass: number
  readonly deathBiomass: number
  readonly totalResource: number
}

function initialization(): FlagshipRunInitialization {
  return {
    seed: SEED,
    initialResourceLevel: ENGINEERING_INITIALIZATION.initialResourceLevel,
    inocula: ENGINEERING_INITIALIZATION.inocula,
  }
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

function requireWtMic(config: ComposedSimulationConfig): number {
  const wtMic = config.ciprofloxacin?.genotypeMicMgPerL.find(
    (entry) => entry.genotypeId === 'WT',
  )?.micMgPerL
  assert.ok(
    wtMic !== undefined && Number.isFinite(wtMic) && wtMic > 0,
    'flagship ciprofloxacin validation requires positive source-backed WT MIC authority',
  )
  assert.equal(
    config.ciprofloxacin?.concentrationUnit,
    'mg/L',
    'flagship ciprofloxacin concentration authority must remain mg/L',
  )
  return wtMic
}

function commandFor(
  concentrationMgPerL: number,
  index: number,
): Extract<SimulationCommand, { type: 'apply-ciprofloxacin' }> {
  return {
    id: `cipro-validation-${index}`,
    type: 'apply-ciprofloxacin',
    intervention: {
      schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
      concentrationMgPerL,
      concentrationUnit: 'mg/L',
      blendMode: 'set',
      geometry: { kind: 'global' },
    },
  }
}

function runCommandResponse(
  concentrationMgPerL: number,
  multiplier: number,
  index: number,
): ResponsePoint {
  const plan = buildFlagshipComposedRunPlan(initialization())
  const engine = new ComposedSimulationEngine(plan.identity, plan.config)
  const before = engine.snapshot()
  const command = commandFor(concentrationMgPerL, index)
  const applied = engine.execute(command)

  assert.equal(applied.checkpoint.tick, before.checkpoint.tick)
  assert.equal(
    applied.checkpoint.simulationTimeHours,
    before.checkpoint.simulationTimeHours,
  )
  assert.equal(
    applied.checkpoint.commandCount,
    before.checkpoint.commandCount + 1,
  )
  assert.deepStrictEqual(applied.events.at(-1), {
    sequence: before.events.length,
    tick: before.checkpoint.tick,
    simulationTimeHours: before.checkpoint.simulationTimeHours,
    type: 'ciprofloxacin-applied',
    commandId: command.id,
    intervention: command.intervention,
  })

  const storedConcentration = Math.fround(concentrationMgPerL)
  for (let cell = 0; cell < plan.config.mask.length; cell += 1) {
    assert.equal(
      applied.checkpoint.composedState.ciprofloxacinConcentrationMgPerL[cell],
      plan.config.mask[cell] === 1 ? storedConcentration : 0,
      'accepted ciprofloxacin intervention must write exact Float32 concentration in-mask and zero off-mask',
    )
  }

  const advanced = engine.execute({
    id: `cipro-validation-advance-${index}`,
    type: 'advance',
    ticks: 1,
  })

  assert.equal(advanced.checkpoint.tick, before.checkpoint.tick + 1)
  assert.ok(
    advanced.checkpoint.simulationTimeHours >
      before.checkpoint.simulationTimeHours,
  )

  return Object.freeze({
    multiplier,
    concentrationMgPerL,
    storedConcentrationMgPerL: storedConcentration,
    appliedTick: applied.checkpoint.tick,
    appliedSimulationTimeHours: applied.checkpoint.simulationTimeHours,
    appliedCommandCount: applied.checkpoint.commandCount,
    advancedTick: advanced.checkpoint.tick,
    advancedSimulationTimeHours:
      advanced.checkpoint.simulationTimeHours,
    totalBiomass: advanced.checkpoint.metrics.totalBiomass,
    deathBiomass: advanced.checkpoint.metrics.deathBiomass,
    totalResource: advanced.checkpoint.metrics.totalResource,
  })
}

describe.sequential('flagship ciprofloxacin integration validation', () => {
  it('records zero-drug equivalence and strict WT-MIC-derived intervention response evidence', () => {
    const startedAt = new Date().toISOString()
    const plan = buildFlagshipComposedRunPlan(initialization())
    const wtMic = requireWtMic(plan.config)

    try {
      const withPdState = createComposedState(plan.config)
      const withoutPdConfig: ComposedSimulationConfig = {
        ...plan.config,
        ciprofloxacin: null,
      }
      const withoutPdState = createComposedState(withoutPdConfig)

      const withPdMetrics = stepComposedState(withPdState, plan.config)
      const withoutPdMetrics = stepComposedState(
        withoutPdState,
        withoutPdConfig,
      )

      assert.deepStrictEqual(withPdState.resource, withoutPdState.resource)
      assert.deepStrictEqual(
        withPdState.lineageBiomass,
        withoutPdState.lineageBiomass,
      )
      assert.deepStrictEqual(withPdMetrics, withoutPdMetrics)

      const baselineEngine = new ComposedSimulationEngine(
        plan.identity,
        plan.config,
      )
      const baselineAdvanced = baselineEngine.execute({
        id: 'cipro-validation-zero-baseline-advance',
        type: 'advance',
        ticks: 1,
      })

      const responses = CONCENTRATION_MULTIPLIERS.map(
        (multiplier, index) =>
          runCommandResponse(wtMic * multiplier, multiplier, index),
      )

      const zeroCommandPlan = buildFlagshipComposedRunPlan(initialization())
      const zeroCommandEngine = new ComposedSimulationEngine(
        zeroCommandPlan.identity,
        zeroCommandPlan.config,
      )
      zeroCommandEngine.execute(commandFor(0, 100))
      const zeroCommandAdvanced = zeroCommandEngine.execute({
        id: 'cipro-validation-zero-command-advance',
        type: 'advance',
        ticks: 1,
      })

      assert.deepStrictEqual(
        zeroCommandAdvanced.checkpoint.composedState.resource,
        baselineAdvanced.checkpoint.composedState.resource,
      )
      assert.deepStrictEqual(
        zeroCommandAdvanced.checkpoint.composedState.lineageBiomass,
        baselineAdvanced.checkpoint.composedState.lineageBiomass,
      )
      assert.deepStrictEqual(
        zeroCommandAdvanced.checkpoint.metrics,
        baselineAdvanced.checkpoint.metrics,
      )

      assert.ok(
        responses[1]!.totalBiomass < responses[0]!.totalBiomass,
        '1x WT MIC must strictly reduce integrated biomass relative to zero concentration',
      )
      assert.ok(
        responses[2]!.totalBiomass < responses[1]!.totalBiomass,
        '2x WT MIC must strictly reduce integrated biomass relative to 1x WT MIC',
      )
      assert.ok(
        responses[1]!.deathBiomass > responses[0]!.deathBiomass,
        '1x WT MIC must strictly increase death biomass relative to zero concentration',
      )
      assert.ok(
        responses[2]!.deathBiomass > responses[1]!.deathBiomass,
        '2x WT MIC must strictly increase death biomass relative to 1x WT MIC',
      )

      assert.ok(
        responses.every(
          (response) =>
            response.appliedTick === 0 &&
            response.appliedSimulationTimeHours === 0 &&
            response.appliedCommandCount === 1 &&
            response.advancedTick === 1 &&
            response.advancedSimulationTimeHours ===
              plan.config.hoursPerTick,
        ),
        'every response point must use identical biological advancement after an accepted intervention',
      )

      const compactResult = {
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'passed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        authority: 'composed',
        scenario: {
          id: plan.identity.scenarioId,
          version: plan.identity.scenarioVersion,
          parameter_set_id: plan.identity.parameterSetId,
          parameter_set_version: plan.identity.parameterSetVersion,
          configuration_fingerprint:
            plan.parameterSetBinding.configurationFingerprint,
          seed: SEED,
        },
        engineering_run_state: {
          classification: 'engineering experiment initialization',
          initial_resource_level:
            ENGINEERING_INITIALIZATION.initialResourceLevel,
          inocula: ENGINEERING_INITIALIZATION.inocula,
          resource_unit: plan.resourceContext.concentrationUnit,
          biomass_unit: 'model-biomass',
          note:
            'Initialization mirrors existing flagship regression/soak fixtures and is not a physical substrate, CFU, or clinical dosing claim.',
        },
        ciprofloxacin_authority: {
          genotype_id: 'WT',
          wt_mic_mg_per_l: wtMic,
          concentration_unit: 'mg/L',
          tested_multipliers: CONCENTRATION_MULTIPLIERS,
          intervention_schema_version:
            CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
          command_type: 'apply-ciprofloxacin',
          geometry: 'global',
          blend_mode: 'set',
        },
        zero_drug_equivalence: {
          pd_present_vs_absent_resource_exact: true,
          pd_present_vs_absent_lineage_biomass_exact: true,
          pd_present_vs_absent_metrics_exact: true,
          zero_command_vs_no_command_resource_exact: true,
          zero_command_vs_no_command_lineage_biomass_exact: true,
          zero_command_vs_no_command_metrics_exact: true,
        },
        response_points: responses,
        acceptance: {
          zero_drug_pd_equivalence_exact: true,
          zero_intervention_biological_equivalence_exact: true,
          intervention_preserves_tick_and_biological_time: true,
          intervention_command_position_increment_exact: true,
          intervention_event_payload_exact: true,
          concentration_state_exact_in_mask_and_zero_off_mask: true,
          equal_biological_advance_across_response_points: true,
          total_biomass_strictly_decreases_0x_1x_2x: true,
          death_biomass_strictly_increases_0x_1x_2x: true,
        },
        limitations: [
          'This is deterministic model-contract evidence for the active flagship composition; it is not biological validation of ciprofloxacin efficacy.',
          'WT MIC and pharmacodynamic authority come from the versioned flagship scenario; this experiment introduces no new concentration parameter.',
          'The protocol-v5 command edits authoritative concentration state globally. This does not validate diffusion, decay, clearance, physical delivery, or clinical dosing equivalence.',
          'Resource and biomass remain Petra model units under the current unbound physical resource context.',
          'This experiment uses direct ComposedSimulationEngine authority; browser Worker transport and UI command binding are separate evidence gates.',
        ],
      }

      writeCompactResult(compactResult)

      expect(
        compactResult.acceptance.total_biomass_strictly_decreases_0x_1x_2x,
      ).toBe(true)
      expect(
        compactResult.acceptance.death_biomass_strictly_increases_0x_1x_2x,
      ).toBe(true)
    } catch (error) {
      writeCompactResult({
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        scenario: {
          id: plan.identity.scenarioId,
          version: plan.identity.scenarioVersion,
          parameter_set_id: plan.identity.parameterSetId,
          parameter_set_version: plan.identity.parameterSetVersion,
          configuration_fingerprint:
            plan.parameterSetBinding.configurationFingerprint,
          seed: SEED,
        },
        ciprofloxacin_authority: {
          genotype_id: 'WT',
          wt_mic_mg_per_l: wtMic,
          concentration_unit: 'mg/L',
          tested_multipliers: CONCENTRATION_MULTIPLIERS,
        },
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  })
})
