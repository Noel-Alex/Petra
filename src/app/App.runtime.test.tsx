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
    expect(html).toContain("Waiting for authoritative simulation data");
    expect(html).toContain("awaiting authoritative state");
    expect(html).not.toContain("visual demo · not biology");
    expect(html).not.toContain("Visual demo — not simulation data");
    expect(html).not.toContain('aria-label="Petri dish overlay"');
  });
});
