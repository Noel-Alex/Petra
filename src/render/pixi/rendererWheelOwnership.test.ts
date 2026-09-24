import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(new URL("./renderer.ts", import.meta.url), "utf8");

describe("renderer wheel ownership source contract", () => {
  it("admits aperture and meaningful target change before preventing browser scroll", () => {
    const wheelStart = SOURCE.indexOf(
      "const onWheel = (event: WheelEvent) => {",
    );
    const wheelEnd = SOURCE.indexOf(
      "const onDoubleClick = (event: MouseEvent) => {",
      wheelStart,
    );
    expect(wheelStart).toBeGreaterThanOrEqual(0);
    expect(wheelEnd).toBeGreaterThan(wheelStart);

    const wheelSource = SOURCE.slice(wheelStart, wheelEnd);
    const apertureIndex = wheelSource.indexOf(
      "isScreenPointInsideDishAperture(screen, viewport)",
    );
    const factorIndex = wheelSource.indexOf("wheelZoomFactor({");
    const ownershipIndex = wheelSource.indexOf(
      "wheelZoomWouldChangePendingTarget(state, factor)",
    );
    const preventIndex = wheelSource.indexOf("event.preventDefault()");

    expect(apertureIndex).toBeGreaterThanOrEqual(0);
    expect(factorIndex).toBeGreaterThan(apertureIndex);
    expect(ownershipIndex).toBeGreaterThan(factorIndex);
    expect(preventIndex).toBeGreaterThan(ownershipIndex);
  });
});
