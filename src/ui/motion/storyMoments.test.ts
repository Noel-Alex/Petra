import { describe, expect, it } from "vitest";

import { MOTION } from "./tokens";
import {
  STORY_MOMENT_BURST_POLICY,
  STORY_MOMENT_KINDS,
  planStoryMoment,
  planStoryMomentBurst,
  type StoryMomentEvidence,
  type StoryMomentKind,
} from "./storyMoments";

describe("premium causal story moments", () => {
  it("covers all six expo story moments from explicit compatible authority", () => {
    for (const kind of STORY_MOMENT_KINDS) {
      const plan = planStoryMoment({
        kind,
        preference: "full",
        evidence: evidenceFor(kind),
      });

      expect(plan).toMatchObject({
        eligible: true,
        kind,
        tone: "scientific-neutral",
        cameraPolicy: "preserve-user-view",
        timingMeaning: "presentation-wall-time-only",
        scientificAuthority: "presentation-only",
        powerUpFraming: false,
      });
      if (!plan.eligible) throw new Error("expected eligible story moment");
      expect(plan.cues.length).toBeGreaterThan(0);
      expect(plan.cues.some((cue) => cue.essential)).toBe(true);
      expect(plan.durationMs).toBeUndefined();
      expect(MOTION[plan.token]).toBeDefined();
    }
  });

  it("fails closed when a generic or mismatched authority class is reused as a story fact", () => {
    expect(
      planStoryMoment({
        kind: "first-resistant-lineage",
        preference: "full",
      }),
    ).toEqual({
      eligible: false,
      kind: "first-resistant-lineage",
      reason: "evidence-mismatch",
      receivedEvidenceSource: "none",
      requiredEvidenceSource: "authoritative-story-event",
    });

    expect(
      planStoryMoment({
        kind: "first-resistant-lineage",
        preference: "full",
        evidence: {
          source: "authoritative-story-event",
          storyKind: "lineage-extinction",
          eventId: "extinction-7",
          sequence: 7,
        },
      }),
    ).toMatchObject({
      eligible: false,
      reason: "evidence-mismatch",
    });

    expect(
      planStoryMoment({
        kind: "phage-wave",
        preference: "full",
        evidence: {
          source: "authoritative-story-event",
          storyKind: "drug-zone-breakthrough",
          eventId: "one-lysis-is-not-a-wave",
          sequence: 3,
        },
      }),
    ).toMatchObject({
      eligible: false,
      requiredEvidenceSource: "authoritative-event-burst",
    });
  });

  it("keeps resistance framing observational rather than celebratory or mutation-directing", () => {
    const plan = planStoryMoment({
      kind: "first-resistant-lineage",
      preference: "full",
      evidence: evidenceFor("first-resistant-lineage"),
    });
    if (!plan.eligible) throw new Error("expected eligible story moment");

    expect(plan.powerUpFraming).toBe(false);
    expect(plan.headline).toBe("Resistant lineage recorded");
    expect(plan.detail).toContain(
      "antibiotic pressure does not instruct a useful mutation",
    );
    expect(plan.detail.toLowerCase()).not.toContain("power-up");
    expect(plan.detail.toLowerCase()).not.toContain("victory");
  });

  it("uses shared named motion tokens and preserves essential meaning in reduced/off modes", () => {
    const full = planStoryMoment({
      kind: "phage-wave",
      preference: "full",
      evidence: evidenceFor("phage-wave"),
    });
    const reduced = planStoryMoment({
      kind: "phage-wave",
      preference: "reduced",
      evidence: evidenceFor("phage-wave"),
    });
    const off = planStoryMoment({
      kind: "phage-wave",
      preference: "off",
      evidence: evidenceFor("phage-wave"),
    });

    if (!full.eligible || !reduced.eligible || !off.eligible) {
      throw new Error("expected eligible story moment");
    }

    expect(full.token).toBe("lysisBurst");
    expect(full.cues.some((cue) => cue.treatment === "animate")).toBe(true);
    expect(
      reduced.cues.find((cue) => cue.essential)?.treatment,
    ).toBe("crossfade");
    expect(off.cues.every((cue) => cue.essential)).toBe(true);
    expect(
      off.cues.every(
        (cue) =>
          cue.treatment === "static-emphasis" &&
          cue.durationMs === 0 &&
          cue.startMs === 0,
      ),
    ).toBe(true);
  });

  it("keeps crash/recovery descriptive without assigning an unsupported cause", () => {
    const plan = planStoryMoment({
      kind: "population-crash-recovery",
      preference: "off",
      evidence: evidenceFor("population-crash-recovery"),
    });
    if (!plan.eligible) throw new Error("expected eligible story moment");

    expect(plan.detail).toContain("does not assign a biological cause");
    expect(plan.evidenceSource).toBe("authoritative-metric-transition");
  });

  it("bounds simultaneous high-salience moments and degrades overflow to static emphasis", () => {
    const items = STORY_MOMENT_KINDS.slice(0, 5).map((kind, index) => ({
      id: `moment-${index}`,
      sequence: index,
      kind,
      evidence: evidenceFor(kind),
    }));
    const plan = planStoryMomentBurst(items, "full");

    expect(plan.moments.map((moment) => moment.id)).toEqual(
      items.map((item) => item.id),
    );
    expect(plan.moments.slice(0, STORY_MOMENT_BURST_POLICY.full.animatedMomentLimit)
      .every((moment) => moment.presentation === "animated")).toBe(true);

    const overflow = plan.moments.slice(
      STORY_MOMENT_BURST_POLICY.full.animatedMomentLimit,
    );
    expect(overflow.length).toBeGreaterThan(0);
    expect(
      overflow.every(
        (moment) =>
          moment.presentation === "static" &&
          moment.degradedForBurst &&
          moment.startMs === 0 &&
          moment.plan.cues.every(
            (cue) =>
              cue.essential &&
              cue.treatment === "static-emphasis",
          ),
      ),
    ).toBe(true);
    expect(
      Object.values(plan.overflowCounts).reduce(
        (total, count) => total + count,
        0,
      ),
    ).toBe(overflow.length);
  });

  it("keeps motion-off bursts complete, immediate, and non-degraded", () => {
    const items = STORY_MOMENT_KINDS.map((kind, index) => ({
      id: `moment-${index}`,
      sequence: index,
      kind,
      evidence: evidenceFor(kind),
    }));
    const plan = planStoryMomentBurst(items, "off");

    expect(plan.moments).toHaveLength(STORY_MOMENT_KINDS.length);
    expect(plan.animatedMomentCount).toBe(0);
    expect(plan.staticMomentCount).toBe(STORY_MOMENT_KINDS.length);
    expect(
      plan.moments.every(
        (moment) =>
          moment.presentation === "static" &&
          !moment.degradedForBurst &&
          moment.startMs === 0,
      ),
    ).toBe(true);
  });

  it("validates authoritative evidence identity rather than silently coercing malformed metadata", () => {
    expect(() =>
      planStoryMoment({
        kind: "population-crash-recovery",
        preference: "full",
        evidence: {
          source: "authoritative-metric-transition",
          storyKind: "population-crash-recovery",
          metricId: "population",
          fromSampleId: "same",
          toSampleId: "same",
        },
      }),
    ).toThrow(/distinct authoritative samples/);

    expect(() =>
      planStoryMoment({
        kind: "phage-wave",
        preference: "full",
        evidence: {
          source: "authoritative-event-burst",
          storyKind: "phage-wave",
          firstEventId: "lysis-5",
          lastEventId: "lysis-4",
          firstSequence: 5,
          lastSequence: 4,
        },
      }),
    ).toThrow(/preserve authoritative sequence order/);
  });

  it("rejects duplicate story ids and reordered authority in a burst", () => {
    expect(() =>
      planStoryMomentBurst(
        [
          {
            id: "same",
            sequence: 1,
            kind: "lineage-extinction",
            evidence: evidenceFor("lineage-extinction"),
          },
          {
            id: "same",
            sequence: 2,
            kind: "fork-divergence",
            evidence: evidenceFor("fork-divergence"),
          },
        ],
        "full",
      ),
    ).toThrow(/duplicate story moment id/);

    expect(() =>
      planStoryMomentBurst(
        [
          {
            id: "later",
            sequence: 2,
            kind: "lineage-extinction",
            evidence: evidenceFor("lineage-extinction"),
          },
          {
            id: "earlier",
            sequence: 1,
            kind: "fork-divergence",
            evidence: evidenceFor("fork-divergence"),
          },
        ],
        "full",
      ),
    ).toThrow(/strictly increasing authority order/);
  });

  it("rejects unknown story moment kinds at runtime", () => {
    expect(() =>
      planStoryMoment({
        kind: "confetti" as StoryMomentKind,
        preference: "full",
        evidence: evidenceFor("fork-divergence"),
      }),
    ).toThrow(/unknown story moment kind/);
  });
});

function evidenceFor(kind: StoryMomentKind): StoryMomentEvidence {
  switch (kind) {
    case "first-resistant-lineage":
    case "lineage-extinction":
    case "drug-zone-breakthrough":
      return {
        source: "authoritative-story-event",
        storyKind: kind,
        eventId: `${kind}-event`,
        sequence: 4,
      };
    case "population-crash-recovery":
      return {
        source: "authoritative-metric-transition",
        storyKind: kind,
        metricId: "population-total",
        fromSampleId: "sample-crash",
        toSampleId: "sample-recovery",
      };
    case "phage-wave":
      return {
        source: "authoritative-event-burst",
        storyKind: kind,
        firstEventId: "lysis-20",
        lastEventId: "lysis-28",
        firstSequence: 20,
        lastSequence: 28,
      };
    case "fork-divergence":
      return {
        source: "authoritative-compare",
        storyKind: kind,
        comparisonId: "control::treatment::fork-12",
      };
  }
}
