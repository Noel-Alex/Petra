import {
  assertCiprofloxacinIntervention,
  type CiprofloxacinIntervention,
  type CiprofloxacinInterventionGeometry,
  type NormalizedInterventionPoint,
} from "../sim/ciprofloxacinIntervention";
import type { SimulationEvent } from "../sim/protocol";

export const ACCEPTED_INTERVENTION_FOOTPRINT_VERSION = 1 as const;

export interface AcceptedInterventionFootprint {
  readonly version: typeof ACCEPTED_INTERVENTION_FOOTPRINT_VERSION;
  readonly sourceEventType: "ciprofloxacin-applied";
  readonly eventSequence: number;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly commandId: string;
  readonly intervention: CiprofloxacinIntervention;
}

export function assertAcceptedInterventionFootprint(
  value: unknown,
): asserts value is AcceptedInterventionFootprint {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("accepted intervention footprint must be an object");
  }
  const footprint = value as Record<string, unknown>;
  if (footprint.version !== ACCEPTED_INTERVENTION_FOOTPRINT_VERSION) {
    throw new RangeError("unsupported accepted intervention footprint version");
  }
  if (footprint.sourceEventType !== "ciprofloxacin-applied") {
    throw new RangeError(
      "accepted intervention footprint must come from ciprofloxacin-applied authority",
    );
  }
  assertNonNegativeSafeInteger(
    "accepted intervention footprint eventSequence",
    footprint.eventSequence,
  );
  assertNonNegativeSafeInteger(
    "accepted intervention footprint tick",
    footprint.tick,
  );
  if (
    typeof footprint.simulationTimeHours !== "number" ||
    !Number.isFinite(footprint.simulationTimeHours) ||
    footprint.simulationTimeHours < 0
  ) {
    throw new RangeError(
      "accepted intervention footprint simulationTimeHours must be finite and non-negative",
    );
  }
  assertCanonicalText(
    "accepted intervention footprint commandId",
    footprint.commandId,
  );
  assertCiprofloxacinIntervention(footprint.intervention);
}

/**
 * Losslessly projects accepted spatial intervention authority into detached
 * render data. The geometry remains source-shaped: global is global, stripes
 * remain bands, and paint remains an ordered stroke. Consumers must not invent
 * a representative point for geometries that do not have one.
 *
 * This is presentation input only. It does not estimate biological effect,
 * transport, diffusion, clearance, or affected population.
 */
export function projectAcceptedInterventionFootprint(
  event: SimulationEvent,
): AcceptedInterventionFootprint | null {
  if (event.type !== "ciprofloxacin-applied") return null;

  if (event.commandId === undefined || event.commandId.length === 0) {
    throw new TypeError(
      "accepted ciprofloxacin event requires a non-empty commandId",
    );
  }
  if (event.intervention === undefined) {
    throw new TypeError(
      "accepted ciprofloxacin event requires intervention authority",
    );
  }

  const projected: AcceptedInterventionFootprint = {
    version: ACCEPTED_INTERVENTION_FOOTPRINT_VERSION,
    sourceEventType: "ciprofloxacin-applied",
    eventSequence: event.sequence,
    tick: event.tick,
    simulationTimeHours: event.simulationTimeHours,
    commandId: event.commandId,
    intervention: cloneIntervention(event.intervention),
  };
  assertAcceptedInterventionFootprint(projected);
  return projected;
}

function cloneIntervention(
  intervention: CiprofloxacinIntervention,
): CiprofloxacinIntervention {
  return {
    schemaVersion: intervention.schemaVersion,
    concentrationMgPerL: intervention.concentrationMgPerL,
    concentrationUnit: intervention.concentrationUnit,
    blendMode: intervention.blendMode,
    geometry: cloneGeometry(intervention.geometry),
  };
}

function cloneGeometry(
  geometry: CiprofloxacinInterventionGeometry,
): CiprofloxacinInterventionGeometry {
  if (geometry.kind === "global") {
    return { kind: "global" };
  }
  if (geometry.kind === "radial") {
    return {
      kind: "radial",
      center: clonePoint(geometry.center),
      radiusFraction: geometry.radiusFraction,
    };
  }
  if (geometry.kind === "stripe") {
    return {
      kind: "stripe",
      axis: geometry.axis,
      centerFraction: geometry.centerFraction,
      widthFraction: geometry.widthFraction,
    };
  }
  return {
    kind: "paint",
    samples: geometry.samples.map(clonePoint),
    brushRadiusFraction: geometry.brushRadiusFraction,
  };
}

function clonePoint(
  point: NormalizedInterventionPoint,
): NormalizedInterventionPoint {
  return { x: point.x, y: point.y };
}

function assertNonNegativeSafeInteger(name: string, value: unknown): void {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function assertCanonicalText(name: string, value: unknown): void {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(`${name} must be canonical non-empty text`);
  }
}
