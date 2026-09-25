import { describe, expect, it } from 'vitest'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'
import {
  AUTHORITATIVE_HISTORY_SCHEMA_VERSION,
  createAuthoritativeHistoryIndex,
  type AuthoritativeHistoryKeyframe,
} from '../../src/app/historicalState'

const graph: CuratedMutationGraph = {
  scenarioId: 'history-fixture',
  scenarioVersion: '1',
  genotypes: [{ id: 'WT', relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
}

const config: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [5],
  ciprofloxacinConcentrationMgPerL: [0],
  initialLineageBiomass: [[1]],
  growth: {
    maxDivisionRate: 0.4,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [{ id: 'founder', genotypeId: 'WT', deathHazardPerHour: 0 }],
  evolutionGraph: graph,
  evolutionScenario: { scenarioId: 'history-fixture', scenarioVersion: '1' },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  populationAuthority: null,
  hoursPerTick: 0.1,
}

const binding = createFixtureComposedParameterSetBinding(
  'fixture:history',
  '1',
  config,
)

const identity = createRunIdentity({
  scenarioId: 'history-fixture',
  scenarioVersion: '1',
  parameterSetId: binding.parameterSetId,
  parameterSetVersion: binding.parameterSetVersion,
  parameterSetBinding: binding,
  seed: 42,
})

function history(): AuthoritativeHistoryKeyframe[] {
  const engine = new ComposedSimulationEngine(identity, config)
  const first = engine.snapshot()
  engine.execute({ id: 'advance-1', type: 'advance', ticks: 2 })
  const second = engine.snapshot()
  engine.execute({ id: 'advance-2', type: 'advance', ticks: 3 })
  const third = engine.snapshot()

  return [first, second, third].map((snapshot) => ({
    schemaVersion: AUTHORITATIVE_HISTORY_SCHEMA_VERSION,
    runBranchIdentity: 'run:history-fixture/main',
    snapshot,
  }))
}

describe('authoritative historical-state index', () => {
  it('resolves exact recorded command positions as authoritative state', () => {
    const keyframes = history()
    const index = createAuthoritativeHistoryIndex(keyframes)
    const result = index.resolve(1)

    expect(result.kind).toBe('authoritative')
    if (result.kind !== 'authoritative') return
    expect(result.keyframe.snapshot.checkpoint.commandCount).toBe(1)
    expect(result.keyframe.snapshot.checkpoint.simulationTimeHours).toBeCloseTo(0.2)
    expect(result.keyframe.runBranchIdentity).toBe('run:history-fixture/main')
  })

  it('labels positions between checkpoints as presentation-only bounds', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    const first = engine.snapshot()
    engine.execute({ id: 'advance-a', type: 'advance', ticks: 1 })
    const second = engine.snapshot()
    engine.execute({ id: 'advance-b', type: 'advance', ticks: 1 })
    engine.execute({ id: 'advance-c', type: 'advance', ticks: 1 })
    const fourth = engine.snapshot()

    const index = createAuthoritativeHistoryIndex(
      [first, second, fourth].map((snapshot) => ({
        schemaVersion: AUTHORITATIVE_HISTORY_SCHEMA_VERSION,
        runBranchIdentity: 'branch',
        snapshot,
      })),
    )
    const result = index.resolve(2)

    expect(result.kind).toBe('between-authority')
    if (result.kind !== 'between-authority') return
    expect(result.stateAuthority).toBe('presentation-only')
    expect(result.lower.snapshot.checkpoint.commandCount).toBe(1)
    expect(result.upper.snapshot.checkpoint.commandCount).toBe(3)
    expect(result.progress).toBe(0.5)
  })

  it('does not expose mutable live history through caller-owned snapshots', () => {
    const keyframes = history()
    const index = createAuthoritativeHistoryIndex(keyframes)
    keyframes[0]!.snapshot.checkpoint.composedState.resource[0] = 999

    const resolved = index.resolve(0)
    expect(resolved.kind).toBe('authoritative')
    if (resolved.kind !== 'authoritative') return
    expect(resolved.keyframe.snapshot.checkpoint.composedState.resource[0]).toBe(5)
  })

  it('refuses histories that mix branches or run identity', () => {
    const keyframes = history()
    const mixedBranch = structuredClone(keyframes)
    mixedBranch[1]!.runBranchIdentity = 'other-branch'
    expect(() => createAuthoritativeHistoryIndex(mixedBranch)).toThrow(/mix run branches/)

    const mixedRun = structuredClone(keyframes)
    mixedRun[1]!.snapshot.checkpoint.identity.seed = 43
    expect(() => createAuthoritativeHistoryIndex(mixedRun)).toThrow(/mix run identities/)
  })
})
