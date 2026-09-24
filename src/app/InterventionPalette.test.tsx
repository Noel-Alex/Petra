import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { InterventionPalette } from "./InterventionPalette";

describe("InterventionPalette", () => {
  it("renders only the current intervention tools as accessible disabled actions", () => {
    const html = renderToStaticMarkup(
      <InterventionPalette motion="full" runtimeStatus="ready" />,
    );

    expect(html).toContain(
      'data-intervention-capability="authoritative-schema-unavailable"',
    );
    expect(html).toContain('data-intervention-tool="inoculate"');
    expect(html).toContain('data-intervention-tool="antibiotic"');
    expect(html).toContain('data-intervention-tool="nutrient"');
    expect(html).toContain(">Inoculate</button>");
    expect(html).toContain(">Antibiotic</button>");
    expect(html).toContain(">Nutrient</button>");
    expect(html).not.toContain(">Inspect</button>");
    expect(html.match(/ disabled=""/g)).toHaveLength(3);
    expect(html.match(/aria-describedby="/g)?.length).toBeGreaterThanOrEqual(4);
    expect(html).toContain('role="status"');
    expect(html).toContain("Petra will not substitute synthetic commands");
    expect(html).not.toMatch(/mg\/l|µg\/ml|dose|radius|concentration/i);
  });

  it("uses alert semantics for runtime failure without enabling tools", () => {
    const html = renderToStaticMarkup(
      <InterventionPalette motion="off" runtimeStatus="error" />,
    );

    expect(html).toContain('data-intervention-capability="runtime-error"');
    expect(html).toContain('role="alert"');
    expect(html.match(/ disabled=""/g)).toHaveLength(3);
  });

  it("mounts the fail-closed capability surface in the default app", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-intervention-capability="runtime-unavailable"');
    expect(html).toContain(
      "Authoritative simulation is not connected. Intervention tools remain unavailable.",
    );
    expect(html).not.toContain(
      "Controls are shell-only in this checkpoint",
    );
  });
});
