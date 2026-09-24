import { describe, expect, it } from "vitest";

import { resolveDishFocusMode } from "./dishFocusMode";

describe("dish focus-mode policy", () => {
  it("focuses only while authoritative playback is actively running", () => {
    expect(resolveDishFocusMode({ status: "ready", playing: true })).toBe("focused");
    expect(resolveDishFocusMode({ status: "pending", playing: true })).toBe("focused");
  });

  it("does not flicker when a running request moves between ready and pending", () => {
    const phases = ["ready", "pending", "ready"] as const;
    expect(phases.map((status) => resolveDishFocusMode({ status, playing: true }))).toEqual([
      "focused",
      "focused",
      "focused",
    ]);
  });

  it("keeps idle, unavailable, starting, and error chrome ambient", () => {
    expect(resolveDishFocusMode({ status: "ready", playing: false })).toBe("ambient");
    expect(resolveDishFocusMode({ status: "pending", playing: false })).toBe("ambient");
    expect(resolveDishFocusMode({ status: "unavailable", playing: true })).toBe("ambient");
    expect(resolveDishFocusMode({ status: "starting", playing: true })).toBe("ambient");
    expect(resolveDishFocusMode({ status: "error", playing: true })).toBe("ambient");
  });
});
