import type { RunIdentity } from "../sim/protocol";

/**
 * Canonical app-layer key for Petra's authoritative run identity.
 *
 * Keep the field order explicit so presentation adapters compare the exact same
 * engine/protocol/scenario/parameter/seed tuple without depending on object
 * insertion order.
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
