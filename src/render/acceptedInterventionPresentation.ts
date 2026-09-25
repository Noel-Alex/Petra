import type {
  CiprofloxacinIntervention,
  CiprofloxacinInterventionGeometry,
  NormalizedInterventionPoint,
} from "../sim/ciprofloxacinIntervention";
import type { AcceptedInterventionFootprint } from "./acceptedInterventionFootprint";
import type { DishRenderSnapshot } from "./model";

export const ACCEPTED_INTERVENTION_PRESENTATION_PLAN_VERSION = 1 as const;

export interface AcceptedInterventionPresentationPolicy {
  /**
   * Presentation-only history budget. Complete scientific event history remains
   * outside this plan; this cap bounds drawable causal accents.
   */
  readonly maxVisibleFootprints: number;
}

export interface AcceptedInterventionPresentationPlan {
  readonly version: typeof ACCEPTED_INTERVENTION_PRESENTATION_PLAN_VERSION;
  readonly snapshotId: string;
  readonly samplingIdentity: string;
  readonly sourceCount: number;
  readonly omittedCount: number;
  /**
   * Newest accepted footprints retained in their original authoritative order.
   * Every record is detached from the source DishRenderSnapshot.
   */
  readonly footprints: readonly AcceptedInterventionFootprint[];
}

/**
 * Builds a bounded presentation plan from an already-admitted dish snapshot.
 *
 * validateRenderSnapshot(...) remains the scientific/presentation admission
 * boundary. This helper deliberately does not rescan grid/field/lineage data:
 * it only applies an explicit history budget and deep-detaches the retained
 * footprint records for a renderer consumer.
 *
 * The returned geometry remains source-shaped. In particular, global, stripe,
 * and paint interventions never acquire an invented representative point.
 */
export function prepareAcceptedInterventionPresentation(
  snapshot: Pick<
    DishRenderSnapshot,
    "snapshotId" | "samplingIdentity" | "acceptedInterventionFootprints"
  >,
  policy: AcceptedInterventionPresentationPolicy,
): AcceptedInterventionPresentationPlan {
  assertCanonicalText("snapshotId", snapshot.snapshotId);
  assertCanonicalText("samplingIdentity", snapshot.samplingIdentity);
  assertPositiveSafeInteger(
    "maxVisibleFootprints",
    policy.maxVisibleFootprints,
  );

  const source = snapshot.acceptedInterventionFootprints ?? [];
  const firstVisible = Math.max(0, source.length - policy.maxVisibleFootprints);
  const footprints = source.slice(firstVisible).map(cloneFootprint);

  return Object.freeze({
    version: ACCEPTED_INTERVENTION_PRESENTATION_PLAN_VERSION,
    snapshotId: snapshot.snapshotId,
    samplingIdentity: snapshot.samplingIdentity,
    sourceCount: source.length,
    omittedCount: firstVisible,
    footprints: Object.freeze(footprints),
  });
}

function cloneFootprint(
  footprint: AcceptedInterventionFootprint,
): AcceptedInterventionFootprint {
  return Object.freeze({
    version: footprint.version,
    sourceEventType: footprint.sourceEventType,
    eventSequence: footprint.eventSequence,
    tick: footprint.tick,
    simulationTimeHours: footprint.simulationTimeHours,
    commandId: footprint.commandId,
    intervention: cloneIntervention(footprint.intervention),
  });
}

function cloneIntervention(
  intervention: CiprofloxacinIntervention,
): CiprofloxacinIntervention {
  return Object.freeze({
    schemaVersion: intervention.schemaVersion,
    concentrationMgPerL: intervention.concentrationMgPerL,
    concentrationUnit: intervention.concentrationUnit,
    blendMode: intervention.blendMode,
    geometry: cloneGeometry(intervention.geometry),
  });
}

function cloneGeometry(
  geometry: CiprofloxacinInterventionGeometry,
): CiprofloxacinInterventionGeometry {
  if (geometry.kind === "global") {
    return Object.freeze({ kind: "global" });
  }
  if (geometry.kind === "radial") {
    return Object.freeze({
      kind: "radial",
      center: clonePoint(geometry.center),
      radiusFraction: geometry.radiusFraction,
    });
  }
  if (geometry.kind === "stripe") {
    return Object.freeze({
      kind: "stripe",
      axis: geometry.axis,
      centerFraction: geometry.centerFraction,
      widthFraction: geometry.widthFraction,
    });
  }
  return Object.freeze({
    kind: "paint",
    samples: Object.freeze(geometry.samples.map(clonePoint)),
    brushRadiusFraction: geometry.brushRadiusFraction,
  });
}

function clonePoint(
  point: NormalizedInterventionPoint,
): NormalizedInterventionPoint {
  return Object.freeze({ x: point.x, y: point.y });
}

function assertPositiveSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(name + " must be a positive safe integer");
  }
}

function assertCanonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new TypeError(name + " must be canonical non-empty text");
  }
}
