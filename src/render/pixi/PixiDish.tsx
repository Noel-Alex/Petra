import { useEffect, useRef } from "react";
import type { DishRenderSnapshot } from "../model";
import type { CameraMotionSpec } from "./cameraMotion";
import { createRendererDemoSnapshot } from "./demoSnapshot";
import {
  createPixiDishRenderer,
  type PixiDishRenderer,
  type RendererMotionMode,
} from "./renderer";

export interface PixiDishProps {
  readonly snapshot?: DishRenderSnapshot | null;
  readonly motion?: RendererMotionMode;
  readonly cameraMotion: CameraMotionSpec;
  readonly overlayId?: string | null;
  readonly className?: string;
  readonly ariaLabel?: string;
}

/**
 * React owns lifecycle/accessibility; Pixi owns only the canvas presentation.
 * When snapshot is absent this mounts an explicitly visual-only fixture so the
 * scene can be reviewed independently of worker integration.
 */
export function PixiDish({
  snapshot,
  motion = "full",
  cameraMotion,
  overlayId = null,
  className,
  ariaLabel,
}: PixiDishProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiDishRenderer | null>(null);
  const motionRef = useRef(motion);
  const overlayRef = useRef(overlayId);
  const demoSnapshotRef = useRef<DishRenderSnapshot | null>(null);
  if (demoSnapshotRef.current === null) {
    demoSnapshotRef.current = createRendererDemoSnapshot();
  }
  const snapshotRef = useRef<DishRenderSnapshot>(
    snapshot ?? demoSnapshotRef.current,
  );

  motionRef.current = motion;
  overlayRef.current = overlayId;
  snapshotRef.current = snapshot ?? demoSnapshotRef.current;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let disposed = false;
    let instance: PixiDishRenderer | null = null;

    void createPixiDishRenderer(host, { motion, cameraMotion, overlayId }).then((renderer) => {
      if (disposed) {
        renderer.destroy();
        return;
      }

      instance = renderer;
      rendererRef.current = renderer;
      renderer.setMotionMode(motionRef.current);
      renderer.update(snapshotRef.current);
      renderer.setOverlay(overlayRef.current);
    });

    return () => {
      disposed = true;
      rendererRef.current = null;
      instance?.destroy();
    };
  }, []);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    renderer.setMotionMode(motion);
  }, [motion]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    renderer.setOverlay(overlayId);
  }, [overlayId]);

  useEffect(() => {
    const nextSnapshot = snapshot ?? demoSnapshotRef.current;
    snapshotRef.current = nextSnapshot;
    rendererRef.current?.update(nextSnapshot);
  }, [snapshot]);

  const usingDemo = snapshot === null || snapshot === undefined;

  return (
    <div
      ref={hostRef}
      className={className}
      data-render-source={usingDemo ? "visual-demo" : "authoritative-snapshot"}
      role="img"
      aria-label={
        ariaLabel ??
        (usingDemo
          ? "Interactive Petra dish renderer using visual demonstration data"
          : "Interactive Petra dish renderer")
      }
      style={{
        width: "100%",
        height: "100%",
        minHeight: "20rem",
        touchAction: "none",
        overflow: "hidden",
        borderRadius: "inherit",
      }}
    />
  );
}
