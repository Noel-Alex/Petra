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
  readonly ariaDescribedBy?: string;
  /** Monotonic presentation-only request counter from the React shell. */
  readonly resetCameraSignal?: number;
  /** Explicit opt-in for the deterministic presentation-only fixture. */
  readonly demoMode?: boolean;
}

export function PixiDish({
  snapshot,
  motion = "full",
  cameraMotion,
  overlayId = null,
  className,
  ariaLabel,
  ariaDescribedBy,
  resetCameraSignal = 0,
  demoMode = false,
}: PixiDishProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiDishRenderer | null>(null);
  const motionRef = useRef(motion);
  const overlayRef = useRef(overlayId);
  const demoSnapshotRef = useRef<DishRenderSnapshot | null>(null);
  const resetCameraSignalRef = useRef(resetCameraSignal);

  const usingAuthoritative = snapshot !== null && snapshot !== undefined;
  const usingDemo = !usingAuthoritative && demoMode;
  if (usingDemo && demoSnapshotRef.current === null) {
    demoSnapshotRef.current = createRendererDemoSnapshot();
  }

  const renderSnapshot = usingAuthoritative
    ? snapshot
    : usingDemo
      ? demoSnapshotRef.current
      : null;
  const renderEnabled = renderSnapshot !== null;
  const snapshotRef = useRef<DishRenderSnapshot | null>(renderSnapshot);

  motionRef.current = motion;
  overlayRef.current = overlayId;
  snapshotRef.current = renderSnapshot;

  useEffect(() => {
    if (!renderEnabled) return;
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
      const currentSnapshot = snapshotRef.current;
      if (currentSnapshot !== null) renderer.update(currentSnapshot);
      renderer.setOverlay(overlayRef.current);
    });

    return () => {
      disposed = true;
      rendererRef.current = null;
      instance?.destroy();
    };
  }, [renderEnabled]);

  useEffect(() => {
    rendererRef.current?.setMotionMode(motion);
  }, [motion]);

  useEffect(() => {
    rendererRef.current?.setOverlay(overlayId);
  }, [overlayId]);

  useEffect(() => {
    if (resetCameraSignal === resetCameraSignalRef.current) return;
    resetCameraSignalRef.current = resetCameraSignal;
    rendererRef.current?.resetCamera();
  }, [resetCameraSignal]);

  useEffect(() => {
    snapshotRef.current = renderSnapshot;
    if (renderSnapshot !== null) rendererRef.current?.update(renderSnapshot);
  }, [renderSnapshot]);

  const source = usingAuthoritative
    ? "authoritative-snapshot"
    : usingDemo
      ? "visual-demo"
      : "awaiting-authoritative-snapshot";

  const resolvedAriaLabel =
    ariaLabel ??
    (usingAuthoritative
      ? "Interactive Petra dish renderer"
      : usingDemo
        ? "Interactive Petra dish renderer using visual demonstration data, not simulation data"
        : "Petra dish waiting for authoritative simulation data");

  return (
    <div
      className={className}
      data-render-source={source}
      style={{
        width: "100%",
        height: "100%",
        minHeight: "20rem",
        position: "relative",
        overflow: "hidden",
        borderRadius: "inherit",
      }}
    >
      <div
        ref={hostRef}
        role="region"
        tabIndex={renderEnabled ? 0 : -1}
        aria-roledescription="interactive Petri dish"
        aria-describedby={ariaDescribedBy}
        aria-label={resolvedAriaLabel}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          touchAction: renderEnabled ? "none" : "auto",
        }}
      >
        {!renderEnabled ? (
          <span
            data-render-empty="true"
            style={{
              maxWidth: "18rem",
              padding: "0.85rem 1rem",
              textAlign: "center",
              lineHeight: 1.45,
              color: "rgba(226, 235, 246, 0.72)",
            }}
          >
            Waiting for authoritative simulation data
          </span>
        ) : null}
      </div>
      {usingDemo ? (
        <div
          data-render-demo-disclosure="true"
          role="note"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "0.8rem",
            zIndex: 2,
            transform: "translateX(-50%)",
            maxWidth: "calc(100% - 1.6rem)",
            padding: "0.42rem 0.68rem",
            border: "1px solid rgba(242, 202, 104, 0.34)",
            borderRadius: "999px",
            background: "rgba(5, 13, 25, 0.86)",
            color: "#f2d98e",
            fontSize: "0.7rem",
            fontWeight: 700,
            letterSpacing: "0.04em",
            textAlign: "center",
            whiteSpace: "nowrap",
          }}
        >
          Visual demo — not simulation data
        </div>
      ) : null}
    </div>
  );
}
