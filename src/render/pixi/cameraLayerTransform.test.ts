import { describe, expect, it } from "vitest";
import type { CameraView } from "../model";
import {
  preparedCameraTransformMatchesDishPoint,
  resolvePreparedCameraLayerTransform,
  transformPreparedScreenPoint,
} from "./cameraLayerTransform";

const viewport = { width: 1120, height: 760 };

describe("prepared Pixi camera-layer transform", () => {
  it("is identity when the baked and current cameras match", () => {
    const camera: CameraView = {
      centerX: 0.45,
      centerY: 0.55,
      zoom: 2.5,
    };

    expect(
      resolvePreparedCameraLayerTransform(camera, camera, viewport),
    ).toEqual({ scale: 1, x: 0, y: 0 });
  });

  it("maps pure pan exactly without changing scale", () => {
    const baked: CameraView = {
      centerX: 0.5,
      centerY: 0.5,
      zoom: 3,
    };
    const current: CameraView = {
      centerX: 0.58,
      centerY: 0.43,
      zoom: 3,
    };

    const transform = resolvePreparedCameraLayerTransform(
      baked,
      current,
      viewport,
    );
    expect(transform.scale).toBe(1);

    for (const point of [
      { x: 0.1, y: 0.2 },
      { x: 0.5, y: 0.5 },
      { x: 0.88, y: 0.71 },
    ]) {
      expect(
        preparedCameraTransformMatchesDishPoint({
          point,
          bakedCamera: baked,
          currentCamera: current,
          viewport,
        }),
      ).toBe(true);
    }
  });

  it("maps zoom and combined pan+zoom exactly for normalized dish points", () => {
    const cases: readonly [CameraView, CameraView][] = [
      [
        { centerX: 0.5, centerY: 0.5, zoom: 1 },
        { centerX: 0.5, centerY: 0.5, zoom: 2.4 },
      ],
      [
        { centerX: 0.4, centerY: 0.6, zoom: 2.4 },
        { centerX: 0.62, centerY: 0.38, zoom: 6.5 },
      ],
      [
        { centerX: 0.52, centerY: 0.47, zoom: 7.4 },
        { centerX: 0.54, centerY: 0.45, zoom: 8.7 },
      ],
    ];

    for (const [baked, current] of cases) {
      for (const point of [
        { x: 0, y: 0 },
        { x: 0.25, y: 0.75 },
        { x: 0.5, y: 0.5 },
        { x: 1, y: 1 },
      ]) {
        expect(
          preparedCameraTransformMatchesDishPoint({
            point,
            bakedCamera: baked,
            currentCamera: current,
            viewport,
          }),
        ).toBe(true);
      }
    }
  });

  it("applies the resolved affine transform in parent-container order", () => {
    expect(
      transformPreparedScreenPoint(
        { x: 10, y: 20 },
        { scale: 2, x: 3, y: -4 },
      ),
    ).toEqual({ x: 23, y: 36 });
  });
});
