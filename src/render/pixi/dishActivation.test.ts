import { describe, expect, it } from "vitest";

import { resolveDishViewportGeometry } from "./camera";
import { resolveDishActivationPoint } from "./dishActivation";

describe("dish activation geometry", () => {
  const viewport = { width: 800, height: 600 };
  const geometry = resolveDishViewportGeometry(viewport);

  it("maps an overview click through the shared dish aperture", () => {
    expect(
      resolveDishActivationPoint({
        start: { x: geometry.centerX, y: geometry.centerY },
        end: { x: geometry.centerX, y: geometry.centerY },
        viewport,
        camera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      }),
    ).toEqual({ x: 0.5, y: 0.5 });
  });

  it("uses the live camera transform when zoomed and panned", () => {
    const point = resolveDishActivationPoint({
      start: { x: geometry.centerX, y: geometry.centerY },
      end: { x: geometry.centerX, y: geometry.centerY },
      viewport,
      camera: { centerX: 0.7, centerY: 0.3, zoom: 4 },
    });

    expect(point?.x).toBeCloseTo(0.7, 12);
    expect(point?.y).toBeCloseTo(0.3, 12);
  });

  it("rejects drags and points outside the visible circular aperture", () => {
    expect(
      resolveDishActivationPoint({
        start: { x: geometry.centerX, y: geometry.centerY },
        end: { x: geometry.centerX + 20, y: geometry.centerY },
        viewport,
        camera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      }),
    ).toBeNull();

    expect(
      resolveDishActivationPoint({
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        viewport,
        camera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      }),
    ).toBeNull();
  });
});
