import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { PetraCompactAction } from "../../ui/PetraCompactAction";
import type { DishRenderSnapshot, SemanticZoomLevel } from "../model";
import type { DishVisualMotionSpec } from "../visualInterpolation";
import type { CameraMotionSpec } from "./cameraMotion";
import {
  createPixiDishRenderer,
  type PixiDishRenderer,
  type RendererMotionMode,
} from "./renderer";
import { beginRendererInitialization } from "./rendererLifecycle";

import "./PixiDish.css";

export type PixiDishSourceKind =
  | "authoritative-snapshot"
  | "visual-demo"
  | "awaiting-authoritative-snapshot";

export interface PixiDishProps {
  readonly snapshot: DishRenderSnapshot | null;
  readonly sourceKind: PixiDishSourceKind;
  readonly motion?: RendererMotionMode;
  readonly cameraMotion: CameraMotionSpec;
  readonly visualMotion: DishVisualMotionSpec;
  readonly hyphalMotion: DishVisualMotionSpec;
  readonly overlayId?: string | null;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly ariaDescribedBy?: string;
  /** Monotonic presentation-only request counter from the React shell. */
  readonly resetCameraSignal?: number;
  readonly onSemanticZoomLevelChange?: (level: SemanticZoomLevel) => void;
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

function assertRenderSource(
  sourceKind: PixiDishSourceKind,
  snapshot: DishRenderSnapshot | null,
): void {
  const expectsSnapshot = sourceKind !== "awaiting-authoritative-snapshot";
  if (expectsSnapshot === (snapshot !== null)) return;

  throw new Error(
    sourceKind === "awaiting-authoritative-snapshot"
      ? "awaiting dish render source must not include a snapshot"
      : sourceKind + " dish render source requires a snapshot",
  );
}

export function PixiDish({
  snapshot,
  sourceKind,
  motion = "full",
  cameraMotion,
  visualMotion,
  hyphalMotion,
  overlayId = null,
  className,
  ariaLabel,
  ariaDescribedBy,
  resetCameraSignal = 0,
  onSemanticZoomLevelChange,
}: PixiDishProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiDishRenderer | null>(null);
  const motionRef = useRef(motion);
  const cameraMotionRef = useRef(cameraMotion);
  const visualMotionRef = useRef(visualMotion);
  const hyphalMotionRef = useRef(hyphalMotion);
  const overlayRef = useRef(overlayId);
  const semanticZoomCallbackRef = useRef(onSemanticZoomLevelChange);
  const resetCameraSignalRef = useRef(resetCameraSignal);
  const [startup, setStartup] = useState<RendererStartupState>(IDLE_STARTUP);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const failureDescriptionId = useId();

  assertRenderSource(sourceKind, snapshot);
  const usingAuthoritative = sourceKind === "authoritative-snapshot";
  const usingDemo = sourceKind === "visual-demo";
  const renderSnapshot = snapshot;
  const renderEnabled = renderSnapshot !== null;
  const snapshotRef = useRef<DishRenderSnapshot | null>(renderSnapshot);

  useLayoutEffect(() => {
    motionRef.current = motion;
    cameraMotionRef.current = cameraMotion;
    visualMotionRef.current = visualMotion;
    hyphalMotionRef.current = hyphalMotion;
    overlayRef.current = overlayId;
    semanticZoomCallbackRef.current = onSemanticZoomLevelChange;
    snapshotRef.current = renderSnapshot;
  }, [
    cameraMotion,
    hyphalMotion,
    motion,
    onSemanticZoomLevelChange,
    overlayId,
    renderSnapshot,
    visualMotion,
  ]);

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
          visualMotion,
          hyphalMotion,
          overlayId,
          onSemanticZoomLevelChange(level) {
            semanticZoomCallbackRef.current?.(level);
          },
        }),
      {
        onReady(renderer) {
          rendererRef.current = renderer;
          renderer.setCameraMotion(cameraMotionRef.current);
          renderer.setVisualMotion(visualMotionRef.current);
          renderer.setHyphalMotion(hyphalMotionRef.current);
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
    renderer.setVisualMotion(visualMotion);
    renderer.setHyphalMotion(hyphalMotion);
    renderer.setMotionMode(motion);
  }, [cameraMotion, hyphalMotion, motion, visualMotion]);

  useEffect(() => {
    if (resetCameraSignal === resetCameraSignalRef.current) return;
    resetCameraSignalRef.current = resetCameraSignal;
    rendererRef.current?.resetCamera();
  }, [resetCameraSignal]);

  useEffect(() => {
    if (renderSnapshot !== null) {
      rendererRef.current?.updatePresentation(renderSnapshot, overlayId);
    }
  }, [renderSnapshot, overlayId]);

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
      data-render-source={sourceKind}
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
        }}
      >
        {!renderEnabled ? (
          <span
            className="pixi-dish__empty"
            data-render-empty="true"
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
          className="pixi-dish__demo-disclosure"
          data-render-demo-disclosure="true"
          role="note"
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
      className="pixi-dish__fallback"
      data-render-fallback="true"
      title={errorMessage ?? undefined}
    >
      <div className="pixi-dish__fallback-card">
        <div id={descriptionId}>
          <strong className="pixi-dish__fallback-title">
            Interactive dish unavailable
          </strong>
          <span className="pixi-dish__fallback-copy">
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
