export const MAX_SIMULATION_SEED = 0xffff_ffff

export function assertSimulationSeed(seed: number): number {
  if (
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > MAX_SIMULATION_SEED
  ) {
    throw new RangeError(
      `simulation seed must be an unsigned 32-bit integer in [0, ${MAX_SIMULATION_SEED}]`,
    )
  }

  return seed
}
