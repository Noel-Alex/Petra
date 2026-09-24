import { describe, expect, it } from 'vitest'
import {
  ComposedSimulationEngine,
} from '../../src/sim/composedEngine'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { createRunIdentity } from '../../src/sim/protocol'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'composed-worker-fixture',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'VAR', relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
}

const identity = createRunIdentity({
  scenarioId: 'composed-worker-fixture',
  scenarioVersion: '1',
  parameterSetId: 'explicit-test-config',
  parameterSetVersion: '1',
  seed: 0x5eed1234,
})

const config: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [8, 8],
  initialLineageBiomass: [[1, 0], [2, 0]],
  growth: {
    maxDivisionRate: 0.8,
    halfSaturation: 2,
    biomassYield: 0.5,
    localCapacity: 20,
    spreadRate: 0,
  },
  evolutionGraph,
  evolutionScenario: {
    scenarioId: 'composed-worker-fixture',
    scenarioVersion: '1',
  },
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'variant', genotypeId: 'VAR', deathHazardPerHour: 0.1 },
  ],
  hoursPerTick: 0.01,
}

describe('ComposedSimulationEngine', () => {
  it('exposes genotype-aware composed state and config-owned time', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    const initial = engine.snapshot().checkpoint

    expect(initial.authority).toBe('composed')
    expect(initial.metrics.totalBiomass).toBe(3)
    expect(initial.metrics.totalResource).toBe(16)
    expect(initial.composedState.lineageIds).toEqual([
      'ancestor',
      'variant',
    ])
    expect(initial.composedState.genotypeIds).toEqual(['WT', 'VAR'])
    expect('syntheticPopulation' in initial).toBe(false)

    const advanced = engine.execute({
      id: 'advance-25',
      type: 'advance',
      ticks: 25,
    }).checkpoint
    expect(advanced.tick).toBe(25)
    expect(advanced.simulationTimeHours).toBeCloseTo(0.25)
    expect(advanced.metrics.totalBiomass).toBeGreaterThan(3)
    expect(advanced.metrics.totalResource).toBeLessThan(16)
  })

  it('replays deterministically for identical identity/config/commands', () => {
    const first = new ComposedSimulationEngine(identity, config)
    const second = new ComposedSimulationEngine(identity, config)
    const commands = [
      { id: 'a', type: 'advance' as const, ticks: 12 },
      { id: 'b', type: 'advance' as const, ticks: 7 },
    ]
    for (const command of commands) {
      first.execute(command)
      second.execute(command)
    }

    expect(first.snapshot()).toEqual(second.snapshot())
  })

  it('restores exact composed state including genotype channel identity', () => {
    const original = new ComposedSimulationEngine(identity, config)
    original.execute({ id: 'warmup', type: 'advance', ticks: 10 })
    const checkpoint = original.snapshot().checkpoint
    original.execute({ id: 'future', type: 'advance', ticks: 5 })
    const expected = original.snapshot().checkpoint

    const restored = new ComposedSimulationEngine(identity, config)
    restored.execute({ id: 'restore', type: 'restore', checkpoint })
    restored.execute({ id: 'future', type: 'advance', ticks: 5 })

    expect(restored.snapshot().checkpoint).toEqual(expected)
  })

  it('deep-copies transport state and metrics', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    const exported = engine.snapshot()

    exported.checkpoint.composedState.resource[0] = 999
    exported.checkpoint.composedState.genotypeIds[0] = 'CORRUPT'
    ;(
      exported.checkpoint.metrics.lineageBiomass as Record<string, number>
    ).ancestor = 999

    const fresh = engine.snapshot().checkpoint
    expect(fresh.composedState.resource[0]).toBe(8)
    expect(fresh.composedState.genotypeIds[0]).toBe('WT')
    expect(fresh.metrics.lineageBiomass.ancestor).toBe(1)
  })

  it('rejects config/genotype/metric checkpoint corruption', () => {
    const source = new ComposedSimulationEngine(identity, config)
    source.execute({ id: 'advance', type: 'advance', ticks: 2 })
    const checkpoint = source.snapshot().checkpoint

    const changedConfig: ComposedSimulationConfig = {
      ...config,
      growth: { ...config.growth, maxDivisionRate: 0.81 },
    }
    expect(() =>
      new ComposedSimulationEngine(identity, changedConfig).execute({
        id: 'restore-config',
        type: 'restore',
        checkpoint,
      }),
    ).toThrow(/fingerprint mismatch/)

    const genotypeCorrupt = structuredClone(checkpoint)
    genotypeCorrupt.composedState.genotypeIds[0] = 'VAR'
    expect(() =>
      new ComposedSimulationEngine(identity, config).execute({
        id: 'restore-genotype',
        type: 'restore',
        checkpoint: genotypeCorrupt,
      }),
    ).toThrow(/genotype order/)

    const metricCorrupt = structuredClone(checkpoint)
    ;(
      metricCorrupt.metrics as { totalBiomass: number }
    ).totalBiomass += 1
    expect(() =>
      new ComposedSimulationEngine(identity, config).execute({
        id: 'restore-metric',
        type: 'restore',
        checkpoint: metricCorrupt,
      }),
    ).toThrow(/metrics do not match/)
  })

  it('requires run/scenario identity and refuses synthetic fixture commands', () => {
    expect(
      () =>
        new ComposedSimulationEngine(
          { ...identity, scenarioId: 'other' },
          config,
        ),
    ).toThrow(/run identity scenario/)

    const engine = new ComposedSimulationEngine(identity, config)
    expect(() =>
      engine.execute({
        id: 'pulse',
        type: 'synthetic-pulse',
        magnitude: 10,
      }),
    ).toThrow(/not available in composed authority/)
  })
})
