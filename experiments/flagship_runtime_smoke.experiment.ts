import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { ComposedSimulationConfig } from '../src/sim/authoritative'
import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
} from '../src/sim/ciprofloxacinIntervention'
import { ComposedSimulationEngine } from '../src/sim/composedEngine'
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

const PREFIX_TRACE = Object.freeze([
  Object.freeze({ id: 'runtime-smoke-advance-0', type: 'advance', ticks: 1 }),
] satisfies readonly SimulationCommand[])

const SUFFIX_TRACE = Object.freeze([
  Object.freeze({ id: 'runtime-smoke-advance-1', type: 'advance', ticks: 7 }),
] satisfies readonly SimulationCommand[])

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

function ciprofloxacinCommand(
  config: ComposedSimulationConfig,
): Extract<SimulationCommand, { type: 'apply-ciprofloxacin' }> {
  const wtMic = config.ciprofloxacin?.genotypeMicMgPerL.find(
    (entry) => entry.genotypeId === 'WT',
  )?.micMgPerL

  assert.ok(
    wtMic !== undefined && Number.isFinite(wtMic) && wtMic > 0,
    'flagship runtime smoke requires positive source-backed WT ciprofloxacin MIC authority',
  )

  return {
    id: 'runtime-smoke-ciprofloxacin',
    type: 'apply-ciprofloxacin',
    intervention: {
      schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
      concentrationMgPerL: wtMic,
      concentrationUnit: 'mg/L',
      blendMode: 'set',
      geometry: { kind: 'global' },
    },
  }
}

function assertAcceptedIntervention(
  before: ComposedSimulationSnapshot,
  after: ComposedSimulationSnapshot,
  command: Extract<SimulationCommand, { type: 'apply-ciprofloxacin' }>,
  mask: readonly number[],
): void {
  assert.equal(after.checkpoint.tick, before.checkpoint.tick)
  assert.equal(
    after.checkpoint.simulationTimeHours,
    before.checkpoint.simulationTimeHours,
  )
  assert.equal(
    after.checkpoint.commandCount,
    before.checkpoint.commandCount + 1,
  )
  assert.deepStrictEqual(after.events.at(-1), {
    sequence: before.events.length,
    tick: before.checkpoint.tick,
    simulationTimeHours: before.checkpoint.simulationTimeHours,
    type: 'ciprofloxacin-applied',
    commandId: command.id,
    intervention: command.intervention,
  })

  const concentration =
    after.checkpoint.composedState.ciprofloxacinConcentrationMgPerL
  let inMaskCells = 0
  let exposedCells = 0
  for (let index = 0; index < mask.length; index += 1) {
    if (mask[index] === 1) {
      inMaskCells += 1
      if (concentration[index]! > 0) exposedCells += 1
    } else {
      assert.equal(
        concentration[index],
        0,
        'accepted global ciprofloxacin command must not write outside authoritative mask',
      )
    }
  }
  assert.equal(
    exposedCells,
    inMaskCells,
    'accepted global ciprofloxacin command must expose every authoritative in-mask cell',
  )
}

describe.sequential('flagship runtime smoke', () => {
  it('proves composed intervention, checkpoint restore, and exact replay', () => {
    const startedAt = new Date().toISOString()
    const plan = buildFlagshipComposedRunPlan(initialization())
    const intervention = ciprofloxacinCommand(plan.config)
    const commandTrace = Object.freeze([
      ...PREFIX_TRACE,
      intervention,
      ...SUFFIX_TRACE,
    ] satisfies readonly SimulationCommand[])

    try {
      const direct = new ComposedSimulationEngine(plan.identity, plan.config)
      const initial = direct.snapshot()
      requireComposedSnapshot('initial snapshot', initial)

      const preIntervention = direct.execute(PREFIX_TRACE[0]!)
      requireComposedSnapshot('pre-intervention advance', preIntervention)
      const midpointCheckpoint: ComposedSimulationCheckpoint =
        structuredClone(preIntervention.checkpoint)

      const applied = direct.execute(intervention)
      requireComposedSnapshot('accepted ciprofloxacin intervention', applied)
      assertAcceptedIntervention(
        preIntervention,
        applied,
        intervention,
        plan.config.mask,
      )

      const final = direct.execute(SUFFIX_TRACE[0]!)
      requireComposedSnapshot('post-intervention advance', final)

      const replay = new ComposedSimulationEngine(plan.identity, plan.config)
      const replayInitial = replay.snapshot()
      const replayPreIntervention = replay.execute(PREFIX_TRACE[0]!)
      const replayApplied = replay.execute(structuredClone(intervention))
      const replayFinal = replay.execute(SUFFIX_TRACE[0]!)

      assert.deepStrictEqual(
        replayInitial,
        initial,
        'same seed/config must reproduce the exact initial snapshot',
      )
      assert.deepStrictEqual(
        replayPreIntervention,
        preIntervention,
        'same seed/config + prefix must replay exactly',
      )
      assert.deepStrictEqual(
        replayApplied,
        applied,
        'same authoritative intervention command must replay exactly',
      )
      assert.deepStrictEqual(
        replayFinal,
        final,
        'same seed/config + ordered intervention trace must replay exactly',
      )

      const restored = new ComposedSimulationEngine(plan.identity, plan.config)
      const restoredScope = restored.execute({
        id: 'runtime-smoke-restore-midpoint',
        type: 'restore',
        checkpoint: midpointCheckpoint,
      })
      requireComposedSnapshot('restored pre-intervention scope', restoredScope)

      const restoredApplied = restored.execute(structuredClone(intervention))
      requireComposedSnapshot(
        'restored accepted ciprofloxacin intervention',
        restoredApplied,
      )
      assert.deepStrictEqual(
        restoredApplied.checkpoint,
        applied.checkpoint,
        'checkpoint restore + identical intervention must reproduce the exact intervention checkpoint',
      )

      const restoredFinal = restored.execute(SUFFIX_TRACE[0]!)
      requireComposedSnapshot('restored continuation', restoredFinal)
      assert.deepStrictEqual(
        restoredFinal.checkpoint,
        final.checkpoint,
        'checkpoint restore + identical intervention/suffix must reproduce the exact final authoritative checkpoint',
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
          command: intervention,
          concentration_basis:
            'Exact active flagship WT ciprofloxacin MIC from the provenance-bound composed config; no new concentration parameter is introduced by this experiment.',
          transport_non_claim:
            'The command sets authoritative concentration state. This experiment does not validate diffusion, decay/clearance, physical delivery, or clinical dosing.',
        },
        acceptance: {
          authoritative_initialization: true,
          intervention_accepted: true,
          intervention_preserves_biological_time: true,
          intervention_checkpoint_state_observed: true,
          checkpoint_restore_intervention_exact: true,
          checkpoint_restore_continuation_exact: true,
          genesis_replay_exact: true,
        },
        command_trace: commandTrace,
        final_state: {
          tick: final.checkpoint.tick,
          command_count: final.checkpoint.commandCount,
          simulation_time_hours: final.checkpoint.simulationTimeHours,
          trace_hash: final.traceHash,
        },
        limitations: [
          'This is direct composed-engine evidence; browser Worker transport remains covered separately by worker-transport-profile and browser acceptance experiments.',
          'The intervention is a replayable concentration-field edit and does not establish calibrated ciprofloxacin transport or physical delivery equivalence.',
          'The experiment uses engineering model-resource/model-biomass initialization and does not promote those values to physical calibration.',
        ],
      }

      writeCompactResult(compactResult)

      expect(final.checkpoint.tick).toBeGreaterThan(0)
      expect(replayFinal).toEqual(final)
      expect(restoredFinal.checkpoint).toEqual(final.checkpoint)
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
