import { projectEcologyNetGrowthField } from "../render/ecologyFluxField";
import type { RenderField } from "../render/model";
import {
  assertComposedEcologyObservationEnvelopeMatchesPosition,
} from "../sim/composedEcologyObservation";
import { createComposedStepObservationPosition } from "../sim/composedObservationTransaction";
import type { SimulationSnapshot } from "../sim/protocol";
import type { RuntimeEcologyObservation } from "./experimentRuntime";

/**
 * Binds the runtime-owned history generation and exact accepted composed
 * snapshot to one step-local ecology observation before exposing render data.
 *
 * Absence is meaningful: initialization, restore, intervention, snapshot-only
 * commands, and other non-ecology transactions must not manufacture a rate
 * field. The returned field is presentation-only and cannot feed biology.
 */
export function projectRuntimeEcologyNetGrowthField(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
  runtimeObservation: RuntimeEcologyObservation | null,
): RenderField | null {
  if (runtimeObservation === null) return null;
  if (snapshot?.checkpoint.authority !== "composed") {
    throw new Error(
      "runtime ecology render projection requires a composed authoritative snapshot",
    );
  }
  if (
    typeof runBranchIdentity !== "string" ||
    runBranchIdentity.length === 0 ||
    runBranchIdentity !== runBranchIdentity.trim()
  ) {
    throw new Error(
      "runtime ecology render projection requires a canonical runtime branch identity",
    );
  }
  if (runtimeObservation.runBranchIdentity !== runBranchIdentity) {
    throw new Error(
      "runtime ecology observation belongs to a different runtime history generation",
    );
  }

  assertComposedEcologyObservationEnvelopeMatchesPosition(
    createComposedStepObservationPosition(snapshot.checkpoint),
    runtimeObservation.envelope,
  );

  return projectEcologyNetGrowthField(runtimeObservation.envelope.observation);
}
