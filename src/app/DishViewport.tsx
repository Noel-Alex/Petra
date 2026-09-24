import {
  useEffect,
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { DishRenderSnapshot, SemanticZoomLevel } from "../render/model";
import { PixiDish } from "../render/pixi/PixiDish";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import type { RendererMotionMode } from "../render/pixi/renderer";
import { PetraCompactAction } from "../ui/PetraCompactAction";
import { planSurfaceTransition } from "../ui/motion/semanticTransitions";
import {
  defaultDishOverlayId,
  resolveDishOverlay,
} from "./dishPresentation";
import { buildOverlayLegend } from "./overlayLegend";
import { surfaceMotionCss } from "./motionAdapter";
import { DishSemanticZoomGuide } from "./DishSemanticZoomGuide";
import { dishEscapeAction } from "./dishKeyboard";
import { resolveDishCameraMotion } from "./dishCameraMotion";

export interface DishViewportProps {
  readonly motion: RendererMotionMode;
  readonly snapshot?: DishRenderSnapshot | null;
  /** Explicit visual-development fixture opt-in. Product/runtime default is false. */
  readonly demoMode?: boolean;
  /**
   * Gives an active tool first refusal on Escape. Return true when consumed.
   * This callback may cancel presentation-only tool state but must not fabricate
   * or mutate authoritative simulation state.
   */
  readonly onEscapeBeforeOverview?: () => boolean;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

export function DishViewport({
  motion,
  snapshot,
  demoMode = false,
  onEscapeBeforeOverview,
}: DishViewportProps) {
  const interactionHintId = useId();
  const authoritativeSnapshot = snapshot ?? null;
  const usingAuthoritative = authoritativeSnapshot !== null;
  const usingDemo = !usingAuthoritative && demoMode;
  const demoSnapshot = useMemo(
    () => (demoMode ? createRendererDemoSnapshot() : null),
    [demoMode],
  );
  const activeSnapshot = usingAuthoritative
    ? authoritativeSnapshot
    : usingDemo
      ? demoSnapshot
      : null;
  const [requestedOverlayId, setRequestedOverlayId] = useState<string | null>(
    () => (activeSnapshot === null ? null : defaultDishOverlayId(activeSnapshot)),
  );
  const [cameraResetSignal, setCameraResetSignal] = useState(0);
  const [semanticGuide, setSemanticGuide] = useState<{
    readonly previous: SemanticZoomLevel;
    readonly current: SemanticZoomLevel;
  }>({ previous: "dish", current: "dish" });
  const activeOverlay =
    activeSnapshot === null
      ? null
      : resolveDishOverlay(activeSnapshot, requestedOverlayId);
  const resolvedOverlayId = activeOverlay?.id ?? null;
  const overlayLegend =
    activeOverlay === null ? null : buildOverlayLegend(activeOverlay);
  const renderEnabled = activeSnapshot !== null;
  const cameraPlan = resolveDishCameraMotion(motion);
  const overlayMotion = useMemo(
    () =>
      surfaceMotionCss(
        planSurfaceTransition({
          surface: "overlay",
          action: "show",
          preference: motion,
        }),
      ),
    [motion],
  );

  useEffect(() => {
    if (renderEnabled) return;
    setSemanticGuide({ previous: "dish", current: "dish" });
  }, [renderEnabled]);

  const handleSemanticZoomLevelChange = (level: SemanticZoomLevel) => {
    setSemanticGuide((current) =>
      current.current === level
        ? current
        : { previous: current.current, current: level },
    );
  };

  const requestOverview = () => {
    setCameraResetSignal((signal) => signal + 1);
  };

  const handleDishKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;

    const higherPriorityConsumed = onEscapeBeforeOverview?.() ?? false;
    const action = dishEscapeAction(event.key, {
      defaultPrevented: event.defaultPrevented,
      editableTarget: isEditableTarget(event.target),
      higherPriorityConsumed,
      renderEnabled,
    });
    if (action !== "reset-overview") return;

    event.preventDefault();
    event.stopPropagation();
    requestOverview();
  };

  return (
    <div
      className="dish-renderer-shell"
      data-render-source={
        usingAuthoritative
          ? "authoritative-snapshot"
          : usingDemo
            ? "visual-demo"
            : "awaiting-authoritative-snapshot"
      }
      onKeyDown={handleDishKeyDown}
    >
      <div className="dish-renderer-frame">
        <PixiDish
          snapshot={authoritativeSnapshot}
          demoMode={usingDemo}
          motion={cameraPlan.mode}
          cameraMotion={cameraPlan.cameraMotion}
          overlayId={resolvedOverlayId}
          resetCameraSignal={cameraResetSignal}
          onSemanticZoomLevelChange={handleSemanticZoomLevelChange}
          className="dish-renderer-canvas"
          ariaLabel={
            usingAuthoritative
              ? "Interactive Petra Petri dish from authoritative simulation state"
              : usingDemo
                ? "Interactive Petra Petri dish using clearly labelled visual demonstration data"
                : "Petra Petri dish waiting for authoritative simulation data"
          }
          ariaDescribedBy={interactionHintId}
        />
        <span className="dish-source-badge">
          {usingAuthoritative
            ? "authoritative snapshot"
            : usingDemo
              ? "visual demo · not biology"
              : "waiting for authority"}
        </span>
      </div>

      <div className="dish-renderer-controls">
        <PetraCompactAction
          motionPreference={motion}
          className="ghost-button"
          onClick={requestOverview}
          aria-label="Return Petri dish camera to whole-dish overview"
          disabled={!renderEnabled}
        >
          Dish
        </PetraCompactAction>

        <label className="dish-overlay-control">
          <span>Overlay</span>
          <select
            aria-label="Petri dish overlay"
            value={resolvedOverlayId ?? ""}
            disabled={activeSnapshot === null || activeSnapshot.fields.length === 0}
            onChange={(event) => {
              setRequestedOverlayId(
                event.target.value === "" ? null : event.target.value,
              );
            }}
          >
            {activeSnapshot === null ? (
              <option value="">Awaiting authoritative data</option>
            ) : activeSnapshot.fields.length === 0 ? (
              <option value="">No overlay</option>
            ) : (
              activeSnapshot.fields.map((field) => (
                <option key={field.id} value={field.id}>
                  {field.label}
                </option>
              ))
            )}
          </select>
        </label>

        <div
          className="dish-overlay-legend"
          data-overlay-kind={activeOverlay?.kind ?? "none"}
          data-overlay-transfer={overlayLegend?.transfer ?? "none"}
          data-overlay-pattern={overlayLegend?.patternToken ?? "none"}
          aria-live="polite"
          aria-atomic="true"
          style={{
            "--overlay-motion-ms": overlayMotion.duration,
            "--overlay-motion-easing": overlayMotion.easing,
            "--overlay-negative":
              overlayLegend?.negativeCssColor ?? "#7d8999",
            "--overlay-neutral":
              overlayLegend?.neutralCssColor ?? "#7d8999",
            "--overlay-positive":
              overlayLegend?.positiveCssColor ?? "#7d8999",
          } as CSSProperties}
        >
          <div
            key={resolvedOverlayId ?? "none"}
            className="dish-overlay-legend__visual"
            data-transition-treatment={overlayMotion.treatment}
          >
            <span className="dish-overlay-swatch" aria-hidden="true" />
            {activeSnapshot === null ? (
              <span>No authoritative field overlay</span>
            ) : overlayLegend === null ? (
              <span>No field overlay</span>
            ) : (
              <span className="dish-overlay-copy">
                <strong>
                  {overlayLegend.label} · {overlayLegend.unit}
                </strong>
                <small>
                  {overlayLegend.scaleText} · {overlayLegend.rangeText}
                </small>
              </span>
            )}
          </div>
        </div>
      </div>

      <DishSemanticZoomGuide
        previousLevel={semanticGuide.previous}
        currentLevel={semanticGuide.current}
        motion={motion}
      />

      <p className="dish-interaction-hint" id={interactionHintId}>
        Pointer: wheel to zoom · drag while zoomed · double-click to focus.
        Touch: drag while zoomed · pinch to zoom. Keyboard: +/− zoom · arrow
        keys pan · Home, 0, Escape, or Dish resets overview.
      </p>
      {usingDemo ? (
        <p className="dish-demo-disclosure">
          The current field values and lineage shapes are a visual-only renderer
          fixture. They are not measurements, calibration, or simulation output.
        </p>
      ) : null}
    </div>
  );
}
