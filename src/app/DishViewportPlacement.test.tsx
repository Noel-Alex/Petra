import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { beginInterventionPlacement, createInterventionPlacementState } from "../ui/interventionPlacement";
import { DishViewport } from "./DishViewport";

describe("DishViewport localized placement", () => {
  it("renders the presentation target and placement-specific interaction guidance", () => {
    const placement = beginInterventionPlacement(
      createInterventionPlacementState(),
      "antibiotic",
    );

    const html = renderToStaticMarkup(
      <DishViewport
        motion="reduced"
        snapshot={null}
        placement={{ ...placement, point: { x: 0.62, y: 0.43 } }}
      />,
    );

    expect(html).toContain('data-intervention-placement="antibiotic"');
    expect(html).toContain("Placement preview: move or tap the target");
    expect(html).toContain("The target ring is presentation-only");
    expect(html).toContain("waiting for authority");
  });

  it("does not mount the placement target when the tool is idle", () => {
    const html = renderToStaticMarkup(
      <DishViewport
        motion="off"
        snapshot={null}
        placement={createInterventionPlacementState()}
      />,
    );

    expect(html).not.toContain("data-intervention-placement=");
    expect(html).toContain("Pointer: wheel to zoom");
  });
});
