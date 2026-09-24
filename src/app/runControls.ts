import {
  MAX_SIMULATION_SEED,
  assertSimulationSeed,
} from "../sim/protocol";
import type { ControlDispatchResult } from "./experimentRuntime";

export interface ParsedSeedDraft {
  readonly seed: number | null;
  readonly error: string | null;
}

export const SEED_INPUT_ERROR =
  "Seed must be a whole number from 0 to " + MAX_SIMULATION_SEED + ".";

/**
 * Parse presentation text through the same uint32 domain used by run identity
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

export function dispatchFailureMessage(
  result: ControlDispatchResult | null,
): string | null {
  if (result?.accepted === true) return null;

  switch (result?.reason) {
    case "worker-busy":
      return "An authoritative simulation request is already in flight.";
    case "worker-not-ready":
      return "The authoritative simulation is not ready for that action.";
    case "disposed":
      return "The simulation runtime is no longer available.";
    default:
      return "Authoritative simulation is not connected.";
  }
}
