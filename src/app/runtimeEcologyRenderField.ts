import {
  projectEcologyNetGrowthField,
  projectEcologyRateFields,
} from "../render/ecologyFluxField";
import type { RenderField } from "../render/model";
import {
  assertComposedEcologyObservationEnvelopeMatchesPosition,
} from "../sim/composedEcologyObservation";
import { createComposedStepObservationPosition } from "../sim/composedObservationTransaction";
import type { EcologyFluxObservation } from "../sim/ecology/fluxObservation";
import type { SimulationSnapshot } from "../sim/protocol";
import type { RuntimeEcologyObservation } from "./experimentRuntime";

function admitRuntimeEcologyObservation(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
  runtimeObservation: RuntimeEcologyObservation | null,
): EcologyFluxObservation | null {
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
  return runtimeObservation.envelope.observation;
}

/**
 * Binds one runtime-owned history generation and exact accepted composed
 * position to the complete step-local ecology renderer bundle. Absence is
 * meaningful: non-ecology transactions publish no rate fields.
 */
export function projectRuntimeEcologyRateFields(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
  runtimeObservation: RuntimeEcologyObservation | null,
): readonly RenderField[] {
  const observation = admitRuntimeEcologyObservation(
    snapshot,
    runBranchIdentity,
    runtimeObservation,
  );
  return observation === null ? Object.freeze([]) : projectEcologyRateFields(observation);
}

/**
 * Compatibility projection for consumers that need only the established
 * signed net-growth field. It uses the same exact transaction admission.
 */
export function projectRuntimeEcologyNetGrowthField(
  snapshot: SimulationSnapshot | null,
  runBranchIdentity: string,
  runtimeObservation: RuntimeEcologyObservation | null,
): RenderField | null {
  const observation = admitRuntimeEcologyObservation(
    snapshot,
    runBranchIdentity,
    runtimeObservation,
  );
  return observation === null ? null : projectEcologyNetGrowthField(observation);
}
