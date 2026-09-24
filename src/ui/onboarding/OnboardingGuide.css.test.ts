import { describe, expect, it } from "vitest";
import compactActionCss from "../petraCompactAction.css?raw";\nimport css from "./OnboardingGuide.css?raw";

describe("OnboardingGuide ambient motion source contract", () => {
  it("consumes projected shared loop variables instead of local timing authority", () => {
    expect(css).toContain("var(--onboarding-ambient-primary-ms)");
    expect(css).toContain("var(--onboarding-ambient-secondary-ms)");
    expect(css).toContain("var(--onboarding-focus-orbit-ms)");
    expect(css).toContain('[data-ambient-motion="animate"]');
    expect(css).not.toMatch(/\b8s\b/);
    expect(css).not.toMatch(/\b11s\b/);
    expect(css).not.toMatch(/\b12s\b/);
    expect(css).not.toContain("prefers-reduced-motion");
  });
});


describe("OnboardingGuide navigation touch target contract", () => {
  it("inherits Petra's shared 2.75rem compact-action floor without shrinking it locally", () => {
    expect(compactActionCss).toMatch(
      /\.petra-compact-action\s*\{[^}]*min-height:\s*2\.75rem;/s,
    );

    const navigationRule = css.match(
      /\.petra-onboarding__back,\s*\.petra-onboarding__continue\s*\{([^}]*)\}/s,
    );
    expect(navigationRule).not.toBeNull();
    expect(navigationRule?.[1]).not.toMatch(/min-height\s*:/);
    expect(css).not.toContain("min-height: 2.65rem");
  });
});
