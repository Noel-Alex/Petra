import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

// Vite resolves raw modules in Vitest; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw source import is runtime-supported but not declared in tsconfig types.
import appSource from "./App.tsx?raw";

describe("App authoritative runtime boundary", () => {
  it("does not invent or auto-connect simulation authority by default", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("Authoritative simulation not connected");
    expect(html).toContain("Simulation time —");
    expect(html).toContain("No authoritative events yet");
    expect(html).not.toContain("00:00 simulation time");
    expect(html).toContain('id="petra-sources-trigger"');
    expect(html).toContain('aria-controls="petra-sources-panel"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('data-intervention-capability="runtime-unavailable"');
    expect(html).toContain(
      "Authoritative simulation is not connected. Intervention tools remain unavailable.",
    );
    expect(html).not.toContain("Controls are shell-only in this checkpoint");
    expect(html).toContain('aria-keyshortcuts="Space"');
    expect(html).toContain('aria-keyshortcuts="1"');
    expect(html).toContain('aria-keyshortcuts="2"');
    expect(html).toContain('aria-keyshortcuts="3"');
  });

  it("checks runtime availability before dispatching global shortcuts", () => {
    const gateIndex = appSource.indexOf("canDispatchAppShortcut(plan.action");
    const dispatchIndex = appSource.indexOf("experiment.dispatch(plan.action)");

    expect(gateIndex).toBeGreaterThan(-1);
    expect(dispatchIndex).toBeGreaterThan(gateIndex);
    expect(appSource).toContain('canStep: experiment.view.status === "ready"');
  });
});
