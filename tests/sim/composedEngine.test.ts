import { describe, expect, it } from 'vitest'
import {
  ComposedSimulationEngine,
} from '../../src/sim/composedEngine'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import { createRunIdentity } from '../../src/sim/protocol'

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
  lineages: [
    { id: 'ancestor', relativeFitness: 1, deathHazardPerHour: 0 },
    { id: 'variant', relativeFitness: 0.9, deathHazardPerHour: 0.1 },
  ],
  hoursPerTick: 0.01,
}

function expectComposed(
  snapshot: ReturnType<ComposedSimulationEngine['snapshot']>,
) {
  expect(snapshot.checkpoint.authority).toBe('composed')
  return snapshot.checkpoint
}

describe('ComposedSimulationEngine', () => {
  it('exposes real composed state and authoritative config-owned time', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    const initial = expectComposed(engine.snapshot())

    expect(initial.tick).toBe(0)
    expect(initial.simulationTimeHours).toBe(0)
    expect(initial.metrics.totalBiomass).toBe(3)
    expect(initial.metrics.totalResource).toBe(16)
    expect(initial.composedState.lineageIds).toEqual(['ancestor', 'variant'])
    expect('syntheticPopulation' in initial).toBe(false)

    const advanced = expectComposed(
      engine.execute({ id: 'advance-25', type: 'advance', ticks: 25 }),
    )
    expect(advanced.tick).toBe(25)
    expect(advanced.simulationTimeHours).toBeCloseTo(0.25)
    expect(advanced.metrics.totalBiomass).toBeGreaterThan(3)
    expect(advanced.metrics.totalResource).toBeLessThan(16)
  })

  it('is deterministic for the same identity, config, and ordered commands', () => {
    const first = new ComposedSimulationEngine(identity, config)
    const second = new ComposedSimulationEngine(identity, config)
    const commands = [
      { id: 'advance-1', type: 'advance' as const, ticks: 12 },
      { id: 'advance-2', type: 'advance' as const, ticks: 7 },
    ]

    for (const command of commands) {
      first.execute(command)
      second.execute(command)
    }

    expect(first.snapshot()).toEqual(second.snapshot())
    expect(first.snapshot().traceHash).toBe(second.snapshot().traceHash)
  })

  it('restores an exact checkpoint and reproduces the same future state', () => {
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

  it('deep-copies snapshot state so transport consumers cannot mutate authority', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    const exported = engine.snapshot()

    exported.checkpoint.composedState.resource[0] = 999
    exported.checkpoint.composedState.lineageBiomass[0]![0] = 999
    ;(exported.checkpoint.metrics.lineageBiomass as Record<string, number>).ancestor = 999

    const fresh = engine.snapshot().checkpoint
    expect(fresh.composedState.resource[0]).toBe(8)
    expect(fresh.composedState.lineageBiomass[0]![0]).toBe(1)
    expect(fresh.metrics.lineageBiomass.ancestor).toBe(1)
  })

  it('rejects cross-configuration or corrupted composed checkpoints', () => {
    const source = new ComposedSimulationEngine(identity, config)
    source.execute({ id: 'advance', type: 'advance', ticks: 2 })
    const checkpoint = source.snapshot().checkpoint

    const changedConfig: ComposedSimulationConfig = {
      ...config,
      growth: { ...config.growth, maxDivisionRate: 0.81 },
    }
    const changed = new ComposedSimulationEngine(identity, changedConfig)
    expect(() =>
      changed.execute({ id: 'restore-config', type: 'restore', checkpoint }),
    ).toThrow(/fingerprint mismatch/)

    const corrupted = structuredClone(checkpoint)
    corrupted.metrics = {
      ...corrupted.metrics,
      totalBiomass: corrupted.metrics.totalBiomass + 1,
    }
    const clean = new ComposedSimulationEngine(identity, config)
    expect(() =>
      clean.execute({ id: 'restore-corrupt', type: 'restore', checkpoint: corrupted }),
    ).toThrow(/metrics do not match/)
  })

  it('refuses synthetic fixture interventions in authoritative composed mode', () => {
    const engine = new ComposedSimulationEngine(identity, config)

    expect(() =>
      engine.execute({ id: 'pulse', type: 'synthetic-pulse', magnitude: 10 }),
    ).toThrow(/not available in composed authority/)
  })
})
