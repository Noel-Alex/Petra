import { describe, expect, it } from "vitest";
import compactActionCss from "../petraCompactAction.css?raw";
import css from "./OnboardingGuide.css?raw";

// Vite resolves raw modules in Vitest; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw source import is runtime-supported but not declared in tsconfig types.
import guideSource from "./OnboardingGuide.tsx?raw";

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


describe("OnboardingGuide semantic motion fallback contract", () => {
  it("fails static in CSS until the canonical presentation adapter projects motion", () => {
    const rootRule = css.match(/\.petra-onboarding\s*\{([^}]*)\}/s);
    expect(rootRule).not.toBeNull();
    expect(rootRule?.[1]).toContain("--onboarding-motion-ms: 0ms;");
    expect(rootRule?.[1]).toContain("--onboarding-easing: linear;");
    expect(rootRule?.[1]).not.toContain("220ms");

    expect(guideSource).toContain(
      '"--onboarding-motion-ms": `${presentation.motion.durationMs}ms`,',
    );
    expect(guideSource).toContain(
      '"--onboarding-easing": `cubic-bezier(${presentation.easing.join(", ")})`,',
    );
    expect(css).toContain("var(--onboarding-motion-ms)");
    expect(css).toContain("var(--onboarding-easing)");
  });
});


describe("OnboardingGuide navigation interaction authority", () => {
  it("leaves hover/press motion to the shared compact-action adapter", () => {
    const continueRule = css.match(
      /\.petra-onboarding__continue\s*\{([^}]*)\}/s,
    );
    expect(continueRule).not.toBeNull();
    expect(continueRule?.[1]).not.toMatch(/\btransition\s*:/);
    expect(css).not.toMatch(
      /\.petra-onboarding__continue[^\{]*:hover\s*\{/,
    );
    expect(css).not.toContain("translateY(-0.06rem)");
    expect(css).not.toContain("brightness(1.045)");
  });
});
