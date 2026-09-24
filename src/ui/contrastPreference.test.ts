import { describe, expect, it } from "vitest";

import {
  loadVisualContrastSetting,
  parseVisualContrastSetting,
  saveVisualContrastSetting,
  VISUAL_CONTRAST_STORAGE_KEY,
} from "./contrastPreference";

describe("visual contrast preference", () => {
  it("defaults unknown or missing values to standard contrast", () => {
    expect(parseVisualContrastSetting(null)).toBe("standard");
    expect(parseVisualContrastSetting("extreme")).toBe("standard");
    expect(parseVisualContrastSetting("high-contrast")).toBe("high-contrast");
  });

  it("persists independently from motion settings", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => {
        values.set(key, value);
      },
    };

    saveVisualContrastSetting(storage, "high-contrast");
    expect(values.get(VISUAL_CONTRAST_STORAGE_KEY)).toBe("high-contrast");
    expect(loadVisualContrastSetting(storage)).toBe("high-contrast");
  });
});
