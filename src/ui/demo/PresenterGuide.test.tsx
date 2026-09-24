import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PresenterGuide } from "./PresenterGuide";
import {
  initialDemoPresenterState,
  reduceDemoPresenter,
  resolveDemoPresenterPresentation,
} from "./presenter";

function presenterActions(html: string): string[] {
  return (
    html.match(
      /<button[^>]*class="[^"]*petra-compact-action[^"]*"[^>]*>[\s\S]*?<\/button>/g,
    ) ?? []
  );
}

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
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain(
      'class="presenter-guide__announcement" role="status" aria-live="polite" aria-atomic="true" aria-relevant="text"',
    );
    expect(html).toContain(
      "Cue 1 of 6: One reproducible state drives the scene. Waiting for the authoritative flagship runtime.",
    );
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

  it("projects cue identity onto an inner visual layer while keeping the bounded announcement stable", () => {
    const initial = initialDemoPresenterState("90-second", "run-a");
    const ready = reduceDemoPresenter(initial, {
      type: "evidence",
      gate: "flagship-runtime-ready",
      runIdentity: "run-a",
    });
    const next = reduceDemoPresenter(ready, { type: "next" });

    const initialHtml = renderToStaticMarkup(
      <PresenterGuide
        state={initial}
        motionPreference="full"
        onEvent={() => undefined}
      />,
    );
    const nextHtml = renderToStaticMarkup(
      <PresenterGuide
        state={next}
        motionPreference="full"
        onEvent={() => undefined}
      />,
    );

    expect(initialHtml).toContain('class="presenter-guide__card"');
    expect(nextHtml).toContain('class="presenter-guide__card"');
    expect(initialHtml).not.toContain(
      'class="presenter-guide__card" aria-live="polite"',
    );
    expect(nextHtml).not.toContain(
      'class="presenter-guide__card" aria-live="polite"',
    );
    expect(initialHtml.match(/role="status"/g)).toHaveLength(1);
    expect(nextHtml.match(/role="status"/g)).toHaveLength(1);
    expect(initialHtml).toContain(
      "Cue 1 of 6: One reproducible state drives the scene. Waiting for the authoritative flagship runtime.",
    );
    expect(nextHtml).toContain(
      "Cue 2 of 6: Resources shape growth. Waiting for authoritative growth evidence.",
    );
    expect(initialHtml).toContain(
      'class="presenter-guide__card-content" data-cue-id="world"',
    );
    expect(nextHtml).toContain(
      'class="presenter-guide__card-content" data-cue-id="growth"',
    );
  });

  it("routes both navigation controls through shared motion semantics", () => {
    const state = initialDemoPresenterState();

    for (const motionPreference of ["full", "reduced", "off"] as const) {
      const html = renderToStaticMarkup(
        <PresenterGuide
          state={state}
          motionPreference={motionPreference}
          onEvent={() => undefined}
        />,
      );
      const actions = presenterActions(html);

      expect(actions).toHaveLength(2);
      expect(actions[0]).toContain(">Back</button>");
      expect(actions[1]).toContain(">Next cue</button>");
      expect(actions[0]).toContain(`data-motion="${motionPreference}"`);
      expect(actions[1]).toContain(`data-motion="${motionPreference}"`);
      expect(actions[0]).toContain('disabled=""');
      expect(actions[1]).toContain('disabled=""');
      expect(actions[1]).toContain(
        'aria-describedby="presenter-guide-gate-status"',
      );
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
    expect(html.match(/role="status"/g)).toHaveLength(1);
    expect(html).toContain(
      "Cue 1 of 6: One reproducible state drives the scene. Required authoritative evidence is available.",
    );
    expect(html).toContain('data-motion="off"');
    expect(html).toContain('data-run-identity="run-a"');
    const actions = presenterActions(html);
    expect(actions).toHaveLength(2);
    expect(actions[0]).toContain('disabled=""');
    expect(actions[1]).toContain(">Next cue</button>");
    expect(actions[1]).not.toContain('disabled=""');
    expect(actions[1]).not.toContain("aria-describedby");
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
