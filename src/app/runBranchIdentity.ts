import type { RunIdentity } from "../sim/protocol";

export const RUN_BRANCH_IDENTITY_VERSION = "petra-run-branch/1" as const;

/**
 * Runtime-owned identity for one accepted command-history generation.
 *
 * This is ordering/provenance identity, not biological state. It deliberately
 * includes the exact run binding plus an explicit generation so reset/replay/
 * reseed histories cannot collide even when their accepted command positions
 * restart at the same value.
 */
export function createRunBranchIdentity(
  identity: RunIdentity,
  generation: number,
): string {
  if (!Number.isSafeInteger(generation) || generation < 0) {
    throw new RangeError(
      "run branch generation must be a non-negative safe integer",
    );
  }

  const binding =
    identity.parameterSetBinding === undefined
      ? null
      : [
          identity.parameterSetBinding.schemaVersion,
          identity.parameterSetBinding.authority,
          identity.parameterSetBinding.parameterSetId,
          identity.parameterSetBinding.parameterSetVersion,
          identity.parameterSetBinding.configurationFingerprint,
        ];

  return (
    RUN_BRANCH_IDENTITY_VERSION +
    ":" +
    JSON.stringify([
      identity.engineVersion,
      identity.protocolVersion,
      identity.scenarioId,
      identity.scenarioVersion,
      identity.parameterSetId,
      identity.parameterSetVersion,
      binding,
      identity.seed,
      generation,
    ])
  );
}
