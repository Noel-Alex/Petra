export type RngState = readonly [number, number, number, number]

const UINT32_SCALE = 1 / 0x1_0000_0000

function rotl(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0
}

function splitmix32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x9e3779b9) >>> 0
    let z = state
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad)
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97)
    return (z ^ (z >>> 15)) >>> 0
  }
}

/**
 * Deterministic xoshiro128** stream used by simulation authority.
 * State is explicitly serializable so replay/checkpoints do not depend on
 * JavaScript engine internals. Rendering code must never consume this stream.
 */
export class SimulationRng {
  private state: [number, number, number, number]

  constructor(seedOrState: number | RngState) {
    if (typeof seedOrState === 'number') {
      const nextSeed = splitmix32(seedOrState)
      this.state = [nextSeed(), nextSeed(), nextSeed(), nextSeed()]
      if (this.state.every((value) => value === 0)) this.state[0] = 1
    } else {
      if (seedOrState.length !== 4 || seedOrState.every((value) => value === 0)) {
        throw new Error('RNG state must contain four uint32 values and cannot be all zero')
      }
      this.state = seedOrState.map((value) => value >>> 0) as [number, number, number, number]
    }
  }

  nextUint32(): number {
    const s = this.state
    const result = Math.imul(rotl(Math.imul(s[1]!, 5) >>> 0, 7), 9) >>> 0
    const t = (s[1]! << 9) >>> 0

    s[2] = (s[2]! ^ s[0]!) >>> 0
    s[3] = (s[3]! ^ s[1]!) >>> 0
    s[1] = (s[1]! ^ s[2]!) >>> 0
    s[0] = (s[0]! ^ s[3]!) >>> 0
    s[2] = (s[2]! ^ t) >>> 0
    s[3] = rotl(s[3]!, 11)

    return result
  }

  nextFloat(): number {
    return this.nextUint32() * UINT32_SCALE
  }

  snapshot(): RngState {
    return [...this.state] as RngState
  }

  /**
   * Replaces this stream with a previously serialized Petra RNG state.
   * Used for atomic stochastic transactions: callers may sample on a clone and
   * commit only after numerical policy accepts the complete operation.
   */
  restore(state: RngState): void {
    const restored = new SimulationRng(state)
    this.state = restored.snapshot() as [number, number, number, number]
  }
}
