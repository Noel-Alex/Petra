import { describe, expect, it } from "vitest";

import {
  loadMotionSetting,
  MOTION_SETTING_STORAGE_KEY,
  parseMotionSetting,
  resolveMotionSetting,
  saveMotionSetting,
} from "./preference";

describe("motion setting", () => {
  it("falls back to system for missing or invalid persisted values", () => {
    expect(parseMotionSetting(null)).toBe("system");
    expect(parseMotionSetting("turbo")).toBe("system");
  });

  it("respects OS reduced motion only when the setting is system", () => {
    expect(
      resolveMotionSetting({ setting: "system", prefersReducedMotion: true }),
    ).toBe("reduced");
    expect(
      resolveMotionSetting({ setting: "full", prefersReducedMotion: true }),
    ).toBe("full");
    expect(
      resolveMotionSetting({ setting: "off", prefersReducedMotion: false }),
    ).toBe("off");
  });

  it("loads and saves through a storage-shaped adapter", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };

    saveMotionSetting(storage, "reduced");
    expect(values.get(MOTION_SETTING_STORAGE_KEY)).toBe("reduced");
    expect(loadMotionSetting(storage)).toBe("reduced");
  });
});
