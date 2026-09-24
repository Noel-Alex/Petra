import type { LineageContrastMode } from "../design/lineageIdentity";

export type VisualContrastSetting = LineageContrastMode;

export const VISUAL_CONTRAST_STORAGE_KEY = "petra.visual-contrast.v1";

export interface VisualContrastStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export function parseVisualContrastSetting(
  value: string | null,
): VisualContrastSetting {
  return value === "high-contrast" ? "high-contrast" : "standard";
}

export function loadVisualContrastSetting(
  storage: Pick<VisualContrastStorage, "getItem">,
): VisualContrastSetting {
  return parseVisualContrastSetting(
    storage.getItem(VISUAL_CONTRAST_STORAGE_KEY),
  );
}

export function saveVisualContrastSetting(
  storage: Pick<VisualContrastStorage, "setItem">,
  setting: VisualContrastSetting,
): void {
  storage.setItem(VISUAL_CONTRAST_STORAGE_KEY, setting);
}
