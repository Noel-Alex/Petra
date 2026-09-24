import {
  resolveMotionPreference,
  type MotionPreference,
} from "./policy";

export type MotionSetting = "system" | MotionPreference;

export const MOTION_SETTING_STORAGE_KEY = "petra.motion-setting.v1";

export interface MotionSettingStorage {
  readonly getItem: (key: string) => string | null;
  readonly setItem: (key: string, value: string) => void;
}

export function parseMotionSetting(value: string | null): MotionSetting {
  if (
    value === "system" ||
    value === "full" ||
    value === "reduced" ||
    value === "off"
  ) {
    return value;
  }

  return "system";
}

export function loadMotionSetting(
  storage: Pick<MotionSettingStorage, "getItem">,
): MotionSetting {
  return parseMotionSetting(storage.getItem(MOTION_SETTING_STORAGE_KEY));
}

export function saveMotionSetting(
  storage: Pick<MotionSettingStorage, "setItem">,
  setting: MotionSetting,
): void {
  storage.setItem(MOTION_SETTING_STORAGE_KEY, setting);
}

export function resolveMotionSetting(args: {
  readonly setting: MotionSetting;
  readonly prefersReducedMotion: boolean;
}): MotionPreference {
  return resolveMotionPreference({
    explicit: args.setting === "system" ? undefined : args.setting,
    prefersReducedMotion: args.prefersReducedMotion,
  });
}
