import { describe, expect, it } from "vitest";

import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
  type CiprofloxacinInterventionGeometry,
} from "../sim/ciprofloxacinIntervention";
import {
  ACCEPTED_INTERVENTION_FOOTPRINT_VERSION,
  type AcceptedInterventionFootprint,
} from "./acceptedInterventionFootprint";
import {
  ACCEPTED_INTERVENTION_PRESENTATION_PLAN_VERSION,
  prepareAcceptedInterventionPresentation,
} from "./acceptedInterventionPresentation";

function footprint(
  eventSequence: number,
  geometry: CiprofloxacinInterventionGeometry,
): AcceptedInterventionFootprint {
  return {
    version: ACCEPTED_INTERVENTION_FOOTPRINT_VERSION,
    sourceEventType: "ciprofloxacin-applied",
    eventSequence,
    tick: eventSequence,
    simulationTimeHours: eventSequence / 10,
    commandId: "dose-" + eventSequence,
    intervention: {
      schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
      concentrationMgPerL: 0.03,
      concentrationUnit: "mg/L",
      blendMode: "set",
      geometry,
    },
  };
}

describe("accepted intervention presentation plan", () => {
  it("keeps only the newest bounded footprints in authoritative order", () => {
    const source = [
      footprint(1, { kind: "global" }),
      footprint(2, {
        kind: "radial",
        center: { x: 0.25, y: 0.4 },
        radiusFraction: 0.2,
      }),
      footprint(3, {
        kind: "stripe",
        axis: "x",
        centerFraction: 0.5,
        widthFraction: 0.1,
      }),
      footprint(4, {
        kind: "paint",
        samples: [
          { x: 0.2, y: 0.3 },
          { x: 0.7, y: 0.8 },
        ],
        brushRadiusFraction: 0.05,
      }),
    ];

    const plan = prepareAcceptedInterventionPresentation(
      {
        snapshotId: "snapshot-4",
        samplingIdentity: "branch-1",
        acceptedInterventionFootprints: source,
      },
      { maxVisibleFootprints: 2 },
    );

    expect(plan.version).toBe(
      ACCEPTED_INTERVENTION_PRESENTATION_PLAN_VERSION,
    );
    expect(plan.sourceCount).toBe(4);
    expect(plan.omittedCount).toBe(2);
    expect(plan.footprints.map((entry) => entry.eventSequence)).toEqual([3, 4]);
    expect(
      plan.footprints.map((entry) => entry.intervention.geometry.kind),
    ).toEqual(["stripe", "paint"]);
  });

  it("preserves all source geometry families without inventing x/y on footprints", () => {
    const geometries: CiprofloxacinInterventionGeometry[] = [
      { kind: "global" },
      {
        kind: "radial",
        center: { x: 0.2, y: 0.8 },
        radiusFraction: 0.3,
      },
      {
        kind: "stripe",
        axis: "y",
        centerFraction: 0.6,
        widthFraction: 0.15,
      },
      {
        kind: "paint",
        samples: [
          { x: 0.1, y: 0.2 },
          { x: 0.8, y: 0.9 },
        ],
        brushRadiusFraction: 0.04,
      },
    ];
    const source = geometries.map((geometry, index) =>
      footprint(index + 1, geometry),
    );

    const plan = prepareAcceptedInterventionPresentation(
      {
        snapshotId: "snapshot-all",
        samplingIdentity: "branch-all",
        acceptedInterventionFootprints: source,
      },
      { maxVisibleFootprints: 4 },
    );

    expect(plan.footprints.map((entry) => entry.intervention.geometry)).toEqual(
      geometries,
    );
    for (const entry of plan.footprints) {
      expect(entry).not.toHaveProperty("x");
      expect(entry).not.toHaveProperty("y");
    }
  });

  it("deep-detaches retained paint geometry from the dish transaction", () => {
    const source = footprint(9, {
      kind: "paint",
      samples: [
        { x: 0.1, y: 0.2 },
        { x: 0.6, y: 0.7 },
      ],
      brushRadiusFraction: 0.08,
    });

    const plan = prepareAcceptedInterventionPresentation(
      {
        snapshotId: "snapshot-paint",
        samplingIdentity: "branch-paint",
        acceptedInterventionFootprints: [source],
      },
      { maxVisibleFootprints: 1 },
    );

    const projected = plan.footprints[0]!;
    expect(projected).not.toBe(source);
    expect(projected.intervention).not.toBe(source.intervention);
    expect(projected.intervention.geometry).not.toBe(
      source.intervention.geometry,
    );
    if (
      projected.intervention.geometry.kind !== "paint" ||
      source.intervention.geometry.kind !== "paint"
    ) {
      throw new Error("expected paint geometry");
    }
    expect(projected.intervention.geometry.samples).not.toBe(
      source.intervention.geometry.samples,
    );
    expect(projected.intervention.geometry.samples[0]).not.toBe(
      source.intervention.geometry.samples[0],
    );
    expect(Object.isFrozen(projected.intervention.geometry.samples)).toBe(true);
  });

  it("treats missing legacy footprint collections as an empty bounded plan", () => {
    expect(
      prepareAcceptedInterventionPresentation(
        {
          snapshotId: "legacy-snapshot",
          samplingIdentity: "legacy-branch",
        },
        { maxVisibleFootprints: 3 },
      ),
    ).toMatchObject({
      sourceCount: 0,
      omittedCount: 0,
      footprints: [],
    });
  });

  it("rejects invalid presentation budgets and non-canonical identities", () => {
    expect(() =>
      prepareAcceptedInterventionPresentation(
        {
          snapshotId: "snapshot",
          samplingIdentity: "branch",
          acceptedInterventionFootprints: [],
        },
        { maxVisibleFootprints: 0 },
      ),
    ).toThrow(/positive safe integer/);

    expect(() =>
      prepareAcceptedInterventionPresentation(
        {
          snapshotId: " snapshot",
          samplingIdentity: "branch",
          acceptedInterventionFootprints: [],
        },
        { maxVisibleFootprints: 1 },
      ),
    ).toThrow(/snapshotId.*canonical/i);
  });
});
