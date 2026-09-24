import { describe, expect, it } from "vitest";

import css from "./OnboardingGuide.css?raw";

describe("OnboardingGuide ambient motion source contract", () => {
  it("consumes projected shared loop variables instead of local timing authority", () => {
    expect(css).toContain("var(--onboarding-ambient-primary-ms)");
    expect(css).toContain("var(--onboarding-ambient-primary-easing)");
    expect(css).toContain("var(--onboarding-ambient-secondary-ms)");
    expect(css).toContain("var(--onboarding-ambient-secondary-easing)");
    expect(css).toContain("var(--onboarding-focus-orbit-ms)");
    expect(css).toContain("var(--onboarding-focus-orbit-easing)");
    expect(css).toContain('[data-ambient-motion="animate"]');

    expect(css).not.toMatch(/\b8s\b/);
    expect(css).not.toMatch(/\b11s\b/);
    expect(css).not.toMatch(/\b12s\b/);
    expect(css).not.toContain("prefers-reduced-motion");
  });
});
