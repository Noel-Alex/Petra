import type { RunIdentity } from "../sim/protocol";

/**
 * Canonical app-layer identity key for one exact simulation run.
 *
 * Presentation adapters use this key only for equality/reset semantics. It does
 * not replace authoritative runtime/checkpoint identity and must include every
 * field that distinguishes replay/scenario/parameter/seed authority.
 */
export function runIdentityKey(identity: RunIdentity): string {
  return JSON.stringify([
    identity.engineVersion,
    identity.protocolVersion,
    identity.scenarioId,
    identity.scenarioVersion,
    identity.parameterSetId,
    identity.parameterSetVersion,
    identity.seed,
  ]);
}
