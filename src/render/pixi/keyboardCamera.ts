import type { CameraView } from "../model";
import { panCamera, zoomAroundDishPoint, type ViewportSize } from "./camera";

export type KeyboardCameraKey =
  | "ArrowLeft"
  | "ArrowRight"
  | "ArrowUp"
  | "ArrowDown"
  | "+"
  | "="
  | "-"
  | "_"
  | "Home"
  | "0";

export interface KeyboardCameraResult {
  readonly handled: boolean;
  readonly camera: CameraView;
}

export interface KeyboardCameraModifiers {
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
}

export function keyboardCameraModifiersAllowInput(
  modifiers: KeyboardCameraModifiers,
): boolean {
  return !modifiers.altKey && !modifiers.ctrlKey && !modifiers.metaKey;
}

const PAN_FRACTION = 0.09;
const ZOOM_IN_FACTOR = 1.28;
const ZOOM_OUT_FACTOR = 1 / ZOOM_IN_FACTOR;

export function applyKeyboardCameraKey(
  camera: CameraView,
  key: string,
  viewport: ViewportSize,
): KeyboardCameraResult {
  const span = Math.min(viewport.width, viewport.height) * PAN_FRACTION;

  switch (key as KeyboardCameraKey) {
    case "ArrowLeft":
      return { handled: true, camera: panCamera(camera, { x: span, y: 0 }, viewport) };
    case "ArrowRight":
      return { handled: true, camera: panCamera(camera, { x: -span, y: 0 }, viewport) };
    case "ArrowUp":
      return { handled: true, camera: panCamera(camera, { x: 0, y: span }, viewport) };
    case "ArrowDown":
      return { handled: true, camera: panCamera(camera, { x: 0, y: -span }, viewport) };
    case "+":
    case "=":
      return {
        handled: true,
        camera: zoomAroundDishPoint(camera, { x: camera.centerX, y: camera.centerY }, ZOOM_IN_FACTOR),
      };
    case "-":
    case "_":
      return {
        handled: true,
        camera: zoomAroundDishPoint(camera, { x: camera.centerX, y: camera.centerY }, ZOOM_OUT_FACTOR),
      };
    case "Home":
    case "0":
      return {
        handled: true,
        camera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
      };
    default:
      return { handled: false, camera };
  }
}
