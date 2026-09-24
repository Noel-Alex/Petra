import { describe, expect, it } from 'vitest'
import {
  COUNTERFACTUAL_FORK_SCHEMA_VERSION,
  CounterfactualForkController,
  replayCounterfactualFork,
  validateCounterfactualForkReplayBundle,
} from '../../src/sim/counterfactual'
import { SimulationEngine } from '../../src/sim/engine'
import { createRunIdentity } from '../../src/sim/protocol'
import { simulationSnapshotTraceHash } from '../../src/sim/snapshotTrace'

const identity = createRunIdentity({
  scenarioId: 'synthetic-counterfactual-fixture',
  scenarioVersion: '1',
  parameterSetId: 'none',
  parameterSetVersion: '1',
  seed: 0xc0ffee,
})

function createParentSnapshot() {
  const parent = new SimulationEngine(identity)
  parent.execute({ id: 'warmup', type: 'advance', ticks: 45 })
  return parent.snapshot()
}

function createFork() {
  return new CounterfactualForkController({
    sourceRunId: 'run-parent-1',
    parentSnapshot: createParentSnapshot(),
    left: { branchId: 'control', label: 'Control' },
    right: { branchId: 'treatment', label: 'Treatment' },
  })
}

describe('counterfactual fork authority', () => {
  it('keeps branches identical until their ordered command streams diverge', () => {
    const fork = createFork()

    expect(fork.snapshot().branches.left.snapshot).toEqual(
      fork.snapshot().branches.right.snapshot,
    )

    const shared = { id: 'advance-shared', type: 'advance' as const, ticks: 20 }
    fork.execute('left', shared)
    fork.execute('right', shared)

    expect(fork.snapshot().branches.left.snapshot).toEqual(
      fork.snapshot().branches.right.snapshot,
    )

    fork.execute('right', {
      id: 'treatment-pulse',
      type: 'synthetic-pulse',
      magnitude: 25,
    })

    const diverged = fork.snapshot()
    expect(diverged.branches.left.snapshot.checkpoint.syntheticPopulation).not.toBe(
      diverged.branches.right.snapshot.checkpoint.syntheticPopulation,
    )
    expect(diverged.branches.left.commands.map((command) => command.id)).toEqual([
      'advance-shared',
    ])
    expect(diverged.branches.right.commands.map((command) => command.id)).toEqual([
      'advance-shared',
      'treatment-pulse',
    ])
  })

  it('replays the exact fork checkpoint and post-fork command payloads deterministically', () => {
    const fork = createFork()
    fork.execute('left', { id: 'left-advance', type: 'advance', ticks: 30 })
    fork.execute('right', { id: 'right-advance', type: 'advance', ticks: 30 })
    fork.execute('right', {
      id: 'right-pulse',
      type: 'synthetic-pulse',
      magnitude: -10,
    })

    const bundle = fork.exportReplayBundle()
    validateCounterfactualForkReplayBundle(bundle)

    expect(bundle.schemaVersion).toBe(COUNTERFACTUAL_FORK_SCHEMA_VERSION)
    expect(bundle.origin.events.length).toBeGreaterThan(0)
    expect(replayCounterfactualFork(bundle)).toEqual(fork.snapshot())
    expect(replayCounterfactualFork(bundle)).toEqual(replayCounterfactualFork(bundle))
  })

  it('copy-isolates fork origin, replay payloads, and returned snapshots', () => {
    const parentSnapshot = createParentSnapshot()
    const fork = new CounterfactualForkController({
      sourceRunId: 'run-parent-1',
      parentSnapshot,
      left: { branchId: 'left', label: 'Left' },
      right: { branchId: 'right', label: 'Right' },
    })
    fork.execute('left', { id: 'left-advance', type: 'advance', ticks: 5 })

    parentSnapshot.checkpoint.syntheticPopulation = 999_999
    const bundle = fork.exportReplayBundle()
    bundle.origin.checkpoint.syntheticPopulation = 888_888
    ;(bundle.origin.events[0] as { type: string }).type = 'mutated-event'
    ;(bundle.branches.left.commands[0] as { id: string }).id = 'mutated'
    const returned = fork.snapshot()
    returned.origin.checkpoint.syntheticPopulation = 777_777
    ;(returned.origin.events[0] as { type: string }).type = 'returned-mutation'

    const fresh = fork.snapshot()
    expect(fresh.origin.checkpoint.syntheticPopulation).not.toBe(999_999)
    expect(fresh.origin.checkpoint.syntheticPopulation).not.toBe(888_888)
    expect(fresh.origin.checkpoint.syntheticPopulation).not.toBe(777_777)
    expect(fresh.origin.events[0]?.type).not.toBe('mutated-event')
    expect(fresh.origin.events[0]?.type).not.toBe('returned-mutation')
    expect(fresh.branches.left.commands[0]?.id).toBe('left-advance')
  })

  it('rejects ambiguous branch identity, duplicate command IDs, and runtime restore/snapshot commands', () => {
    const parentSnapshot = createParentSnapshot()
    expect(
      () =>
        new CounterfactualForkController({
          sourceRunId: 'run-parent-1',
          parentSnapshot,
          left: { branchId: 'same', label: 'Left' },
          right: { branchId: 'same', label: 'Right' },
        }),
    ).toThrow(/branch IDs must be distinct/)

    const fork = createFork()
    fork.execute('left', { id: 'one', type: 'advance', ticks: 1 })
    expect(() => fork.execute('left', { id: 'one', type: 'advance', ticks: 1 })).toThrow(
      /duplicate counterfactual command id/,
    )

    expect(() =>
      fork.execute(
        'left',
        {
          id: 'restore-not-allowed',
          type: 'restore',
          checkpoint: parentSnapshot.checkpoint,
        } as never,
      ),
    ).toThrow(/cannot restore or snapshot/)
    expect(() =>
      fork.execute('left', { id: 'snapshot-not-allowed', type: 'snapshot' } as never),
    ).toThrow(/cannot restore or snapshot/)
  })

  it('rejects a trace hash swapped from another otherwise valid parent snapshot', () => {
    const first = createParentSnapshot()
    const secondEngine = new SimulationEngine(identity)
    secondEngine.execute({ id: 'other-warmup', type: 'advance', ticks: 46 })
    const second = secondEngine.snapshot()

    expect(first.traceHash).not.toBe(second.traceHash)

    const forged = structuredClone(first)
    forged.traceHash = second.traceHash

    expect(
      () =>
        new CounterfactualForkController({
          sourceRunId: 'run-parent-1',
          parentSnapshot: forged,
          left: { branchId: 'left', label: 'Left' },
          right: { branchId: 'right', label: 'Right' },
        }),
    ).toThrow(/trace provenance mismatch/)
  })

  it('keeps replay-bundle ancestry independently verifiable from bundled parent evidence', () => {
    const fork = createFork()
    const bundle = fork.exportReplayBundle()
    validateCounterfactualForkReplayBundle(bundle)

    const tamperedEvents = structuredClone(bundle)
    ;(tamperedEvents.origin.events as unknown[]).pop()
    expect(() => validateCounterfactualForkReplayBundle(tamperedEvents)).toThrow(
      /trace provenance mismatch/,
    )
    expect(() => replayCounterfactualFork(tamperedEvents)).toThrow(
      /trace provenance mismatch/,
    )

    const otherEngine = new SimulationEngine(identity)
    otherEngine.execute({ id: 'other-warmup', type: 'advance', ticks: 46 })
    const swappedTrace = structuredClone(bundle)
    swappedTrace.origin.checkpointTraceHash = otherEngine.snapshot().traceHash
    expect(() => validateCounterfactualForkReplayBundle(swappedTrace)).toThrow(
      /trace provenance mismatch/,
    )
  })

  it('distinguishes valid-trace malformed checkpoints from provenance mismatch', () => {
    const parentSnapshot = createParentSnapshot()
    parentSnapshot.checkpoint.simulationTimeHours += 1
    parentSnapshot.traceHash = simulationSnapshotTraceHash(parentSnapshot)

    expect(
      () =>
        new CounterfactualForkController({
          sourceRunId: 'run-parent-1',
          parentSnapshot,
          left: { branchId: 'left', label: 'Left' },
          right: { branchId: 'right', label: 'Right' },
        }),
    ).toThrow(/checkpoint\.simulationTimeHours/)
  })
})
