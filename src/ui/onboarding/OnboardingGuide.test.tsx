import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { OnboardingGuide } from "./OnboardingGuide";
import {
  initialOnboardingState,
  reduceOnboarding,
} from "./story";

describe("OnboardingGuide", () => {
  it("renders the canonical six-beat story without inventing progression", () => {
    const html = renderToStaticMarkup(
      <OnboardingGuide
        state={initialOnboardingState()}
        motionPreference="full"
        onAction={vi.fn()}
      />,
    );

    expect(html).toContain("A dish is an ecosystem.");
    expect(html).toContain("Guided experiment progress");
    expect(html).toContain("Observe");
    expect(html).toContain("Seed");
    expect(html).toContain("Grow");
    expect(html).toContain("Pressure");
    expect(html).toContain("Selection");
    expect(html).toContain("Experiment");
    expect(html).toContain('data-motion-treatment="animate"');
  });

  it("visibly locks a causal stage until canonical scientific state is satisfied", () => {
    const inoculation = reduceOnboarding(initialOnboardingState(), {
      type: "continue",
    });

    const locked = renderToStaticMarkup(
      <OnboardingGuide
        state={inoculation}
        motionPreference="off"
        onAction={vi.fn()}
      />,
    );

    expect(locked).toContain("Start with a population.");
    expect(locked).toContain("Waiting for simulation evidence");
    expect(locked).toContain("authoritative simulator state");
    expect(locked).toContain('data-motion-treatment="static-emphasis"');
    expect(locked).toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);

    const satisfied = reduceOnboarding(inoculation, {
      type: "scientific-gate",
      gate: "inoculation-recorded",
    });
    const ready = renderToStaticMarkup(
      <OnboardingGuide
        state={satisfied}
        motionPreference="reduced"
        onAction={vi.fn()}
      />,
    );

    expect(ready).toContain("Authoritative gate satisfied");
    expect(ready).toContain('data-motion-treatment="crossfade"');
    expect(ready).not.toMatch(/<button[^>]*disabled=""[^>]*>Continue<\/button>/);
  });

  it("keeps skip presentation-only and disappears after controlled completion", () => {
    const skipped = reduceOnboarding(initialOnboardingState(), { type: "skip" });

    expect(skipped.satisfiedGates.size).toBe(0);
    expect(
      renderToStaticMarkup(
        <OnboardingGuide
          state={skipped}
          motionPreference="full"
          onAction={vi.fn()}
        />,
      ),
    ).toBe("");
  });
});
