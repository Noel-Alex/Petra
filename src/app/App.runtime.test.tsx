import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { App } from "./App";

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
  });
});
