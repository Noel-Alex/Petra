import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ExperimentRuntimeView } from "./runtimeView";
import { ExperimentRunControls } from "./ExperimentRunControls";

// Vite resolves raw modules in Vitest; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw source import is runtime-supported but not declared in tsconfig types.
import source from "./ExperimentRunControls.tsx?raw";

function view(
  overrides: Partial<ExperimentRuntimeView["runControls"]> = {},
): ExperimentRuntimeView {
  return {
    status: "ready",
    statusText: "Simulation ready",
    statusRole: "status",
    workerPhase: "ready",
    playing: false,
    speed: 1,
    canTogglePlayback: true,
    canChangeSpeed: true,
    simulationTimeLabel: "Simulation time 0.00 h",
    timeline: [],
    error: null,
    runControls: {
      seed: 42,
      acceptedCommandCount: 0,
      canStep: true,
      canReset: true,
      canReplay: false,
      canSetSeed: true,
      ...overrides,
    },
  };
}

describe("ExperimentRunControls", () => {
  it("renders an honest disabled no-authority state without inventing a seed", () => {
    const unavailable: ExperimentRuntimeView = {
      ...view({
        seed: null,
        acceptedCommandCount: 0,
        canStep: false,
        canReset: false,
        canReplay: false,
        canSetSeed: false,
      }),
      status: "unavailable",
      statusText: "Authoritative simulation not connected",
      workerPhase: null,
      canTogglePlayback: false,
      canChangeSpeed: false,
    };

    const html = renderToStaticMarkup(
      <ExperimentRunControls
        motion="off"
        view={unavailable}
        dispatch={() => null}
      />,
    );

    expect(html).toContain('aria-label="Run controls"');
    expect(html).toContain('data-run-controls-status="unavailable"');
    expect(html).toContain("Seed —");
    expect(html).toContain('aria-keyshortcuts="."');
    expect(html).toContain('min="0"');
    expect(html).toContain('max="4294967295"');
    expect(html).toContain('step="1"');
    expect(html).toContain("New seed run");
  });

  it("shows current seed and accepted replay history from runtime projection", () => {
    const html = renderToStaticMarkup(
      <ExperimentRunControls
        motion="off"
        view={view({ acceptedCommandCount: 2, canReplay: true })}
        dispatch={() => ({ accepted: true, reason: null })}
      />,
    );

    expect(html).toContain('value="42"');
    expect(html).toContain("Replay history 2 accepted commands");
    expect(html).toContain("Reset keeps this seed");
  });

  it("routes effects through typed dispatch instead of constructing worker requests", () => {
    expect(source).toContain('dispatchAction({ type: "step", ticks: 1 })');
    expect(source).toContain('dispatchAction({ type: "reset" })');
    expect(source).toContain('dispatchAction({ type: "replay" })');
    expect(source).toContain('dispatchAction({ type: "set-seed", seed: parsed.seed })');
    expect(source).not.toContain("WorkerRequest");
    expect(source).not.toContain("protocolVersion");
  });
});
