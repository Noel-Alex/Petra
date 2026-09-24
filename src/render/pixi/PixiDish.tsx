import { useEffect, useRef } from "react";
import type { DishRenderSnapshot } from "../model";
import { createRendererDemoSnapshot } from "./demoSnapshot";
import {
  createPixiDishRenderer,
  type PixiDishRenderer,
  type RendererMotionMode,
} from "./renderer";

export interface PixiDishProps {
  readonly snapshot?: DishRenderSnapshot | null;
  readonly motion?: RendererMotionMode;
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
  overlayId = null,
  className,
  ariaLabel,
}: PixiDishProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiDishRenderer | null>(null);
  const demoSnapshotRef = useRef<DishRenderSnapshot | null>(null);
  if (demoSnapshotRef.current === null) {
    demoSnapshotRef.current = createRendererDemoSnapshot();
  }
  const snapshotRef = useRef<DishRenderSnapshot>(
    snapshot ?? demoSnapshotRef.current,
  );

  snapshotRef.current = snapshot ?? snapshotRef.current;

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let disposed = false;
    let instance: PixiDishRenderer | null = null;

    void createPixiDishRenderer(host, { motion, overlayId }).then((renderer) => {
      if (disposed) {
        renderer.destroy();
        return;
      }

      instance = renderer;
      rendererRef.current = renderer;
      renderer.update(snapshotRef.current);
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
    if (snapshot === null || snapshot === undefined) return;
    snapshotRef.current = snapshot;
    rendererRef.current?.update(snapshot);
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
