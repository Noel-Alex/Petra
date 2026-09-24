import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ONBOARDING_CSS = readFileSync(
  new URL("./OnboardingGuide.css", import.meta.url),
  "utf8",
);

describe("OnboardingGuide visual-theme contract", () => {
  it("derives stable color chrome from Petra shared visual variables", () => {
    for (const token of [
      "--petra-color-ink-deep",
      "--petra-color-cream",
      "--petra-color-cream-muted",
      "--petra-color-teal",
      "--petra-color-lavender",
      "--petra-color-amber",
      "--petra-color-mint",
    ]) {
      expect(ONBOARDING_CSS).toContain(token);
    }

    expect(ONBOARDING_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(ONBOARDING_CSS).not.toMatch(/\brgba?\(\s*\d/i);
    expect(ONBOARDING_CSS).not.toContain("backdrop-filter:");
  });

  it("keeps onboarding focus families and gate states mapped to shared reinforcement tokens", () => {
    expect(ONBOARDING_CSS).toMatch(
      /data-focus="pressure"[\s\S]*?--petra-color-lavender/,
    );
    expect(ONBOARDING_CSS).toMatch(
      /data-focus="lineage"[\s\S]*?--petra-color-amber/,
    );
    expect(ONBOARDING_CSS).toMatch(
      /data-focus="controls"[\s\S]*?--petra-color-mint/,
    );
    expect(ONBOARDING_CSS).toMatch(
      /data-gate-state="waiting"[\s\S]*?--petra-(?:color|rgb)-amber/,
    );
    expect(ONBOARDING_CSS).toMatch(
      /data-gate-state="ready"[\s\S]*?--petra-(?:color|rgb)-mint/,
    );
  });

  it("preserves semantic motion-variable ownership instead of adding local timing", () => {
    expect(ONBOARDING_CSS).toContain("var(--onboarding-motion-ms)");
    expect(ONBOARDING_CSS).toContain("var(--onboarding-easing)");
    expect(ONBOARDING_CSS).toContain("var(--onboarding-ambient-primary-ms)");
    expect(ONBOARDING_CSS).toContain("var(--onboarding-ambient-secondary-ms)");
    expect(ONBOARDING_CSS).toContain("var(--onboarding-focus-orbit-ms)");
    expect(ONBOARDING_CSS).toContain('data-motion-treatment="instant"');
    expect(ONBOARDING_CSS).toContain('data-motion-treatment="static-emphasis"');
  });
});
