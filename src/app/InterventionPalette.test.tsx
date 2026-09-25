import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { createInterventionPlacementState, beginInterventionPlacement } from "../ui/interventionPlacement";
import { App } from "./App";
import { InterventionPalette } from "./InterventionPalette";

describe("InterventionPalette", () => {
  it("offers placement-only tools when runtime is ready while scientific Apply stays locked", () => {
    const html = renderToStaticMarkup(
      <InterventionPalette
        motion="full"
        runtimeStatus="ready"
        placement={createInterventionPlacementState()}
      />,
    );

    expect(html).toContain(
      'data-intervention-capability="authoritative-metadata-unavailable"',
    );
    expect(html).toContain('data-intervention-tool="inoculate"');
    expect(html).toContain('data-intervention-tool="fungus"');
    expect(html).toContain('data-intervention-tool="antibiotic"');
    expect(html).toContain('data-intervention-tool="nutrient"');
    expect(html.match(/class="intervention-illustration"/g)).toHaveLength(4);
    expect(html).toContain("Add population");
    expect(html).toContain("Bacteria and other microbes");
    expect(html).toContain("Add fungi");
    expect(html).toContain("Yeasts and filamentous fungi");
    expect(html).toContain("Add medicine");
    expect(html).toContain("Antibiotics and antifungals");
    expect(html).toContain("Add nutrient");
    expect(html).toContain("Change the environment");
    expect(html).not.toContain("place preview");
    expect(html).not.toContain(">Inspect</button>");
    expect(html).not.toContain(' disabled=""');
    expect(html).toContain('role="status"');
    expect(html).toContain("Protocol v5 supports authoritative ciprofloxacin application");
    expect(html).not.toMatch(/mg\/l|µg\/ml|dose|concentration/i);
  });

  it("shows keyboard-equivalent coordinates and a disabled Apply gate while placing", () => {
    const placement = beginInterventionPlacement(
      createInterventionPlacementState(),
      "fungus",
    );
    const html = renderToStaticMarkup(
      <InterventionPalette
        motion="reduced"
        runtimeStatus="ready"
        placement={{ ...placement, point: { x: 0.35, y: 0.62 } }}
      />,
    );

    expect(html).toContain('data-placement-active="true"');
    expect(html).toContain("Add fungi target");
    expect(html).toContain("Preview only");
    expect(html).toContain('aria-label="Horizontal dish target position"');
    expect(html).toContain('value="35"');
    expect(html).toContain('aria-label="Vertical dish target position"');
    expect(html).toContain('value="62"');
    expect(html).toContain("visual cursor, not a predicted biological footprint");
    expect(html).toContain("Apply unavailable");
    expect(html).toContain(' disabled=""');
  });

  it("uses alert semantics and disables placement tools for runtime failure", () => {
    const html = renderToStaticMarkup(
      <InterventionPalette
        motion="off"
        runtimeStatus="error"
        placement={createInterventionPlacementState()}
      />,
    );

    expect(html).toContain('data-intervention-capability="runtime-error"');
    expect(html).toContain('role="alert"');
    expect(html.match(/ disabled=""/g)).toHaveLength(4);
  });

  it("mounts the fail-closed capability surface in the default app", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-intervention-capability="runtime-unavailable"');
    expect(html).toContain(
      "Authoritative simulation is not connected. Intervention tools remain unavailable.",
    );
    expect(html).toContain('data-intervention-tool="fungus"');
    expect(html).toContain('aria-label="Display preferences"');
    expect(html).toContain("No colony selected");
    expect(html).toContain('data-analysis-status="unavailable"');
    expect(html).not.toContain(
      "Controls are shell-only in this checkpoint",
    );
  });
});
