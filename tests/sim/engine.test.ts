import { describe, expect, it } from 'vitest'
import { SimulationEngine } from '../../src/sim/engine'
import { createRunIdentity, type SyntheticSimulationCheckpoint } from '../../src/sim/protocol'
import { SimulationRng, type RngState } from '../../src/sim/rng'

const identity = createRunIdentity({
  scenarioId: 'synthetic-core-fixture',
  scenarioVersion: '1',
  parameterSetId: 'none',
  parameterSetVersion: '1',
  seed: 0x5eed1234,
})

describe('SimulationRng', () => {
  it('round-trips exact uint32 boundary state through constructor and restore', () => {
    const state = [0, 1, 0x8000_0000, 0xffff_ffff] as const
    const restored = new SimulationRng(7)

    expect(new SimulationRng(state).snapshot()).toEqual(state)
    restored.restore(state)
    expect(restored.snapshot()).toEqual(state)
  })

  it('rejects lossy or non-finite serialized state words before replay', () => {
    const invalidWords = [0.5, -1, 0x1_0000_0000, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]

    for (const invalidWord of invalidWords) {
      const state = [1, 2, 3, invalidWord] as unknown as readonly [number, number, number, number]
      expect(() => new SimulationRng(state)).toThrow(/four uint32 values/)

      const rng = new SimulationRng(42)
      const before = rng.snapshot()
      expect(() => rng.restore(state)).toThrow(/four uint32 values/)
      expect(rng.snapshot()).toEqual(before)
    }

    expect(() => new SimulationRng([0, 0, 0, 0])).toThrow(/cannot be all zero/)
  })

  it('rejects sparse and non-array checkpoint containers without mutating restore state', () => {
    const sparse = [1, 2, 3, 4] as unknown[]
    delete sparse[2]
    const malformedStates = [
      sparse,
      { 0: 1, 1: 2, 2: 3, 3: 4, length: 4 },
      null,
    ]

    for (const malformedState of malformedStates) {
      const state = malformedState as unknown as RngState
      expect(() => new SimulationRng(state)).toThrow(/four uint32 values/)

      const rng = new SimulationRng(42)
      const before = rng.snapshot()
      expect(() => rng.restore(state)).toThrow(/four uint32 values/)
      expect(rng.snapshot()).toEqual(before)
    }
  })

  it('replays exactly from serialized state', () => {
    const rng = new SimulationRng(42)
    const prefix = Array.from({ length: 8 }, () => rng.nextUint32())
    const state = rng.snapshot()
    const suffix = Array.from({ length: 8 }, () => rng.nextUint32())
    const restored = new SimulationRng(state)

    expect(prefix).not.toEqual(suffix)
    expect(Array.from({ length: 8 }, () => restored.nextUint32())).toEqual(suffix)
  })
})

describe('SimulationEngine replay substrate', () => {
  it('produces identical trace hashes for identical seed and ordered commands', () => {
    const commands = [
      { id: 'advance-1', type: 'advance' as const, ticks: 120 },
      { id: 'pulse-1', type: 'synthetic-pulse' as const, magnitude: 25 },
      { id: 'advance-2', type: 'advance' as const, ticks: 60 },
    ]
    const first = new SimulationEngine(identity)
    const second = new SimulationEngine(identity)

    for (const command of commands) {
      first.execute(command)
      second.execute(command)
    }

    expect(first.snapshot()).toEqual(second.snapshot())
    expect(first.snapshot().traceHash).toBe(second.snapshot().traceHash)
  })

  it('stamps exact authoritative time on every emitted event, including restore', () => {
    const engine = new SimulationEngine(identity)

    expect(engine.snapshot().events).toEqual([
      {
        sequence: 0,
        tick: 0,
        simulationTimeHours: 0,
        type: 'initialized',
      },
    ])

    engine.execute({ id: 'advance-60', type: 'advance', ticks: 60 })
    const checkpointAtOneHour = engine.snapshot().checkpoint
    engine.execute({ id: 'pulse', type: 'synthetic-pulse', magnitude: 1 })
    engine.execute({ id: 'advance-30', type: 'advance', ticks: 30 })

    expect(engine.snapshot().events.map((event) => ({
      type: event.type,
      tick: event.tick,
      simulationTimeHours: event.simulationTimeHours,
    }))).toEqual([
      { type: 'initialized', tick: 0, simulationTimeHours: 0 },
      { type: 'advanced', tick: 60, simulationTimeHours: 1 },
      { type: 'synthetic-pulse', tick: 60, simulationTimeHours: 1 },
      { type: 'advanced', tick: 90, simulationTimeHours: 1.5 },
    ])

    const restored = engine.execute({
      id: 'restore-1h',
      type: 'restore',
      checkpoint: checkpointAtOneHour,
    })

    expect(restored.events).toEqual([
      {
        sequence: 0,
        tick: 60,
        simulationTimeHours: 1,
        type: 'restored',
        commandId: 'restore-1h',
      },
    ])
    expect(restored.checkpoint.simulationTimeHours).toBe(1)
  })

  it('restores RNG and numeric state so future evolution matches the original branch', () => {
    const original = new SimulationEngine(identity)
    original.execute({ id: 'warmup', type: 'advance', ticks: 75 })
    const checkpoint = original.snapshot().checkpoint
    original.execute({ id: 'future', type: 'advance', ticks: 50 })
    const expected = original.snapshot().checkpoint

    const restored = new SimulationEngine(identity)
    restored.execute({ id: 'restore', type: 'restore', checkpoint })
    restored.execute({ id: 'future', type: 'advance', ticks: 50 })
    const actual = restored.snapshot().checkpoint

    expect(actual.tick).toBe(expected.tick)
    expect(actual.syntheticPopulation).toBe(expected.syntheticPopulation)
    expect(actual.rngState).toEqual(expected.rngState)
  })

  it('rejects checkpoints belonging to another run identity', () => {
    const source = new SimulationEngine(identity)
    const checkpoint = source.snapshot().checkpoint
    const other = new SimulationEngine({ ...identity, seed: identity.seed + 1 })

    expect(() => other.execute({ id: 'restore', type: 'restore', checkpoint })).toThrow(/different run identity/)
  })

  it('rejects malformed checkpoint scalars without mutating live state', () => {
    const engine = new SimulationEngine(identity)
    engine.execute({ id: 'warmup', type: 'advance', ticks: 60 })
    engine.execute({ id: 'pulse', type: 'synthetic-pulse', magnitude: 12 })
    const before = engine.snapshot()

    const cases: Array<{
      name: string
      mutate: (checkpoint: SyntheticSimulationCheckpoint) => void
      error: RegExp
    }> = [
      {
        name: 'negative tick',
        mutate: (checkpoint) => {
          checkpoint.tick = -1
        },
        error: /checkpoint\.tick must be a non-negative safe integer/,
      },
      {
        name: 'fractional tick',
        mutate: (checkpoint) => {
          checkpoint.tick = 1.5
        },
        error: /checkpoint\.tick must be a non-negative safe integer/,
      },
      {
        name: 'unsafe tick',
        mutate: (checkpoint) => {
          checkpoint.tick = Number.MAX_SAFE_INTEGER + 1
        },
        error: /checkpoint\.tick must be a non-negative safe integer/,
      },
      {
        name: 'negative command count',
        mutate: (checkpoint) => {
          checkpoint.commandCount = -1
        },
        error: /checkpoint\.commandCount must be a non-negative safe integer/,
      },
      {
        name: 'fractional command count',
        mutate: (checkpoint) => {
          checkpoint.commandCount = 0.5
        },
        error: /checkpoint\.commandCount must be a non-negative safe integer/,
      },
      {
        name: 'unsafe command count',
        mutate: (checkpoint) => {
          checkpoint.commandCount = Number.MAX_SAFE_INTEGER + 1
        },
        error: /checkpoint\.commandCount must be a non-negative safe integer/,
      },
      {
        name: 'negative synthetic population',
        mutate: (checkpoint) => {
          checkpoint.syntheticPopulation = -1
        },
        error: /checkpoint\.syntheticPopulation must be finite and non-negative/,
      },
      {
        name: 'non-finite synthetic population',
        mutate: (checkpoint) => {
          checkpoint.syntheticPopulation = Number.POSITIVE_INFINITY
        },
        error: /checkpoint\.syntheticPopulation must be finite and non-negative/,
      },
      {
        name: 'negative simulation time',
        mutate: (checkpoint) => {
          checkpoint.simulationTimeHours = -1
        },
        error: /checkpoint\.simulationTimeHours must be finite, non-negative, and exactly match checkpoint\.tick/,
      },
      {
        name: 'non-finite simulation time',
        mutate: (checkpoint) => {
          checkpoint.simulationTimeHours = Number.NaN
        },
        error: /checkpoint\.simulationTimeHours must be finite, non-negative, and exactly match checkpoint\.tick/,
      },
      {
        name: 'tick/time mismatch',
        mutate: (checkpoint) => {
          checkpoint.simulationTimeHours += 0.25
        },
        error: /checkpoint\.simulationTimeHours must be finite, non-negative, and exactly match checkpoint\.tick/,
      },
    ]

    for (const testCase of cases) {
      const checkpoint = structuredClone(before.checkpoint)
      testCase.mutate(checkpoint)

      expect(
        () => engine.execute({ id: `invalid-${testCase.name}`, type: 'restore', checkpoint }),
        testCase.name,
      ).toThrow(testCase.error)
      expect(engine.snapshot(), testCase.name).toEqual(before)
    }
  })

  it('rejects tick overflow before consuming RNG or mutating replay state', () => {
    const engine = new SimulationEngine(identity)
    const checkpoint = structuredClone(engine.snapshot().checkpoint)
    checkpoint.tick = Number.MAX_SAFE_INTEGER
    checkpoint.simulationTimeHours = checkpoint.tick * (1 / 60)

    engine.execute({ id: 'restore-max-tick', type: 'restore', checkpoint })
    const before = engine.snapshot()

    expect(() =>
      engine.execute({ id: 'overflow-tick', type: 'advance', ticks: 1 }),
    ).toThrow(/advance tick.*safe integer range/)
    expect(engine.snapshot()).toEqual(before)
  })

  it('rejects counted-command overflow atomically for advance and pulse', () => {
    const engine = new SimulationEngine(identity)
    const checkpoint = structuredClone(engine.snapshot().checkpoint)
    checkpoint.commandCount = Number.MAX_SAFE_INTEGER

    engine.execute({
      id: 'restore-max-command-count',
      type: 'restore',
      checkpoint,
    })
    const before = engine.snapshot()

    expect(() =>
      engine.execute({
        id: 'overflow-count-advance',
        type: 'advance',
        ticks: 1,
      }),
    ).toThrow(/command count.*safe integer range/)
    expect(engine.snapshot()).toEqual(before)

    expect(() =>
      engine.execute({
        id: 'overflow-count-pulse',
        type: 'synthetic-pulse',
        magnitude: 1,
      }),
    ).toThrow(/command count.*safe integer range/)
    expect(engine.snapshot()).toEqual(before)
  })

  it('allows the last safe command count and keeps its checkpoint restorable', () => {
    const engine = new SimulationEngine(identity)
    const checkpoint = structuredClone(engine.snapshot().checkpoint)
    checkpoint.commandCount = Number.MAX_SAFE_INTEGER - 1

    engine.execute({
      id: 'restore-near-max-command-count',
      type: 'restore',
      checkpoint,
    })
    const accepted = engine.execute({
      id: 'last-safe-counted-command',
      type: 'synthetic-pulse',
      magnitude: 1,
    })

    expect(accepted.checkpoint.commandCount).toBe(Number.MAX_SAFE_INTEGER)
    expect(Number.isFinite(accepted.checkpoint.syntheticPopulation)).toBe(true)

    const restored = new SimulationEngine(identity)
    expect(() =>
      restored.execute({
        id: 'restore-last-safe-checkpoint',
        type: 'restore',
        checkpoint: accepted.checkpoint,
      }),
    ).not.toThrow()
    expect(restored.snapshot().checkpoint).toEqual(accepted.checkpoint)
  })

  it('rejects finite pulse inputs whose combined population would become non-finite', () => {
    const engine = new SimulationEngine(identity)

    engine.execute({
      id: 'large-finite-pulse-1',
      type: 'synthetic-pulse',
      magnitude: Number.MAX_VALUE,
    })
    const beforeOverflow = engine.snapshot()
    expect(Number.isFinite(beforeOverflow.checkpoint.syntheticPopulation)).toBe(
      true,
    )

    expect(() =>
      engine.execute({
        id: 'large-finite-pulse-2',
        type: 'synthetic-pulse',
        magnitude: Number.MAX_VALUE,
      }),
    ).toThrow(/synthetic population.*finite and non-negative/)
    expect(engine.snapshot()).toEqual(beforeOverflow)
  })

  it('validates replacement RNG before committing any restored fields or events', () => {
    const engine = new SimulationEngine(identity)
    engine.execute({ id: 'warmup', type: 'advance', ticks: 30 })
    engine.execute({ id: 'pulse', type: 'synthetic-pulse', magnitude: 7 })
    const before = engine.snapshot()
    const checkpoint = structuredClone(before.checkpoint)

    checkpoint.tick += 30
    checkpoint.simulationTimeHours = checkpoint.tick / 60
    checkpoint.syntheticPopulation += 100
    checkpoint.commandCount += 5
    checkpoint.rngState = [0, 0, 0, 0]

    expect(() => engine.execute({ id: 'invalid-rng-restore', type: 'restore', checkpoint })).toThrow(
      /cannot be all zero/,
    )
    expect(engine.snapshot()).toEqual(before)
  })

  it('remains finite, non-negative, and replay-identical through a long synthetic soak', () => {
    const first = new SimulationEngine(identity)
    const second = new SimulationEngine(identity)
    const chunks = 100
    const ticksPerChunk = 1_000

    for (let chunk = 0; chunk < chunks; chunk += 1) {
      const command = { id: `soak-${chunk}`, type: 'advance' as const, ticks: ticksPerChunk }
      first.execute(command)
      second.execute(command)

      const checkpoint = first.snapshot().checkpoint
      expect(checkpoint.tick).toBe((chunk + 1) * ticksPerChunk)
      expect(Number.isFinite(checkpoint.simulationTimeHours)).toBe(true)
      expect(Number.isFinite(checkpoint.syntheticPopulation)).toBe(true)
      expect(checkpoint.syntheticPopulation).toBeGreaterThanOrEqual(0)
      expect(checkpoint.rngState.every((value) => Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff)).toBe(true)
    }

    expect(first.snapshot()).toEqual(second.snapshot())
  })

  it('rejects non-finite synthetic pulses before they can contaminate state', () => {
    const engine = new SimulationEngine(identity)

    for (const magnitude of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        engine.execute({ id: `non-finite-${String(magnitude)}`, type: 'synthetic-pulse', magnitude }),
      ).toThrow(/must be finite/)
    }

    const checkpoint = engine.snapshot().checkpoint
    expect(checkpoint.syntheticPopulation).toBe(1_000)
    expect(Number.isFinite(checkpoint.syntheticPopulation)).toBe(true)
  })
})
