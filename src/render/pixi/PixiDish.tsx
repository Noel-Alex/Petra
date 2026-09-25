import type { OrganismPresentationIdentity } from "../organismPresentationIdentity";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { PetraCompactAction } from "../../ui/PetraCompactAction";
import type { DishRenderSnapshot, DishSelectionHighlight, SemanticZoomLevel } from "../model";
import type { DishVisualMotionSpec } from "../visualInterpolation";
import type { CameraMotionSpec } from "./cameraMotion";
import { resolveDishActivationPoint } from "./dishActivation";
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
  readonly selection?: DishSelectionHighlight | null;
  readonly organismPresentation?: OrganismPresentationIdentity | null;
  readonly motion?: RendererMotionMode;
  readonly cameraMotion: CameraMotionSpec;
  readonly visualMotion: DishVisualMotionSpec;
  readonly overlayId?: string | null;
  readonly className?: string;
  readonly ariaLabel?: string;
  readonly ariaDescribedBy?: string;
  /** Monotonic presentation-only request counter from the React shell. */
  readonly resetCameraSignal?: number;
  readonly onSemanticZoomLevelChange?: (level: SemanticZoomLevel) => void;
  /** Presentation-only normalized dish activation for authoritative query adapters. */
  readonly onDishPointActivate?: (point: { readonly x: number; readonly y: number }) => void;
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
  organismPresentation = null,
  selection = null,
  motion = "full",
  cameraMotion,
  visualMotion,
  overlayId = null,
  className,
  ariaLabel,
  ariaDescribedBy,
  resetCameraSignal = 0,
  onSemanticZoomLevelChange,
  onDishPointActivate,
}: PixiDishProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const rendererRef = useRef<PixiDishRenderer | null>(null);
  const selectionRef = useRef(selection);
  const motionRef = useRef(motion);
  const cameraMotionRef = useRef(cameraMotion);
  const visualMotionRef = useRef(visualMotion);
  const overlayRef = useRef(overlayId);
  const semanticZoomCallbackRef = useRef(onSemanticZoomLevelChange);
  const dishPointActivateCallbackRef = useRef(onDishPointActivate);
  const resetCameraSignalRef = useRef(resetCameraSignal);
  const [startup, setStartup] = useState<RendererStartupState>(IDLE_STARTUP);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const failureDescriptionId = useId();

  assertRenderSource(sourceKind, snapshot);
  const usingAuthoritative = sourceKind === "authoritative-snapshot";
  const usingDemo = sourceKind === "visual-demo";
  const renderSnapshot = snapshot;
  const renderEnabled = renderSnapshot !== null;
  const presentation = usingAuthoritative ? organismPresentation : null;
  const presentationRef = useRef(presentation);
  const snapshotRef = useRef<DishRenderSnapshot | null>(renderSnapshot);

  useLayoutEffect(() => {
    selectionRef.current = selection;
    motionRef.current = motion;
    cameraMotionRef.current = cameraMotion;
    visualMotionRef.current = visualMotion;
    overlayRef.current = overlayId;
    semanticZoomCallbackRef.current = onSemanticZoomLevelChange;
    dishPointActivateCallbackRef.current = onDishPointActivate;
    snapshotRef.current = renderSnapshot;
    presentationRef.current = presentation;
  }, [
    selection,
    cameraMotion,
    motion,
    onSemanticZoomLevelChange,
    onDishPointActivate,
    overlayId,
    renderSnapshot,
    presentation,
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
          overlayId,
          onSemanticZoomLevelChange(level) {
            semanticZoomCallbackRef.current?.(level);
          },
          onDishPointActivate(point) {
            const callback = dishPointActivateCallbackRef.current;
            if (callback === undefined) return false;
            callback(point);
            return true;
          },
        }),
      {
        onReady(renderer) {
          rendererRef.current = renderer;
          renderer.setSelection(selectionRef.current);
          renderer.setCameraMotion(cameraMotionRef.current);
          renderer.setVisualMotion(visualMotionRef.current);
          renderer.setMotionMode(motionRef.current);
          const currentSnapshot = snapshotRef.current;
          if (currentSnapshot !== null) {
            renderer.updatePresentation(currentSnapshot, overlayRef.current, presentationRef.current);
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
    renderer.setMotionMode(motion);
  }, [cameraMotion, motion, visualMotion]);

  useEffect(() => {
    if (resetCameraSignal === resetCameraSignalRef.current) return;
    resetCameraSignalRef.current = resetCameraSignal;
    rendererRef.current?.resetCamera();
  }, [resetCameraSignal]);

  useEffect(() => {
    if (renderSnapshot !== null) {
      rendererRef.current?.updatePresentation(renderSnapshot, overlayId, presentation);
    }
  }, [renderSnapshot, overlayId, presentation]);

  useEffect(() => { rendererRef.current?.setSelection(selection); }, [selection]);

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
  const waitingSelectionInteractive =
    !renderEnabled && onDishPointActivate !== undefined;

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
        tabIndex={rendererInteractive || waitingSelectionInteractive ? 0 : -1}
        aria-roledescription="interactive Petri dish"
        aria-describedby={ariaDescribedBy}
        aria-label={resolvedAriaLabel}
        aria-busy={renderEnabled && startup.status === "initializing"}
        onClick={
          waitingSelectionInteractive
            ? (event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const viewport = {
                  width: Math.max(rect.width, 1),
                  height: Math.max(rect.height, 1),
                };
                const screen = {
                  x: event.clientX - rect.left,
                  y: event.clientY - rect.top,
                };
                const point = resolveDishActivationPoint({
                  start: screen,
                  end: screen,
                  viewport,
                  camera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
                });
                if (point !== null) onDishPointActivate?.(point);
              }
            : undefined
        }
        onKeyDown={
          waitingSelectionInteractive
            ? (event) => {
                if (
                  event.key !== "Enter" ||
                  event.ctrlKey ||
                  event.metaKey ||
                  event.altKey
                ) {
                  return;
                }
                event.preventDefault();
                onDishPointActivate?.({ x: 0.5, y: 0.5 });
              }
            : undefined
        }
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
