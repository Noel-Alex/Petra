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

  assertCiprofloxacinIntervention(event.intervention);

  return {
    version: ACCEPTED_INTERVENTION_FOOTPRINT_VERSION,
    sourceEventType: "ciprofloxacin-applied",
    eventSequence: event.sequence,
    tick: event.tick,
    simulationTimeHours: event.simulationTimeHours,
    commandId: event.commandId,
    intervention: cloneIntervention(event.intervention),
  };
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
