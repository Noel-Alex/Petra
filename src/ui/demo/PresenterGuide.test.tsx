import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PresenterGuide } from "./PresenterGuide";
import {
  initialDemoPresenterState,
  reduceDemoPresenter,
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
    expect(html).toContain("Waiting for authoritative runtime state.");
    expect(html).toContain("Scientific boundary");
    expect(html).toContain("presenter pacing only");
    expect(html).toContain("disabled");
    expect(html).toContain('data-surface="dish"');
  });

  it("renders an enabled next action only after evidence is supplied", () => {
    const state = reduceDemoPresenter(initialDemoPresenterState(), {
      type: "evidence",
      gate: "runtime-ready",
    });
    const html = renderToStaticMarkup(
      <PresenterGuide
        state={state}
        motionPreference="off"
        onEvent={() => undefined}
      />,
    );

    expect(html).toContain("Required authoritative evidence is available.");
    expect(html).toContain('data-motion="off"');
    expect(html).toContain("Next cue");
  });

  it("renders all extended runbook cues without hiding them behind color", () => {
    const state = reduceDemoPresenter(initialDemoPresenterState(), {
      type: "set-profile",
      profile: "3-minute",
    });
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
