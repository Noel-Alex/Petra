import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PresenterGuide } from "./PresenterGuide";
import {
  initialDemoPresenterState,
  reduceDemoPresenter,
  resolveDemoPresenterPresentation,
} from "./presenter";

describe("PresenterGuide", () => {
  it("renders a locked authoritative first cue without fake progress", () => {
    const html = renderToStaticMarkup(
      <PresenterGuide
        state={initialDemoPresenterState()}
        motionPreference="full"
        onEvent={() => undefined}
      />,
    );

    expect(html).toContain("Expo presenter mode");
    expect(html).toContain("Waiting for the authoritative flagship runtime.");
    expect(html).toContain('data-run-identity="unbound"');
    expect(html).toContain("Scientific boundary");
    expect(html).toContain("presenter pacing only");
    expect(html).toContain("disabled");
    expect(html).toContain('data-surface="dish"');
  });

  it("projects the resolved presenter motion policy into CSS variables", () => {
    const state = initialDemoPresenterState();

    for (const motionPreference of ["full", "reduced", "off"] as const) {
      const presentation = resolveDemoPresenterPresentation(
        state,
        motionPreference,
      );
      const html = renderToStaticMarkup(
        <PresenterGuide
          state={state}
          motionPreference={motionPreference}
          onEvent={() => undefined}
        />,
      );
      const easing =
        "cubic-bezier(" + presentation.easing.join(",") + ")";

      expect(html).toContain(`data-motion="${motionPreference}"`);
      expect(html).toContain(
        `data-treatment="${presentation.motion.treatment}"`,
      );
      expect(html).toContain(
        `--presenter-motion-ms:${presentation.motion.durationMs}ms`,
      );
      expect(html).toContain(`--presenter-ease:${easing}`);
    }
  });

  it("renders an enabled next action only after evidence is supplied", () => {
    const state = reduceDemoPresenter(
      initialDemoPresenterState("90-second", "run-a"),
      {
        type: "evidence",
        gate: "flagship-runtime-ready",
        runIdentity: "run-a",
      },
    );
    const html = renderToStaticMarkup(
      <PresenterGuide
        state={state}
        motionPreference="off"
        onEvent={() => undefined}
      />,
    );

    expect(html).toContain("Required authoritative evidence is available.");
    expect(html).toContain('data-motion="off"');
    expect(html).toContain('data-run-identity="run-a"');
    expect(html).toContain("Next cue");
  });

  it("renders all extended runbook cues without hiding them behind color", () => {
    const state = reduceDemoPresenter(
      initialDemoPresenterState("90-second", "run-a"),
      {
        type: "set-profile",
        profile: "3-minute",
      },
    );
    const html = renderToStaticMarkup(
      <PresenterGuide
        state={state}
        motionPreference="reduced"
        onEvent={() => undefined}
      />,
    );

    expect(html).toContain("3-minute story");
    expect(html).toContain("Change one intervention from a shared origin.");
    expect(html).toContain('aria-label="Presenter cue progress"');
  });
});
