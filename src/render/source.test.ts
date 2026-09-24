import { describe, expect, it } from "vitest";

import { createRendererDemoSnapshot } from "./pixi/demoSnapshot";
import { assertDishRenderSourceSnapshot } from "./source";

describe("dish render-source identity", () => {
  it("accepts coherent authoritative, visual-demo and waiting transactions", () => {
    const snapshot = createRendererDemoSnapshot(12);

    expect(() =>
      assertDishRenderSourceSnapshot("authoritative-snapshot", snapshot),
    ).not.toThrow();
    expect(() =>
      assertDishRenderSourceSnapshot("visual-demo", snapshot),
    ).not.toThrow();
    expect(() =>
      assertDishRenderSourceSnapshot("awaiting-authoritative-snapshot", null),
    ).not.toThrow();
  });

  it("does not infer authority from snapshot presence", () => {
    const snapshot = createRendererDemoSnapshot(12);

    expect(() =>
      assertDishRenderSourceSnapshot(
        "awaiting-authoritative-snapshot",
        snapshot,
      ),
    ).toThrow(/requires a null render snapshot/);
  });

  it("requires an explicit snapshot for both active source identities", () => {
    expect(() =>
      assertDishRenderSourceSnapshot("authoritative-snapshot", null),
    ).toThrow(/requires an explicit render snapshot transaction/);
    expect(() =>
      assertDishRenderSourceSnapshot("visual-demo", null),
    ).toThrow(/requires an explicit render snapshot transaction/);
  });
});
