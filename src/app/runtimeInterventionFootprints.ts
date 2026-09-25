import {
  projectAcceptedInterventionFootprint,
  type AcceptedInterventionFootprint,
} from "../render/acceptedInterventionFootprint";
import type { RunIdentity } from "../sim/protocol";
import type { ExperimentRuntimeState } from "./experimentRuntime";

export const RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION = 1 as const;

export interface RuntimeInterventionFootprintFrame {
  readonly version: typeof RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION;
  /** Exact scientific run identity from the enclosing authoritative checkpoint. */
  readonly runIdentity: RunIdentity;
  /** Runtime-owned reset/replay/restore history generation. */
  readonly runBranchIdentity: string;
  /** Accepted mutating-command frontier for this exact snapshot transaction. */
  readonly acceptedCommandCount: number;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly snapshotTraceHash: string;
  readonly footprints: readonly AcceptedInterventionFootprint[];
}

/**
 * Atomically bind accepted intervention geometry to the exact runtime history
 * position that owns it.
 *
 * #830 intentionally keeps AcceptedInterventionFootprint event-local. This
 * app-layer bridge adds only runtime identity; it never derives biological
 * effect, geometry, affected populations, or renderer coordinates.
 */
export function projectRuntimeInterventionFootprintFrame(
  runtimeState: ExperimentRuntimeState,
): RuntimeInterventionFootprintFrame {
  const snapshot = runtimeState.snapshot;
  if (snapshot === null) {
    throw new Error(
      "runtime intervention footprints require an authoritative runtime snapshot",
    );
  }
  if (snapshot.checkpoint.authority !== "composed") {
    throw new Error(
      "runtime intervention footprints require composed simulation authority",
    );
  }

  assertCanonicalIdentity(
    "runBranchIdentity",
    runtimeState.runBranchIdentity,
  );
  assertNonNegativeSafeInteger(
    "checkpoint tick",
    snapshot.checkpoint.tick,
  );
  assertFiniteNonNegative(
    "checkpoint simulationTimeHours",
    snapshot.checkpoint.simulationTimeHours,
  );
  assertNonNegativeSafeInteger(
    "accepted command count",
    snapshot.checkpoint.commandCount,
  );
  assertCanonicalIdentity("snapshot trace hash", snapshot.traceHash);

  if (
    runIdentityKey(runtimeState.controls.identity) !==
    runIdentityKey(snapshot.checkpoint.identity)
  ) {
    throw new Error(
      "runtime intervention footprint snapshot identity does not match active controls",
    );
  }

  const footprints: AcceptedInterventionFootprint[] = [];
  let previousEventSequence = -1;

  for (const event of snapshot.events) {
    const footprint = projectAcceptedInterventionFootprint(event);
    if (footprint === null) continue;

    assertNonNegativeSafeInteger(
      "intervention event sequence",
      footprint.eventSequence,
    );
    assertNonNegativeSafeInteger("intervention event tick", footprint.tick);
    assertFiniteNonNegative(
      "intervention event simulationTimeHours",
      footprint.simulationTimeHours,
    );

    if (footprint.eventSequence <= previousEventSequence) {
      throw new RangeError(
        "accepted intervention footprints must preserve strictly increasing event sequence",
      );
    }
    if (footprint.tick > snapshot.checkpoint.tick) {
      throw new RangeError(
        "accepted intervention footprint cannot occur after the enclosing checkpoint tick",
      );
    }
    if (
      footprint.simulationTimeHours >
      snapshot.checkpoint.simulationTimeHours
    ) {
      throw new RangeError(
        "accepted intervention footprint cannot occur after the enclosing checkpoint biological time",
      );
    }

    previousEventSequence = footprint.eventSequence;
    footprints.push(footprint);
  }

  return Object.freeze({
    version: RUNTIME_INTERVENTION_FOOTPRINT_FRAME_VERSION,
    runIdentity: structuredClone(snapshot.checkpoint.identity),
    runBranchIdentity: runtimeState.runBranchIdentity,
    acceptedCommandCount: snapshot.checkpoint.commandCount,
    tick: snapshot.checkpoint.tick,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    snapshotTraceHash: snapshot.traceHash,
    footprints: Object.freeze(footprints),
  });
}

function runIdentityKey(identity: RunIdentity): string {
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

  return JSON.stringify([
    identity.engineVersion,
    identity.protocolVersion,
    identity.scenarioId,
    identity.scenarioVersion,
    identity.parameterSetId,
    identity.parameterSetVersion,
    binding,
    identity.seed,
  ]);
}

function assertCanonicalIdentity(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name} must be a non-empty canonical string`);
  }
}

function assertNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}
