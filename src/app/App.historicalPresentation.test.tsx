import { describe, expect, it } from "vitest";

// Vite resolves raw modules in Vitest; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw source import is runtime-supported but not declared in tsconfig types.
import appSource from "./App.tsx?raw";

describe("App historical presentation integration", () => {
  it("binds scrub history to runtime branch authority without Worker rewind", () => {
    expect(appSource).toContain(
      "new RuntimeHistoricalPresentationHistory(runBranchIdentity)",
    );
    expect(appSource).toContain(
      "(createdForBranch || !experiment.view.playing)",
    );
    expect(appSource).toContain('dishMotion: "snap-to-authority"');
    expect(appSource).toContain("<HistoricalScrubControl");
    expect(appSource).toContain("setHistoricalCommandPosition(null)");
    expect(appSource).not.toContain(
      "experiment.restoreCheckpoint(historical",
    );
  });

  it("fails closed for cross-position scientific presentation", () => {
    expect(appSource).toContain(
      "historicalRegionInspectorState(",
    );
    expect(appSource).toContain(
      "historicalPresentation === null ? analysisRecords : null",
    );
    expect(appSource).toContain(
      "historicalSimulationTimeLabel(historicalPresentation)",
    );
    expect(appSource).toContain(
      "setRegionInspectionRequest(null);",
    );
    expect(appSource).toContain(
      'snapshot={visibleDishSnapshot}',
    );
  });
});
