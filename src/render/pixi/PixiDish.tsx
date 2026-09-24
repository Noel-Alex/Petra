import { useEffect, useId, useRef, useState } from "react";
import { PetraCompactAction } from "../../ui/PetraCompactAction";
import type { DishRenderSnapshot, SemanticZoomLevel } from "../model";
import type { CameraMotionSpec } from "./cameraMotion";
import { createRendererDemoSnapshot } from "./demoSnapshot";
import {
  createPixiDishRenderer,
  type PixiDishRenderer,
  type RendererMotionMode,
} from "./renderer";
import { beginRendererInitialization } from "./rendererLifecycle";

import "./PixiDish.css";

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
  readonly onSemanticZoomLevelChange?: (level: SemanticZoomLevel) => void;
  /** Explicit opt-in for the deterministic presentation-only fixture. */
  readonly demoMode?: boolean;
}

export type RendererStartupStatus = "idle" | "initializing" | "ready" | "failed";

interface RendererStartupState {
  readonly status: RendererStartupStatus;
  readonly errorMessage: string | null;
}

const IDLE_STARTUP: RendererStartupState = {
  status: "idle",
  errorMessage: null,
};

export function PixiDish({
  snapshot,
  motion = "full",
  cameraMotion,
  overlayId = null,
  className,
  ariaLabel,
  ariaDescribedBy,
  resetCameraSignal = 0,
  onSemanticZoomLevelChange,
  demoMode = false,
}: PixiDishProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiDishRenderer | null>(null);
  const motionRef = useRef(motion);
  const cameraMotionRef = useRef(cameraMotion);
  const overlayRef = useRef(overlayId);
  const semanticZoomCallbackRef = useRef(onSemanticZoomLevelChange);
  const demoSnapshotRef = useRef<DishRenderSnapshot | null>(null);
  const resetCameraSignalRef = useRef(resetCameraSignal);
  const [startup, setStartup] = useState<RendererStartupState>(IDLE_STARTUP);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const failureDescriptionId = useId();

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
  cameraMotionRef.current = cameraMotion;
  overlayRef.current = overlayId;
  semanticZoomCallbackRef.current = onSemanticZoomLevelChange;
  snapshotRef.current = renderSnapshot;

  useEffect(() => {
    if (!renderEnabled) {
      rendererRef.current = null;
      setStartup(IDLE_STARTUP);
      return;
    }

    const host = hostRef.current;
    if (host === null) return;

    rendererRef.current = null;
    host.replaceChildren();
    setStartup({ status: "initializing", errorMessage: null });

    const lifecycle = beginRendererInitialization(
      () =>
        createPixiDishRenderer(host, {
          motion,
          cameraMotion,
          overlayId,
          onSemanticZoomLevelChange(level) {
            semanticZoomCallbackRef.current?.(level);
          },
        }),
      {
        onReady(renderer) {
          rendererRef.current = renderer;
          renderer.setCameraMotion(cameraMotionRef.current);
          renderer.setMotionMode(motionRef.current);
          const currentSnapshot = snapshotRef.current;
          if (currentSnapshot !== null) {
            renderer.updatePresentation(currentSnapshot, overlayRef.current);
          }
          setStartup({ status: "ready", errorMessage: null });
        },
        onError(error) {
          rendererRef.current = null;
          host.replaceChildren();
          setStartup({ status: "failed", errorMessage: error.message });
        },
      },
    );

    return () => {
      rendererRef.current = null;
      lifecycle.dispose();
    };
  }, [renderEnabled, retryAttempt]);

  useEffect(() => {
    const renderer = rendererRef.current;
    if (renderer === null) return;
    renderer.setCameraMotion(cameraMotion);
    renderer.setMotionMode(motion);
  }, [cameraMotion, motion]);

  useEffect(() => {
    if (resetCameraSignal === resetCameraSignalRef.current) return;
    resetCameraSignalRef.current = resetCameraSignal;
    rendererRef.current?.resetCamera();
  }, [resetCameraSignal]);

  useEffect(() => {
    snapshotRef.current = renderSnapshot;
    overlayRef.current = overlayId;
    if (renderSnapshot !== null) {
      rendererRef.current?.updatePresentation(renderSnapshot, overlayId);
    }
  }, [renderSnapshot, overlayId]);

  const source = usingAuthoritative
    ? "authoritative-snapshot"
    : usingDemo
      ? "visual-demo"
      : "awaiting-authoritative-snapshot";

  const resolvedAriaLabel =
    startup.status === "failed"
      ? "Petra dish renderer unavailable"
      : ariaLabel ??
        (usingAuthoritative
          ? "Interactive Petra dish renderer"
          : usingDemo
            ? "Interactive Petra dish renderer using visual demonstration data, not simulation data"
            : "Petra dish waiting for authoritative simulation data");

  const rendererInteractive = renderEnabled && startup.status === "ready";

  return (
    <div
      className={className}
      data-render-source={source}
      data-render-status={startup.status}
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
        tabIndex={rendererInteractive ? 0 : -1}
        aria-roledescription="interactive Petri dish"
        aria-describedby={ariaDescribedBy}
        aria-label={resolvedAriaLabel}
        aria-busy={renderEnabled && startup.status === "initializing"}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          touchAction: rendererInteractive ? "none" : "auto",
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

      {renderEnabled && startup.status === "failed" ? (
        <RendererFailureFallback
          errorMessage={startup.errorMessage}
          descriptionId={failureDescriptionId}
          motionPreference={motion}
          onRetry={() => setRetryAttempt((attempt) => attempt + 1)}
        />
      ) : null}

      <span
        data-render-status-announcement="true"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{
          position: "absolute",
          width: "1px",
          height: "1px",
          padding: 0,
          margin: "-1px",
          overflow: "hidden",
          clip: "rect(0, 0, 0, 0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {rendererStartupAnnouncement(startup.status)}
      </span>

      {usingDemo ? (
        <div
          data-render-demo-disclosure="true"
          role="note"
          style={{
            position: "absolute",
            left: "50%",
            bottom: "0.8rem",
            zIndex: 4,
            transform: "translateX(-50%)",
            maxWidth: "calc(100% - 1.6rem)",
            padding: "0.42rem 0.68rem",
            border: "1px solid rgba(242, 202, 104, 0.34)",
            borderRadius: "999px",
            background: "rgba(5, 13, 25, 0.86)",
            color: "#f2d98e",
            fontSize: "var(--petra-type-metadata, 0.8125rem)",
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

export function rendererStartupAnnouncement(
  status: RendererStartupStatus,
): string {
  if (status === "initializing") {
    return "Starting interactive Petra dish renderer.";
  }
  if (status === "failed") {
    return (
      "Interactive dish unavailable. The WebGL renderer could not start. " +
      "Petra has not substituted demonstration biology or changed the simulation state."
    );
  }
  return "";
}

export function RendererFailureFallback({
  errorMessage,
  descriptionId,
  motionPreference,
  onRetry,
}: {
  readonly errorMessage: string | null;
  readonly descriptionId: string;
  readonly motionPreference: RendererMotionMode;
  readonly onRetry: () => void;
}) {
  return (
    <div
      data-render-fallback="true"
      title={errorMessage ?? undefined}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 3,
        display: "grid",
        placeItems: "center",
        padding: "1.2rem",
        background:
          "radial-gradient(circle at center, rgba(32, 54, 78, 0.56), rgba(5, 13, 25, 0.94))",
      }}
    >
      <div
        style={{
          width: "min(24rem, 100%)",
          padding: "1rem 1.05rem",
          border: "1px solid rgba(143, 220, 255, 0.2)",
          borderRadius: "18px",
          background: "rgba(8, 20, 37, 0.9)",
          boxShadow: "0 22px 70px rgba(0, 0, 0, 0.28)",
          textAlign: "center",
        }}
      >
        <div id={descriptionId}>
          <strong
            style={{
              display: "block",
              marginBottom: "0.45rem",
              color: "#eef7ff",
              fontSize: "0.95rem",
            }}
          >
            Interactive dish unavailable
          </strong>
          <span
            style={{
              display: "block",
              marginBottom: "0.8rem",
              color: "rgba(226, 235, 246, 0.72)",
              fontSize: "0.78rem",
              lineHeight: 1.5,
            }}
          >
            The WebGL renderer could not start. Petra has not substituted
            demonstration biology or changed the simulation state.
          </span>
        </div>
        <PetraCompactAction
          motionPreference={motionPreference}
          className="pixi-dish__retry-action"
          aria-describedby={descriptionId}
          onClick={onRetry}
        >
          Retry renderer
        </PetraCompactAction>
      </div>
    </div>
  );
}
