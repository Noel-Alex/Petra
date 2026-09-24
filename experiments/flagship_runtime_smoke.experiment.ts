import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

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
const REMAINING_BLOCKER_ISSUE = 626
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

const PREINTERVENTION_TRACE = Object.freeze([
  Object.freeze({ id: 'runtime-smoke-advance-0', type: 'advance', ticks: 1 }),
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

describe.sequential('flagship runtime smoke preparation', () => {
  it('proves composed init, advance, checkpoint restore, and exact replay before intervention activation', () => {
    const startedAt = new Date().toISOString()
    const plan = buildFlagshipComposedRunPlan(initialization())

    try {
      const direct = new ComposedSimulationEngine(plan.identity, plan.config)
      const initial = direct.snapshot()
      requireComposedSnapshot('initial snapshot', initial)

      const first = direct.execute(PREINTERVENTION_TRACE[0]!)
      requireComposedSnapshot('first advance', first)
      const midpointCheckpoint: ComposedSimulationCheckpoint =
        structuredClone(first.checkpoint)

      const final = direct.execute(PREINTERVENTION_TRACE[1]!)
      requireComposedSnapshot('second advance', final)

      const replay = new ComposedSimulationEngine(plan.identity, plan.config)
      const replayInitial = replay.snapshot()
      const replayFirst = replay.execute(PREINTERVENTION_TRACE[0]!)
      const replayFinal = replay.execute(PREINTERVENTION_TRACE[1]!)

      assert.deepStrictEqual(
        replayInitial,
        initial,
        'same seed/config must reproduce the exact initial snapshot',
      )
      assert.deepStrictEqual(
        replayFirst,
        first,
        'same seed/config + first command must replay exactly',
      )
      assert.deepStrictEqual(
        replayFinal,
        final,
        'same seed/config + ordered commands must replay exactly',
      )

      const restored = new ComposedSimulationEngine(plan.identity, plan.config)
      const restoredScope = restored.execute({
        id: 'runtime-smoke-restore-midpoint',
        type: 'restore',
        checkpoint: midpointCheckpoint,
      })
      requireComposedSnapshot('restored checkpoint scope', restoredScope)

      const restoredFinal = restored.execute(PREINTERVENTION_TRACE[1]!)
      requireComposedSnapshot('restored continuation', restoredFinal)
      assert.deepStrictEqual(
        restoredFinal.checkpoint,
        final.checkpoint,
        'checkpoint restore + identical suffix must reproduce the exact authoritative checkpoint',
      )

      const compactResult = {
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'prepared-core-passed',
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
        prepared_acceptance: {
          authoritative_initialization: true,
          ordered_advance: true,
          checkpoint_restore_continuation_exact: true,
          genesis_replay_exact: true,
        },
        prepared_command_trace: PREINTERVENTION_TRACE,
        final_state: {
          tick: final.checkpoint.tick,
          command_count: final.checkpoint.commandCount,
          simulation_time_hours: final.checkpoint.simulationTimeHours,
          trace_hash: final.traceHash,
        },
        remaining_completion_gate: {
          issue: REMAINING_BLOCKER_ISSUE,
          requirement:
            'Append at least one accepted mutable authoritative ciprofloxacin intervention command plus replay assertion after #626 lands, then activate this stable experiment id in local_manifest.json.',
        },
        limitations: [
          'This prepared harness intentionally does not invent or emulate an intervention command before #626 defines authoritative mutable ciprofloxacin checkpoint/protocol semantics.',
          'This is direct composed-engine evidence; browser Worker transport remains covered separately by worker-transport-profile and browser acceptance experiments.',
          'The registration remains blocked until the intervention step can be tested through real authority.',
        ],
      }

      writeCompactResult(compactResult)

      expect(final.checkpoint.tick).toBeGreaterThan(0)
      expect(replayFinal).toEqual(final)
      expect(restoredFinal.checkpoint).toEqual(final.checkpoint)
    } catch (error) {
      writeCompactResult({
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'prepared-core-failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        remaining_completion_gate: {
          issue: REMAINING_BLOCKER_ISSUE,
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
