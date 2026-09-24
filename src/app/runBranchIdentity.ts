import type { RunIdentity } from "../sim/protocol";

export function createRunBranchIdentity(identity: RunIdentity, generation: number): string {
  if (!Number.isSafeInteger(generation) || generation < 0) throw new RangeError("invalid history generation");
  return JSON.stringify(["petra-run-branch-v1", identity.engineVersion, identity.protocolVersion, identity.scenarioId, identity.scenarioVersion, identity.parameterSetId, identity.parameterSetVersion, identity.seed, generation]);
}
