import { useId, useMemo, useState, type CSSProperties } from "react";
import type { DishRenderSnapshot } from "../render/model";
import { PixiDish } from "../render/pixi/PixiDish";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import type { RendererMotionMode } from "../render/pixi/renderer";
import { resolveMotion } from "../ui/motion/policy";
import { planSurfaceTransition } from "../ui/motion/semanticTransitions";
import { MOTION } from "../ui/motion/tokens";
import {
  defaultDishOverlayId,
  resolveDishOverlay,
} from "./dishPresentation";
import {
  SEMANTIC_ZOOM_GUIDE,
  surfaceMotionCss,
} from "./motionAdapter";

export interface DishViewportProps {
  readonly motion: RendererMotionMode;
  readonly snapshot?: DishRenderSnapshot | null;
}

export function DishViewport({
  motion,
  snapshot,
}: DishViewportProps) {
  const interactionHintId = useId();
  const demoSnapshot = useMemo(() => createRendererDemoSnapshot(), []);
  const activeSnapshot = snapshot ?? demoSnapshot;
  const [requestedOverlayId, setRequestedOverlayId] = useState<string | null>(
    () => defaultDishOverlayId(activeSnapshot),
  );
  const activeOverlay = resolveDishOverlay(
    activeSnapshot,
    requestedOverlayId,
  );
  const resolvedOverlayId = activeOverlay?.id ?? null;
  const usingDemo = snapshot === null || snapshot === undefined;
  const cameraTreatment = resolveMotion("full", {
    kind: "navigational",
    durationMs: MOTION.cameraFocus.durationMs,
  });
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

  return (
    <div
      className="dish-renderer-shell"
      data-render-source={usingDemo ? "visual-demo" : "authoritative-snapshot"}
    >
      <div className="dish-renderer-frame">
        <PixiDish
          snapshot={snapshot}
          demoMode={usingDemo}
          motion={motion}
          cameraMotion={{
            durationMs: cameraTreatment.durationMs,
            easing: MOTION.cameraFocus.easing,
          }}
          overlayId={resolvedOverlayId}
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
        keys pan · Home or 0 reset.
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
