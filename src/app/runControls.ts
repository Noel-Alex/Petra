import {
  MAX_SIMULATION_SEED,
  assertSimulationSeed,
} from "../sim/protocol";

export interface ParsedSeedDraft {
  readonly seed: number | null;
  readonly error: string | null;
}

export const SEED_INPUT_ERROR =
  "Seed must be a whole number from 0 to " + MAX_SIMULATION_SEED + ".";

/**
 * Parses presentation text through the same uint32 domain used by run identity
 * and the RNG. Browser input constraints are UX hints; this remains the gate.
 */
export function parseSeedDraft(value: string): ParsedSeedDraft {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return { seed: null, error: SEED_INPUT_ERROR };
  }

  const seed = Number(normalized);
  try {
    assertSimulationSeed(seed);
    return { seed, error: null };
  } catch {
    return { seed: null, error: SEED_INPUT_ERROR };
  }
}
