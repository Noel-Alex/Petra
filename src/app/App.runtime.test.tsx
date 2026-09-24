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

  it("mounts the conflict-safe app keyboard planner at the root", () => {
    expect(appSource).toMatch(
      /onKeyDown=\{\(event\) => \{[\s\S]*planAppKeyboardShortcut\(\{/,
    );
    expect(appSource).toContain("canDispatchAppShortcut(plan.action");
    expect(appSource).toContain("experiment.dispatch(plan.action)");
    expect(appSource).not.toContain("shouldCloseSourcesOnEscape({");
  });
});
