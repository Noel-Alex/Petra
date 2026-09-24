import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ComposedSimulationEngine } from '../src/sim/composedEngine'
import { CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION } from '../src/sim/ciprofloxacinIntervention'
import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from '../src/sim/flagshipComposition'
import type {
  ComposedSimulationCheckpoint,
  ComposedSimulationSnapshot,
  SimulationCommand,
} from '../src/sim/protocol'

const EXPERIMENT_ID = 'flagship-runtime-smoke'
const SEED = 0x5eed717

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

const BEFORE_INTERVENTION = Object.freeze({
  id: 'runtime-smoke-advance-before-intervention',
  type: 'advance',
  ticks: 1,
} satisfies SimulationCommand)

const AFTER_INTERVENTION = Object.freeze({
  id: 'runtime-smoke-advance-after-intervention',
  type: 'advance',
  ticks: 7,
} satisfies SimulationCommand)

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

function initialization(): FlagshipRunInitialization {
  return {
    seed: SEED,
    initialResourceLevel: ENGINEERING_INITIALIZATION.initialResourceLevel,
    inocula: ENGINEERING_INITIALIZATION.inocula,
  }
}

function requireComposedSnapshot(
  label: string,
  snapshot: ComposedSimulationSnapshot,
): void {
  assert.equal(
    snapshot.checkpoint.authority,
    'composed',
    `${label} must retain composed simulation authority`,
  )
  assert.ok(
    Number.isSafeInteger(snapshot.checkpoint.tick) &&
      snapshot.checkpoint.tick >= 0,
    `${label} tick must remain a non-negative safe integer`,
  )
  assert.ok(
    Number.isFinite(snapshot.checkpoint.simulationTimeHours) &&
      snapshot.checkpoint.simulationTimeHours >= 0,
    `${label} simulation time must remain finite and non-negative`,
  )
  assert.ok(
    Number.isSafeInteger(snapshot.checkpoint.commandCount) &&
      snapshot.checkpoint.commandCount >= 0,
    `${label} command count must remain a non-negative safe integer`,
  )
}

function buildScenarioWtMicIntervention(
  plan: ReturnType<typeof buildFlagshipComposedRunPlan>,
): SimulationCommand {
  const ciprofloxacin = plan.config.ciprofloxacin
  assert.ok(
    ciprofloxacin !== null,
    'flagship runtime smoke requires scenario-bound ciprofloxacin authority',
  )
  const wtMic = ciprofloxacin.genotypeMicMgPerL.find(
    (entry) => entry.genotypeId === 'WT',
  )?.micMgPerL
  assert.ok(
    wtMic !== undefined && Number.isFinite(wtMic) && wtMic > 0,
    'flagship runtime smoke requires a positive finite scenario WT MIC',
  )

  return {
    id: 'runtime-smoke-apply-wt-mic',
    type: 'apply-ciprofloxacin',
    intervention: {
      schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
      concentrationMgPerL: wtMic,
      concentrationUnit: ciprofloxacin.concentrationUnit,
      blendMode: 'set',
      geometry: { kind: 'global' },
    },
  }
}

function requireGlobalDrugState(
  snapshot: ComposedSimulationSnapshot,
  concentrationMgPerL: number,
): void {
  const expected = Math.fround(concentrationMgPerL)
  const state = snapshot.checkpoint.composedState
  let authoritativeCells = 0

  for (let index = 0; index < state.mask.length; index += 1) {
    const actual = state.ciprofloxacinConcentrationMgPerL[index]
    if (state.mask[index] === 1) {
      authoritativeCells += 1
      assert.equal(
        actual,
        expected,
        `authoritative ciprofloxacin cell ${index} must store scenario WT MIC`,
      )
    } else {
      assert.equal(
        actual,
        0,
        `masked-out ciprofloxacin cell ${index} must remain exactly zero`,
      )
    }
  }

  assert.ok(
    authoritativeCells > 0,
    'flagship runtime smoke requires at least one authoritative dish cell',
  )
}

describe.sequential('flagship runtime smoke', () => {
  it('replays intervention state, checkpoint restore, and deterministic continuation exactly', () => {
    const startedAt = new Date().toISOString()
    const plan = buildFlagshipComposedRunPlan(initialization())
    const intervention = buildScenarioWtMicIntervention(plan)

    if (intervention.type !== 'apply-ciprofloxacin') {
      throw new Error('runtime smoke intervention command type drifted')
    }

    try {
      const direct = new ComposedSimulationEngine(plan.identity, plan.config)
      const initial = direct.snapshot()
      requireComposedSnapshot('initial snapshot', initial)

      const beforeIntervention = direct.execute(BEFORE_INTERVENTION)
      requireComposedSnapshot('pre-intervention advance', beforeIntervention)
      const preInterventionCheckpoint: ComposedSimulationCheckpoint =
        structuredClone(beforeIntervention.checkpoint)

      const applied = direct.execute(intervention)
      requireComposedSnapshot('accepted intervention', applied)
      assert.equal(
        applied.checkpoint.tick,
        beforeIntervention.checkpoint.tick,
        'intervention must not advance biological tick',
      )
      assert.equal(
        applied.checkpoint.simulationTimeHours,
        beforeIntervention.checkpoint.simulationTimeHours,
        'intervention must not advance biological time',
      )
      assert.equal(
        applied.checkpoint.commandCount,
        beforeIntervention.checkpoint.commandCount + 1,
        'accepted intervention must advance authoritative command position once',
      )
      assert.deepStrictEqual(
        applied.events.at(-1),
        {
          sequence: applied.events.length - 1,
          tick: applied.checkpoint.tick,
          simulationTimeHours: applied.checkpoint.simulationTimeHours,
          type: 'ciprofloxacin-applied',
          commandId: intervention.id,
          intervention: intervention.intervention,
        },
        'accepted intervention must emit the exact replayable event payload',
      )
      requireGlobalDrugState(
        applied,
        intervention.intervention.concentrationMgPerL,
      )
      const postInterventionCheckpoint: ComposedSimulationCheckpoint =
        structuredClone(applied.checkpoint)

      const final = direct.execute(AFTER_INTERVENTION)
      requireComposedSnapshot('post-intervention advance', final)

      const replay = new ComposedSimulationEngine(plan.identity, plan.config)
      const replayInitial = replay.snapshot()
      const replayBeforeIntervention = replay.execute(BEFORE_INTERVENTION)
      const replayApplied = replay.execute(intervention)
      const replayFinal = replay.execute(AFTER_INTERVENTION)

      assert.deepStrictEqual(
        replayInitial,
        initial,
        'same seed/config must reproduce the exact initial snapshot',
      )
      assert.deepStrictEqual(
        replayBeforeIntervention,
        beforeIntervention,
        'pre-intervention command prefix must replay exactly',
      )
      assert.deepStrictEqual(
        replayApplied,
        applied,
        'accepted intervention state/event/trace must replay exactly',
      )
      assert.deepStrictEqual(
        replayFinal,
        final,
        'full ordered command trace must replay exactly',
      )

      const restoredBefore = new ComposedSimulationEngine(
        plan.identity,
        plan.config,
      )
      restoredBefore.execute({
        id: 'runtime-smoke-restore-before-intervention',
        type: 'restore',
        checkpoint: preInterventionCheckpoint,
      })
      const restoredApplied = restoredBefore.execute(intervention)
      requireGlobalDrugState(
        restoredApplied,
        intervention.intervention.concentrationMgPerL,
      )
      const restoredBeforeFinal = restoredBefore.execute(AFTER_INTERVENTION)
      assert.deepStrictEqual(
        restoredBeforeFinal.checkpoint,
        final.checkpoint,
        'restore-before-intervention + identical suffix must reproduce the exact authoritative checkpoint',
      )

      const restoredAfter = new ComposedSimulationEngine(
        plan.identity,
        plan.config,
      )
      const restoredDrugScope = restoredAfter.execute({
        id: 'runtime-smoke-restore-after-intervention',
        type: 'restore',
        checkpoint: postInterventionCheckpoint,
      })
      requireGlobalDrugState(
        restoredDrugScope,
        intervention.intervention.concentrationMgPerL,
      )
      const restoredAfterFinal = restoredAfter.execute(AFTER_INTERVENTION)
      assert.deepStrictEqual(
        restoredAfterFinal.checkpoint,
        final.checkpoint,
        'checkpointed intervention state + identical continuation must reproduce the exact authoritative checkpoint',
      )

      const compactResult = {
        schema_version: 2,
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
          note:
            'These run-state values mirror existing flagship regression/soak fixtures and are not physical substrate, CFU, or measured biological constants.',
        },
        intervention: {
          command_id: intervention.id,
          schema_version: intervention.intervention.schemaVersion,
          source: 'scenario WT genotype MIC authority',
          genotype_id: 'WT',
          concentration_mg_L:
            intervention.intervention.concentrationMgPerL,
          stored_float32_mg_L: Math.fround(
            intervention.intervention.concentrationMgPerL,
          ),
          concentration_unit: intervention.intervention.concentrationUnit,
          blend_mode: intervention.intervention.blendMode,
          geometry: intervention.intervention.geometry,
        },
        acceptance: {
          authoritative_initialization: true,
          ordered_advance: true,
          authoritative_intervention_accepted: true,
          intervention_preserves_biological_time: true,
          intervention_state_mask_exact: true,
          intervention_event_and_trace_replay_exact: true,
          restore_before_intervention_continuation_exact: true,
          restore_after_intervention_continuation_exact: true,
          genesis_replay_exact: true,
        },
        command_trace: [
          BEFORE_INTERVENTION,
          intervention,
          AFTER_INTERVENTION,
        ],
        final_state: {
          tick: final.checkpoint.tick,
          command_count: final.checkpoint.commandCount,
          simulation_time_hours: final.checkpoint.simulationTimeHours,
          trace_hash: final.traceHash,
        },
        limitations: [
          'This is direct composed-engine runtime evidence; browser Worker transport remains covered separately by worker-transport-profile and browser acceptance experiments.',
          'The intervention concentration is the current scenario-owned WT MIC and the global set geometry is a protocol exercise, not a clinical dose or calibrated physical delivery model.',
          'This smoke proves deterministic runtime/replay authority, not biological validation of ciprofloxacin transport or stationary-phase killing.',
        ],
      }

      writeCompactResult(compactResult)

      expect(final.checkpoint.tick).toBeGreaterThan(0)
      expect(replayApplied).toEqual(applied)
      expect(replayFinal).toEqual(final)
      expect(restoredBeforeFinal.checkpoint).toEqual(final.checkpoint)
      expect(restoredAfterFinal.checkpoint).toEqual(final.checkpoint)
    } catch (error) {
      writeCompactResult({
        schema_version: 2,
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
