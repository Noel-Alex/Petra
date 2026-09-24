import { describe, expect, it } from "vitest";

import { resolveControlMotion } from "./controls";

describe("resolveControlMotion", () => {
  it("adds bounded hover and press motion only in full mode", () => {
    expect(resolveControlMotion("full", "hovered")).toEqual({
      durationMs: 120,
      translateYpx: -1,
      scale: 1.01,
      emphasized: false,
      interactive: true,
    });

    expect(resolveControlMotion("full", "pressed")).toEqual({
      durationMs: 120,
      translateYpx: 1,
      scale: 0.985,
      emphasized: true,
      interactive: true,
    });
  });

  it.each(["reduced", "off"] as const)(
    "collapses transforms in %s mode while preserving selected state",
    (preference) => {
      expect(resolveControlMotion(preference, "selected")).toEqual({
        durationMs: 0,
        translateYpx: 0,
        scale: 1,
        emphasized: true,
        interactive: true,
      });

      expect(resolveControlMotion(preference, "hovered")).toEqual({
        durationMs: 0,
        translateYpx: 0,
        scale: 1,
        emphasized: false,
        interactive: true,
      });
    },
  );

  it("never animates disabled controls", () => {
    expect(resolveControlMotion("full", "disabled")).toEqual({
      durationMs: 0,
      translateYpx: 0,
      scale: 1,
      emphasized: false,
      interactive: false,
    });
  });

  it("keeps selected emphasis independent from transform motion", () => {
    expect(resolveControlMotion("full", "selected")).toMatchObject({
      emphasized: true,
      translateYpx: 0,
      scale: 1,
    });
    expect(resolveControlMotion("off", "selected")).toMatchObject({
      emphasized: true,
      translateYpx: 0,
      scale: 1,
    });
  });
});
