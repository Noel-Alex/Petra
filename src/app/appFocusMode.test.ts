import { describe, expect, it } from "vitest";

import appSource from "./App.tsx?raw";
import appStyles from "./app.css?raw";
import paletteSource from "./InterventionPalette.tsx?raw";

describe("dish focus shell integration", () => {
  it("projects one presentation-only focus plan into shell state", () => {
    expect(appSource).toContain(
      'const [focusMode, setFocusMode] = useState<DishFocusMode>("workspace")',
    );
    expect(appSource).toContain(
      "resolveDishFocusPresentation(focusMode, motionPreference)",
    );
    expect(appSource).toContain(
      "data-focus-mode={focusPresentation.mode}",
    );
    expect(appSource).toContain('aria-pressed={focusMode === "focus"}');
    expect(appSource).toContain("Focus dish");
    expect(appSource).toContain("Exit focus");
  });

  it("collapses side chrome semantically instead of leaving focusable invisible controls", () => {
    expect(appSource).toContain(
      'collapsed={focusPresentation.sideChrome === "collapsed"}',
    );
    expect(appSource).toContain(
      'inert={focusPresentation.sideChrome === "collapsed"}',
    );
    expect(paletteSource).toContain("inert={collapsed}");
    expect(paletteSource).toContain(
      'aria-hidden={collapsed ? true : undefined}',
    );
  });

  it("keeps timeline authority visible while compacting history in focus mode", () => {
    expect(appSource).toContain(
      'focusPresentation.timelineDensity === "full"',
    );
    expect(appSource).toContain("experiment.view.simulationTimeLabel");
    expect(appSource).toContain("experiment.view.timeline.length");
    expect(appSource).toContain("timeline-controls");
  });

  it("uses focus motion variables for layout and panel choreography", () => {
    expect(appStyles).toContain("--focus-motion-ms");
    expect(appStyles).toContain(
      '.petra-app[data-focus-mode="focus"] .petra-workspace',
    );
    expect(appStyles).toContain(".petra-workspace > .petra-panel");
    expect(appStyles).toContain(
      'data-focus-treatment="instant"',
    );
    expect(appStyles).toContain("@media (max-width: 980px)");
  });
});
