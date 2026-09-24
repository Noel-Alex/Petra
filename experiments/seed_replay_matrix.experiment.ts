import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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

const EXPERIMENT_ID = 'seed-replay-matrix'
const DEFAULT_SEEDS = [0, 0x5eed1234, 0xffffffff] as const
const COMMAND_TRACE = Object.freeze([
  Object.freeze({ id: 'matrix-advance-0', type: 'advance', ticks: 1 }),
  Object.freeze({ id: 'matrix-advance-1', type: 'advance', ticks: 7 }),
  Object.freeze({ id: 'matrix-advance-2', type: 'advance', ticks: 32 }),
  Object.freeze({ id: 'matrix-advance-3', type: 'advance', ticks: 64 }),
] satisfies readonly SimulationCommand[])

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

interface SeedReplayResult {
  readonly seed: number
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly parameterSetId: string
  readonly parameterSetVersion: string
  readonly configurationFingerprint: string
  readonly genesisReplayExact: boolean
  readonly checkpointContinuationExact: boolean
  readonly directFinalTraceHash: string
  readonly replayFinalTraceHash: string
  readonly restoreScopeFinalTraceHash: string
  readonly directFinalCheckpointSha256: string
  readonly restoreScopeEventCount: number
  readonly finalTick: number
  readonly finalCommandCount: number
  readonly finalSimulationTimeHours: number
}

function parseSeeds(raw: string | undefined): number[] {
  if (raw === undefined || raw.trim() === '') return [...DEFAULT_SEEDS]

  const seeds = raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => Number(value))

  if (seeds.length < 2) {
    throw new Error('PETRA_REPLAY_SEEDS must contain at least two seeds')
  }

  for (const seed of seeds) {
    if (
      !Number.isSafeInteger(seed) ||
      seed < 0 ||
      seed > 0xffffffff
    ) {
      throw new Error(
        'PETRA_REPLAY_SEEDS values must be canonical uint32 integers',
      )
    }
  }

  if (new Set(seeds).size !== seeds.length) {
    throw new Error('PETRA_REPLAY_SEEDS must not contain duplicates')
  }

  return seeds
}

function checkpointEvidenceSha256(
  checkpoint: ComposedSimulationCheckpoint,
): string {
  function canonicalize(value: unknown): unknown {
    if (ArrayBuffer.isView(value)) {
      return Array.from(value as unknown as ArrayLike<number>)
    }
    if (Array.isArray(value)) return value.map(canonicalize)
    if (value !== null && typeof value === 'object') {
      const record = value as Record<string, unknown>
      return Object.fromEntries(
        Object.keys(record)
          .sort()
          .map((key) => [key, canonicalize(record[key])]),
      )
    }
    return value
  }

  return createHash('sha256')
    .update(JSON.stringify(canonicalize(checkpoint)))
    .digest('hex')
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

function initialization(seed: number): FlagshipRunInitialization {
  return {
    seed,
    initialResourceLevel: ENGINEERING_INITIALIZATION.initialResourceLevel,
    inocula: ENGINEERING_INITIALIZATION.inocula,
  }
}

function executeTrace(
  engine: ComposedSimulationEngine,
): ComposedSimulationSnapshot[] {
  const snapshots: ComposedSimulationSnapshot[] = [engine.snapshot()]
  for (const command of COMMAND_TRACE) {
    snapshots.push(engine.execute(command))
  }
  return snapshots
}

function runSeed(seed: number): {
  readonly result: SeedReplayResult
  readonly midpointCheckpoint: ComposedSimulationCheckpoint
} {
  const plan = buildFlagshipComposedRunPlan(initialization(seed))

  const direct = new ComposedSimulationEngine(plan.identity, plan.config)
  const directSnapshots = executeTrace(direct)

  const replay = new ComposedSimulationEngine(plan.identity, plan.config)
  const replaySnapshots = executeTrace(replay)

  assert.deepStrictEqual(
    replaySnapshots,
    directSnapshots,
    'same seed + same ordered commands must reproduce every snapshot/event/trace hash from genesis',
  )

  const midpointSnapshot = directSnapshots[2]
  if (midpointSnapshot === undefined) {
    throw new Error('seed replay matrix failed to capture midpoint snapshot')
  }
  const midpointCheckpoint = structuredClone(midpointSnapshot.checkpoint)

  const restored = new ComposedSimulationEngine(plan.identity, plan.config)
  const restoreSnapshot = restored.execute({
    id: 'matrix-restore-midpoint',
    type: 'restore',
    checkpoint: midpointCheckpoint,
  })
  assert.equal(restoreSnapshot.events.length, 1)
  assert.equal(restoreSnapshot.events[0]?.sequence, 0)
  assert.equal(restoreSnapshot.events[0]?.type, 'restored')

  for (const command of COMMAND_TRACE.slice(2)) {
    restored.execute(command)
  }

  const directFinal = directSnapshots.at(-1)
  const replayFinal = replaySnapshots.at(-1)
  const restoreFinal = restored.snapshot()
  if (directFinal === undefined || replayFinal === undefined) {
    throw new Error('seed replay matrix produced no final snapshot')
  }

  assert.deepStrictEqual(
    replayFinal,
    directFinal,
    'genesis replay final snapshot must remain exact',
  )
  assert.deepStrictEqual(
    restoreFinal.checkpoint,
    directFinal.checkpoint,
    'midpoint restore + identical suffix must reach the exact final authoritative checkpoint',
  )

  return {
    midpointCheckpoint,
    result: {
      seed,
      scenarioId: plan.identity.scenarioId,
      scenarioVersion: plan.identity.scenarioVersion,
      parameterSetId: plan.identity.parameterSetId,
      parameterSetVersion: plan.identity.parameterSetVersion,
      configurationFingerprint:
        plan.parameterSetBinding.configurationFingerprint,
      genesisReplayExact: true,
      checkpointContinuationExact: true,
      directFinalTraceHash: directFinal.traceHash,
      replayFinalTraceHash: replayFinal.traceHash,
      restoreScopeFinalTraceHash: restoreFinal.traceHash,
      directFinalCheckpointSha256: checkpointEvidenceSha256(
        directFinal.checkpoint,
      ),
      restoreScopeEventCount: restoreFinal.events.length,
      finalTick: directFinal.checkpoint.tick,
      finalCommandCount: directFinal.checkpoint.commandCount,
      finalSimulationTimeHours:
        directFinal.checkpoint.simulationTimeHours,
    },
  }
}

function assertCrossSeedRestoreRefusal(
  sourceCheckpoint: ComposedSimulationCheckpoint,
  targetSeed: number,
): void {
  const targetPlan = buildFlagshipComposedRunPlan(initialization(targetSeed))
  const target = new ComposedSimulationEngine(
    targetPlan.identity,
    targetPlan.config,
  )
  const before = target.snapshot()

  assert.throws(
    () =>
      target.execute({
        id: 'matrix-cross-seed-restore',
        type: 'restore',
        checkpoint: sourceCheckpoint,
      }),
    /replay|identity|seed|compatible/i,
  )
  assert.deepStrictEqual(
    target.snapshot(),
    before,
    'rejected cross-seed restore must not mutate target authority or event history',
  )
}

describe.sequential('seed replay matrix local experiment', () => {
  it('records deterministic genesis replay, checkpoint continuation, and cross-seed refusal evidence', () => {
    const seeds = parseSeeds(process.env.PETRA_REPLAY_SEEDS)
    const startedAt = new Date().toISOString()
    const completed: SeedReplayResult[] = []

    try {
      let firstCheckpoint: ComposedSimulationCheckpoint | null = null

      for (const seed of seeds) {
        const run = runSeed(seed)
        completed.push(run.result)
        if (firstCheckpoint === null) {
          firstCheckpoint = run.midpointCheckpoint
        }
      }

      if (firstCheckpoint === null) {
        throw new Error('seed replay matrix produced no source checkpoint')
      }
      assertCrossSeedRestoreRefusal(firstCheckpoint, seeds[1]!)

      const compactResult = {
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'passed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        authority: 'composed',
        execution_path:
          'direct ComposedSimulationEngine via provenance-bound flagship composition',
        profile: {
          seeds,
          ordered_command_trace: COMMAND_TRACE,
          midpoint_after_command_index: 1,
        },
        engineering_run_state: {
          classification: 'engineering experiment initialization',
          initial_resource_level:
            ENGINEERING_INITIALIZATION.initialResourceLevel,
          inocula: ENGINEERING_INITIALIZATION.inocula,
          note:
            'Run-state values mirror the existing flagship composition/soak fixtures. They are not physical substrate, CFU, or measured biological constants.',
        },
        acceptance: {
          all_genesis_replays_exact: completed.every(
            (item) => item.genesisReplayExact,
          ),
          all_checkpoint_continuations_exact: completed.every(
            (item) => item.checkpointContinuationExact,
          ),
          cross_seed_restore_refused_without_mutation: true,
        },
        seeds: completed,
        limitations: [
          'This matrix exercises direct composed-engine authority, not browser Worker transport or renderer behavior.',
          'The current composed flagship path has no authoritative intervention command in this experiment; intervention replay remains gated on #37/#158.',
          'Checkpoint restore deliberately starts a new event-history scope, so checkpoint continuation equality is asserted on authoritative checkpoint state rather than requiring the restore trace hash to equal genesis history.',
          'Different seeds are used to test run/replay identity boundaries; this experiment does not claim seed-dependent biological divergence in mechanisms that are currently deterministic.',
        ],
      }

      writeCompactResult(compactResult)

      expect(completed).toHaveLength(seeds.length)
      expect(
        completed.every(
          (item) =>
            item.genesisReplayExact &&
            item.checkpointContinuationExact &&
            item.directFinalTraceHash === item.replayFinalTraceHash,
        ),
      ).toBe(true)
    } catch (error) {
      writeCompactResult({
        schema_version: 1,
        experiment_id: EXPERIMENT_ID,
        status: 'failed',
        started_at_utc: startedAt,
        completed_at_utc: new Date().toISOString(),
        local_run_id: process.env.PETRA_LOCAL_RUN_ID ?? null,
        profile: {
          seeds,
          ordered_command_trace: COMMAND_TRACE,
        },
        completed_seed_results: completed,
        failure: {
          name: error instanceof Error ? error.name : 'UnknownError',
          message: error instanceof Error ? error.message : String(error),
        },
      })
      throw error
    }
  })
})
