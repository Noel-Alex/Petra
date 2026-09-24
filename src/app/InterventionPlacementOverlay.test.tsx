import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { clientPointToDishPlacement, InterventionPlacementOverlay } from "./InterventionPlacementOverlay";

describe("InterventionPlacementOverlay", () => {
  it("maps the renderer aperture center to normalized dish center", () => {
    expect(
      clientPointToDishPlacement(
        { x: 150, y: 100 },
        { left: 50, top: 0, width: 200, height: 200 },
      ),
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it("shares the renderer circular aperture and ignores pointer coordinates outside it", () => {
    expect(
      clientPointToDishPlacement(
        { x: 0, y: 0 },
        { left: 0, top: 0, width: 200, height: 200 },
      ),
    ).toBeNull();

    const rightRim = clientPointToDishPlacement(
      { x: 193, y: 100 },
      { left: 0, top: 0, width: 200, height: 200 },
    );
    expect(rightRim?.x).toBeCloseTo(1, 12);
    expect(rightRim?.y).toBeCloseTo(0.5, 12);
  });

  it("renders calm code-generated tool geometry instead of an image asset", () => {
    const html = renderToStaticMarkup(
      <InterventionPlacementOverlay
        tool="fungus"
        point={{ x: 0.35, y: 0.62 }}
        motion="reduced"
      />,
    );

    expect(html).toContain('data-intervention-placement="fungus"');
    expect(html).toContain('data-motion="reduced"');
    expect(html).toContain("<svg");
    expect(html).toContain("<path");
    expect(html).not.toMatch(/<img|background-image|url\(/i);
  });
});
