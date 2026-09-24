import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReactNode } from "react";

import type { CounterfactualBranch } from "../counterfactual";
import { MOTION } from "../motion/tokens";
import { CounterfactualCompare } from "./CounterfactualCompare";
import type { TimeBoundCompareSurface } from "./timeBoundSurface";

function branch(branchId: string, label: string): CounterfactualBranch {
  return {
    branchId,
    label,
    origin: {
      sourceRunId: "run-1",
      checkpointTraceHash: "trace-fork",
      tick: 40,
      simulationTimeHours: 2,
      commandCount: 3,
    },
    seed: 7,
    interventionCommandIds: [],
  };
}

function surface(
  branchId: string,
  simulationTimeHours: number,
  text: string,
): TimeBoundCompareSurface<ReactNode> {
  return {
    identity: {
      kind: "authoritative-sample",
      branchId,
      sampleId: `${branchId}-sample-${simulationTimeHours}`,
      simulationTimeHours,
    },
    content: <div data-scientific-surface={branchId}>{text}</div>,
  };
}

const left = branch("left", "Control");
const right = branch("right", "Treatment");

describe("CounterfactualCompare time-bound surfaces", () => {
  it("renders exact authoritative samples and derives pane times from them", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 4, "left exact")}
        rightSurface={surface("right", 4, "right exact")}
        requestedTimeHours={4}
        leftAvailableThroughHours={8}
        rightAvailableThroughHours={8}
        motionPreference="off"
      />,
    );

    expect(html).toContain("left exact");
    expect(html).toContain("right exact");
    expect(html).toContain('data-surface-status="ready"');
    expect(html).toContain('data-sample-id="left-sample-4"');
    expect(html).toContain("4.00 h");
    expect(html).toContain(
      "Both panes are synchronized to the same biological time.",
    );
  });

  it("withholds a latest-state surface that does not match the synchronized time", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 5, "WRONG LATEST LEFT")}
        rightSurface={surface("right", 4, "right exact")}
        requestedTimeHours={4}
        leftAvailableThroughHours={8}
        rightAvailableThroughHours={8}
        motionPreference="off"
      />,
    );

    expect(html).not.toContain("WRONG LATEST LEFT");
    expect(html).toContain("Scientific surface withheld");
    expect(html).toContain('data-surface-status="mismatch"');
    expect(html).toContain("Surface sample time 5 h");
    expect(html).toContain("Unavailable");
    expect(html).toContain(
      "A supplied scientific surface did not match its synchronized",
    );
  });

  it("clamps both the displayed state and label to the same authoritative sample", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 8, "left at eight")}
        rightSurface={surface("right", 6, "right at six")}
        requestedTimeHours={8}
        leftAvailableThroughHours={10}
        rightAvailableThroughHours={6}
        motionPreference="reduced"
      />,
    );

    expect(html).toContain("left at eight");
    expect(html).toContain("right at six");
    expect(html).toContain('data-sample-id="right-sample-6"');
    expect(html).toContain("6.00 h");
    expect(html).toContain("One branch has not simulated that far");
  });

  it("preserves fractional biological time at ten hours and beyond", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 10.4, "left precise")}
        rightSurface={surface("right", 10.4, "right precise")}
        requestedTimeHours={10.4}
        leftAvailableThroughHours={12}
        rightAvailableThroughHours={12}
        motionPreference="off"
      />,
    );

    expect(html).toContain("10.40 h");
    expect(html).not.toContain(">10 h<");
  });

  it("does not collapse a positive sub-minute sample to zero minutes", () => {
    const subMinuteHours = 0.008;

    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", subMinuteHours, "left early")}
        rightSurface={surface("right", subMinuteHours, "right early")}
        requestedTimeHours={subMinuteHours}
        leftAvailableThroughHours={1}
        rightAvailableThroughHours={1}
        motionPreference="off"
      />,
    );

    expect(html).toContain("0.01 h");
    expect(html).not.toContain("0 min");
  });

  it("enforces the same surface identity contract in swipe mode", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 3, "left swipe")}
        rightSurface={surface("right", 4, "WRONG RIGHT SWIPE")}
        requestedTimeHours={3}
        leftAvailableThroughHours={5}
        rightAvailableThroughHours={5}
        motionPreference="full"
        initialMode="swipe"
      />,
    );

    expect(html).toContain('data-mode="swipe"');
    expect(html).toContain("left swipe");
    expect(html).not.toContain("WRONG RIGHT SWIPE");
    expect(html).toContain("Scientific surface withheld");
  });

  it("fails static without adapter motion variables while Full still projects Petra policy", () => {
    const css = readFileSync(
      fileURLToPath(new URL("./CounterfactualCompare.css", import.meta.url)),
      "utf8",
    );
    const rootRule = css.match(/\.petra-compare\s*\{([\s\S]*?)\}/)?.[1] ?? "";

    expect(rootRule).toContain("--compare-motion-ms: 0ms;");
    expect(rootRule).toContain("--compare-easing: linear;");

    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 4, "left exact")}
        rightSurface={surface("right", 4, "right exact")}
        requestedTimeHours={4}
        leftAvailableThroughHours={8}
        rightAvailableThroughHours={8}
        motionPreference="full"
      />,
    );
    const expectedEasing = `cubic-bezier(${MOTION.panel.easing.join(", ")})`;

    expect(html).toContain(
      `--compare-motion-ms:${MOTION.panel.durationMs}ms`,
    );
    expect(html).toContain(`--compare-easing:${expectedEasing}`);
  });

  it("routes layout toggles through shared Full-motion action semantics", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 4, "left exact")}
        rightSurface={surface("right", 4, "right exact")}
        requestedTimeHours={4}
        leftAvailableThroughHours={8}
        rightAvailableThroughHours={8}
        motionPreference="full"
      />,
    );

    expect((html.match(/petra-compact-action/g) ?? []).length).toBe(2);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(1);
    expect((html.match(/data-motion="full"/g) ?? []).length).toBe(2);
    expect(html).toContain("petra-compare__mode-action");
    expect(html).toContain("Side by side");
    expect(html).toContain("Swipe");
  });

  it("keeps reduced compare toggles selected but spatially static", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 4, "left exact")}
        rightSurface={surface("right", 4, "right exact")}
        requestedTimeHours={4}
        leftAvailableThroughHours={8}
        rightAvailableThroughHours={8}
        motionPreference="reduced"
        initialMode="swipe"
      />,
    );

    expect((html.match(/data-motion="reduced"/g) ?? []).length).toBe(2);
    expect((html.match(/--petra-compact-action-duration:0ms/g) ?? []).length).toBe(2);
    expect((html.match(/--petra-compact-action-y:0rem/g) ?? []).length).toBe(2);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect(html).toContain('data-mode="swipe"');
  });

  it("keeps motion-off compare toggles static without losing toggle identity", () => {
    const html = renderToStaticMarkup(
      <CounterfactualCompare
        left={left}
        right={right}
        leftSurface={surface("left", 4, "left exact")}
        rightSurface={surface("right", 4, "right exact")}
        requestedTimeHours={4}
        leftAvailableThroughHours={8}
        rightAvailableThroughHours={8}
        motionPreference="off"
      />,
    );

    expect((html.match(/data-motion="off"/g) ?? []).length).toBe(2);
    expect((html.match(/--petra-compact-action-duration:0ms/g) ?? []).length).toBe(2);
    expect((html.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect((html.match(/aria-pressed="false"/g) ?? []).length).toBe(1);
  });
});


describe("Counterfactual Compare shared visual theme", () => {
  const css = readFileSync(
    fileURLToPath(new URL("./CounterfactualCompare.css", import.meta.url)),
    "utf8",
  );

  it("uses Petra shared visual variables without a local numeric palette or glass blur", () => {
    for (const token of [
      "--petra-color-cream",
      "--petra-color-cream-muted",
      "--petra-color-teal",
      "--petra-color-coral",
      "--petra-color-lavender",
      "--petra-color-amber",
      "--petra-color-mint",
      "--petra-rgb-ink-deep",
    ]) {
      expect(css).toContain(token);
    }

    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/\brgba?\(\s*\d/i);
    expect(css).not.toMatch(/backdrop-filter\s*:\s*blur/i);
  });

  it("maps divergence categories to the approved shared reinforcement families", () => {
    expect(css).toMatch(
      /data-tone="intervention"[\s\S]*?--petra-color-coral/,
    );
    expect(css).toMatch(
      /data-tone="stochastic"[\s\S]*?--petra-color-teal/,
    );
    expect(css).toMatch(
      /data-tone="mixed"[\s\S]*?--petra-color-lavender/,
    );
    expect(css).toMatch(
      /data-tone="warning"[\s\S]*?--petra-color-amber/,
    );
    expect(css).toMatch(
      /data-tone="matched"[\s\S]*?--petra-color-mint/,
    );
  });

  it("preserves the native swipe range touch floor and shared focus authority", () => {
    const revealInput =
      css.match(/\.petra-compare__reveal input\s*\{([\s\S]*?)\}/)?.[1] ??
      "";
    const focusRule =
      css.match(
        /\.petra-compare__mode-action:focus-visible,[\s\S]*?\{([\s\S]*?)\}/,
      )?.[1] ?? "";

    expect(revealInput).toContain("min-height: 2.75rem;");
    expect(revealInput).toContain("width: 100%;");
    expect(revealInput).toContain("var(--petra-color-teal)");
    expect(focusRule).toContain("var(--petra-focus-ring)");
  });
});
