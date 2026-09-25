import { describe, expect, it } from "vitest";

import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
  type CiprofloxacinIntervention,
} from "../sim/ciprofloxacinIntervention";
import type { SimulationEvent } from "../sim/protocol";
import {
  ACCEPTED_INTERVENTION_FOOTPRINT_VERSION,
  assertAcceptedInterventionFootprint,
  projectAcceptedInterventionFootprint,
} from "./acceptedInterventionFootprint";

function appliedEvent(
  intervention: CiprofloxacinIntervention,
): SimulationEvent {
  return {
    sequence: 7,
    tick: 12,
    simulationTimeHours: 0.24,
    type: "ciprofloxacin-applied",
    commandId: "dose-7",
    intervention,
  };
}

function intervention(
  geometry: CiprofloxacinIntervention["geometry"],
): CiprofloxacinIntervention {
  return {
    schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
    concentrationMgPerL: 0.03,
    concentrationUnit: "mg/L",
    blendMode: "set",
    geometry,
  };
}

describe("accepted intervention footprint projection", () => {
  it.each([
    { kind: "global" } as const,
    {
      kind: "radial",
      center: { x: 0.25, y: 0.75 },
      radiusFraction: 0.2,
    } as const,
    {
      kind: "stripe",
      axis: "x",
      centerFraction: 0.4,
      widthFraction: 0.15,
    } as const,
    {
      kind: "paint",
      samples: [
        { x: 0.1, y: 0.2 },
        { x: 0.4, y: 0.5 },
        { x: 0.8, y: 0.7 },
      ],
      brushRadiusFraction: 0.08,
    } as const,
  ])("preserves exact $kind geometry without inventing a point", (geometry) => {
    const source = appliedEvent(intervention(geometry));
    const projected = projectAcceptedInterventionFootprint(source);

    expect(projected).toEqual({
      version: ACCEPTED_INTERVENTION_FOOTPRINT_VERSION,
      sourceEventType: "ciprofloxacin-applied",
      eventSequence: 7,
      tick: 12,
      simulationTimeHours: 0.24,
      commandId: "dose-7",
      intervention: source.intervention,
    });
    expect(projected?.intervention).not.toBe(source.intervention);
    expect(projected?.intervention.geometry).not.toBe(
      source.intervention?.geometry,
    );
    expect(projected).not.toHaveProperty("x");
    expect(projected).not.toHaveProperty("y");
  });

  it("deep-detaches paint points from authoritative event history", () => {
    const source = appliedEvent(
      intervention({
        kind: "paint",
        samples: [
          { x: 0.1, y: 0.2 },
          { x: 0.7, y: 0.8 },
        ],
        brushRadiusFraction: 0.1,
      }),
    );
    const projected = projectAcceptedInterventionFootprint(source);
    expect(projected).not.toBeNull();

    const sourceGeometry = source.intervention!.geometry;
    const projectedGeometry = projected!.intervention.geometry;
    expect(sourceGeometry.kind).toBe("paint");
    expect(projectedGeometry.kind).toBe("paint");
    if (sourceGeometry.kind !== "paint" || projectedGeometry.kind !== "paint") {
      throw new Error("expected paint geometry");
    }

    expect(projectedGeometry.samples).not.toBe(sourceGeometry.samples);
    expect(projectedGeometry.samples[0]).not.toBe(sourceGeometry.samples[0]);

    (
      projectedGeometry.samples[0] as {
        x: number;
        y: number;
      }
    ).x = 0.99;

    expect(sourceGeometry.samples[0]!.x).toBe(0.1);
    expect(projectedGeometry.samples[0]!.x).toBe(0.99);
  });

  it("returns no footprint for non-spatial simulation events", () => {
    const advanced: SimulationEvent = {
      sequence: 8,
      tick: 13,
      simulationTimeHours: 0.26,
      type: "advanced",
      commandId: "step-8",
      value: 1,
    };

    expect(projectAcceptedInterventionFootprint(advanced)).toBeNull();
  });

  it("validates projected footprint identity and rejects malformed detached data", () => {
    const source = projectAcceptedInterventionFootprint(
      appliedEvent(intervention({ kind: "global" })),
    );
    expect(source).not.toBeNull();
    expect(() => assertAcceptedInterventionFootprint(source)).not.toThrow();

    expect(() =>
      assertAcceptedInterventionFootprint({
        ...source,
        eventSequence: -1,
      }),
    ).toThrow(/eventSequence must be a non-negative safe integer/);
    expect(() =>
      assertAcceptedInterventionFootprint({
        ...source,
        commandId: " dose-7",
      }),
    ).toThrow(/commandId must be canonical non-empty text/);
    expect(() =>
      assertAcceptedInterventionFootprint({
        ...source,
        version: 999,
      }),
    ).toThrow(/unsupported accepted intervention footprint version/);
  });

  it("fails closed if a claimed accepted intervention event lacks authority", () => {
    const missingIntervention = {
      sequence: 9,
      tick: 13,
      simulationTimeHours: 0.26,
      type: "ciprofloxacin-applied",
      commandId: "dose-9",
    } as SimulationEvent;

    expect(() =>
      projectAcceptedInterventionFootprint(missingIntervention),
    ).toThrow(/requires intervention authority/);
  });
});
