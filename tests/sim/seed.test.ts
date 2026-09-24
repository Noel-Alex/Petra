import { describe, expect, it } from 'vitest'
import {
  MAX_SIMULATION_SEED,
  assertSimulationSeed,
  createRunIdentity,
} from '../../src/sim/protocol'
import { SimulationRng } from '../../src/sim/rng'

function identityWithSeed(seed: number) {
  return createRunIdentity({
    scenarioId: 'seed-fixture',
    scenarioVersion: '1',
    parameterSetId: 'seed-fixture',
    parameterSetVersion: '1',
    seed,
  })
}

describe('simulation seed identity', () => {
  it('accepts the complete uint32 endpoint domain', () => {
    expect(assertSimulationSeed(0)).toBe(0)
    expect(assertSimulationSeed(MAX_SIMULATION_SEED)).toBe(MAX_SIMULATION_SEED)
    expect(identityWithSeed(0).seed).toBe(0)
    expect(identityWithSeed(MAX_SIMULATION_SEED).seed).toBe(MAX_SIMULATION_SEED)
  })

  it.each([
    -1,
    0x1_0000_0000,
    0x1_0000_0001,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects out-of-domain seed %s before it can become run identity', (seed) => {
    expect(() => identityWithSeed(seed)).toThrow(/unsigned 32-bit integer/)
  })

  it('rejects wraparound aliases at numeric RNG construction', () => {
    expect(() => new SimulationRng(0x1_0000_0001)).toThrow(
      /unsigned 32-bit integer/,
    )
    expect(() => new SimulationRng(-1)).toThrow(/unsigned 32-bit integer/)
  })

  it('replays identical valid seed streams and distinguishes adjacent seeds', () => {
    const prefix = (seed: number) => {
      const rng = new SimulationRng(seed)
      return Array.from({ length: 12 }, () => rng.nextUint32())
    }

    expect(prefix(1)).toEqual(prefix(1))
    expect(prefix(1)).not.toEqual(prefix(2))
  })

  it('preserves valid uint32 seed zero as an ordinary deterministic stream', () => {
    const first = new SimulationRng(0)
    const second = new SimulationRng(0)

    expect(Array.from({ length: 8 }, () => first.nextUint32())).toEqual(
      Array.from({ length: 8 }, () => second.nextUint32()),
    )
  })
})
