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
import type { NormalizedDishPoint } from "../ui/interventionPreview";
import type { InterventionPlacementState } from "../ui/interventionPlacement";
import { InterventionPlacementOverlay } from "./InterventionPlacementOverlay";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import type { RendererMotionMode } from "../render/pixi/renderer";
import { PetraCompactAction } from "../ui/PetraCompactAction";
import { planSurfaceTransition } from "../ui/motion/semanticTransitions";
import {
  AUTOMATIC_DISH_OVERLAY,
  AUTOMATIC_DISH_OVERLAY_CONTROL_VALUE,
  NO_DISH_OVERLAY_CONTROL_VALUE,
  dishOverlayControlValue,
  dishOverlayFieldSelection,
  dishOverlaySelectionFromControlValue,
  reconcileDishOverlaySelection,
  resolveDishOverlaySelection,
  sameDishOverlaySelection,
  type DishOverlaySelection,
} from "./dishPresentation";
import {
  INITIAL_DISH_RENDER_SOURCE_STATE,
  resolveDishRenderSource,
} from "./dishRenderSource";
import { buildOverlayLegend } from "./overlayLegend";
import { surfaceMotionCss } from "./motionAdapter";
import { DishSemanticZoomGuide } from "./DishSemanticZoomGuide";
import {
  dishEscapeAction,
  dishEscapeAllowsFirstRefusal,
} from "./dishKeyboard";
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
  /** Presentation-only target selection. Scientific application remains separate. */
  readonly placement?: InterventionPlacementState | null;
  readonly onPlacementPointChange?: (point: NormalizedDishPoint) => void;
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
  placement = null,
  onPlacementPointChange,
}: DishViewportProps) {
  const interactionHintId = useId();
  const authoritativeSnapshot = snapshot ?? null;
  const [renderSourceState, setRenderSourceState] = useState(
    INITIAL_DISH_RENDER_SOURCE_STATE,
  );
  const renderSourceResolution = resolveDishRenderSource(
    renderSourceState,
    { authoritativeSnapshot, demoMode },
    createRendererDemoSnapshot,
  );

  useEffect(() => {
    if (renderSourceResolution.state === renderSourceState) return;
    setRenderSourceState(renderSourceResolution.state);
  }, [renderSourceResolution.state, renderSourceState]);

  const renderSource = renderSourceResolution.source;
  const activeSnapshot = renderSource.snapshot;
  const usingAuthoritative =
    renderSource.kind === "authoritative-snapshot";
  const usingDemo = renderSource.kind === "visual-demo";
  const [overlaySelection, setOverlaySelection] =
    useState<DishOverlaySelection>(AUTOMATIC_DISH_OVERLAY);
  const [cameraResetSignal, setCameraResetSignal] = useState(0);
  const [semanticGuide, setSemanticGuide] = useState<{
    readonly previous: SemanticZoomLevel;
    readonly current: SemanticZoomLevel;
  }>({ previous: "dish", current: "dish" });
  const resolvedOverlaySelection =
    activeSnapshot === null
      ? null
      : resolveDishOverlaySelection(activeSnapshot, overlaySelection);
  const effectiveOverlaySelection =
    resolvedOverlaySelection?.selection ?? overlaySelection;
  const activeOverlay = resolvedOverlaySelection?.field ?? null;
  const resolvedOverlayId =
    resolvedOverlaySelection?.rendererOverlayId ?? null;
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

  useEffect(() => {
    if (placement?.phase !== "placing" || placement.tool === null) return;
    setCameraResetSignal((signal) => signal + 1);
  }, [placement?.phase, placement?.tool]);

  useEffect(() => {
    if (activeSnapshot === null) return;
    setOverlaySelection((current) => {
      const reconciled = reconcileDishOverlaySelection(
        activeSnapshot,
        current,
      );
      return sameDishOverlaySelection(current, reconciled)
        ? current
        : reconciled;
    });
  }, [activeSnapshot]);

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
    const editableTarget = isEditableTarget(event.target);

    if (
      !dishEscapeAllowsFirstRefusal(event.key, {
        defaultPrevented: event.defaultPrevented,
        editableTarget,
      })
    ) {
      return;
    }

    if (onEscapeBeforeOverview?.() === true) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    const action = dishEscapeAction(event.key, {
      defaultPrevented: event.defaultPrevented,
      editableTarget,
      higherPriorityConsumed: false,
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
      data-render-source={renderSource.kind}
      onKeyDown={handleDishKeyDown}
    >
      <div className="dish-renderer-frame">
        <PixiDish
          snapshot={activeSnapshot}
          sourceKind={renderSource.kind}
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
        {placement?.phase === "placing" && placement.tool !== null ? (
          <InterventionPlacementOverlay
            tool={placement.tool}
            point={placement.point}
            motion={motion}
            onPointChange={onPlacementPointChange}
          />
        ) : null}
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
            value={
              activeSnapshot === null
                ? "awaiting"
                : dishOverlayControlValue(effectiveOverlaySelection)
            }
            disabled={activeSnapshot === null}
            onChange={(event) => {
              setOverlaySelection(
                dishOverlaySelectionFromControlValue(event.target.value),
              );
            }}
          >
            {activeSnapshot === null ? (
              <option value="awaiting">Awaiting authoritative data</option>
            ) : (
              <>
                <option value={AUTOMATIC_DISH_OVERLAY_CONTROL_VALUE}>
                  Automatic
                </option>
                <option value={NO_DISH_OVERLAY_CONTROL_VALUE}>None</option>
                {activeSnapshot.fields.map((field) => (
                  <option
                    key={field.id}
                    value={dishOverlayControlValue(
                      dishOverlayFieldSelection(field.id),
                    )}
                  >
                    {field.label}
                  </option>
                ))}
              </>
            )}
          </select>
        </label>

        <div
          className="dish-overlay-legend"
          data-overlay-selection-mode={effectiveOverlaySelection.mode}
          data-overlay-resolved-id={resolvedOverlayId ?? "none"}
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
            key={`${effectiveOverlaySelection.mode}:${resolvedOverlayId ?? "none"}`}
            className="dish-overlay-legend__visual"
            data-transition-treatment={overlayMotion.treatment}
          >
            <span className="dish-overlay-swatch" aria-hidden="true" />
            {activeSnapshot === null ? (
              <span>No authoritative field overlay</span>
            ) : effectiveOverlaySelection.mode === "none" ? (
              <span>No field overlay selected</span>
            ) : overlayLegend === null ? (
              <span>Automatic overlay · no source fields available</span>
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
        {placement?.phase === "placing"
          ? "Placement preview: move or tap the target on the dish, or use the horizontal and vertical controls. Escape cancels. The target ring is presentation-only."
          : "Pointer: wheel to zoom · drag while zoomed · double-click to focus. Touch: drag while zoomed · pinch to zoom. Keyboard: +/− zoom · arrow keys pan · Home, 0, Escape, or Dish resets overview."}
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
