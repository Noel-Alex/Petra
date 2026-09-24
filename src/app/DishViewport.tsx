import {
  useId,
  useMemo,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import type { DishRenderSnapshot } from "../render/model";
import { PixiDish } from "../render/pixi/PixiDish";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import type { RendererMotionMode } from "../render/pixi/renderer";
import { PetraCompactAction } from "../ui/PetraCompactAction";
import { planSurfaceTransition } from "../ui/motion/semanticTransitions";
import {
  defaultDishOverlayId,
  resolveDishOverlay,
} from "./dishPresentation";
import {
  SEMANTIC_ZOOM_GUIDE,
  surfaceMotionCss,
} from "./motionAdapter";
import { dishEscapeAction } from "./dishKeyboard";
import { resolveDishCameraMotion } from "./dishCameraMotion";

export interface DishViewportProps {
  readonly motion: RendererMotionMode;
  readonly snapshot?: DishRenderSnapshot | null;
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
  onEscapeBeforeOverview,
}: DishViewportProps) {
  const interactionHintId = useId();
  const demoSnapshot = useMemo(() => createRendererDemoSnapshot(), []);
  const activeSnapshot = snapshot ?? demoSnapshot;
  const [requestedOverlayId, setRequestedOverlayId] = useState<string | null>(
    () => defaultDishOverlayId(activeSnapshot),
  );
  const [cameraResetSignal, setCameraResetSignal] = useState(0);
  const activeOverlay = resolveDishOverlay(
    activeSnapshot,
    requestedOverlayId,
  );
  const resolvedOverlayId = activeOverlay?.id ?? null;
  const usingDemo = snapshot === null || snapshot === undefined;
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
      renderEnabled: true,
    });
    if (action !== "reset-overview") return;

    event.preventDefault();
    event.stopPropagation();
    requestOverview();
  };

  return (
    <div
      className="dish-renderer-shell"
      data-render-source={usingDemo ? "visual-demo" : "authoritative-snapshot"}
      onKeyDown={handleDishKeyDown}
    >
      <div className="dish-renderer-frame">
        <PixiDish
          snapshot={snapshot}
          demoMode={usingDemo}
          motion={cameraPlan.mode}
          cameraMotion={cameraPlan.cameraMotion}
          overlayId={resolvedOverlayId}
          resetCameraSignal={cameraResetSignal}
          className="dish-renderer-canvas"
          ariaLabel={
            usingDemo
              ? "Interactive Petra Petri dish using clearly labelled visual demonstration data"
              : "Interactive Petra Petri dish from authoritative simulation state"
          }
          ariaDescribedBy={interactionHintId}
        />
        <span className="dish-source-badge">
          {usingDemo ? "visual demo · not biology" : "authoritative snapshot"}
        </span>
      </div>

      <div className="dish-renderer-controls">
        <PetraCompactAction
          motionPreference={motion}
          className="ghost-button"
          onClick={requestOverview}
          aria-label="Return Petri dish camera to whole-dish overview"
        >
          Dish
        </PetraCompactAction>

        <label className="dish-overlay-control">
          <span>Overlay</span>
          <select
            aria-label="Petri dish overlay"
            value={resolvedOverlayId ?? ""}
            disabled={activeSnapshot.fields.length === 0}
            onChange={(event) => {
              setRequestedOverlayId(
                event.target.value === "" ? null : event.target.value,
              );
            }}
          >
            {activeSnapshot.fields.length === 0 ? (
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
          key={resolvedOverlayId ?? "none"}
          className="dish-overlay-legend"
          data-overlay-kind={activeOverlay?.kind ?? "none"}
          data-transition-treatment={overlayMotion.treatment}
          aria-live="polite"
          style={{
            "--overlay-motion-ms": overlayMotion.duration,
            "--overlay-motion-easing": overlayMotion.easing,
          } as CSSProperties}
        >
          <span className="dish-overlay-swatch" aria-hidden="true" />
          <span>
            {activeOverlay === null
              ? "No field overlay"
              : `${activeOverlay.label} · ${activeOverlay.unit}`}
          </span>
        </div>
      </div>

      <div
        className="dish-semantic-guide"
        role="note"
        aria-label="Semantic zoom meaning"
      >
        {SEMANTIC_ZOOM_GUIDE.map((entry) => (
          <span key={entry.id} data-semantic-view={entry.id}>
            <strong>{entry.label}</strong>
            <span>{entry.meaning}</span>
          </span>
        ))}
      </div>

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
