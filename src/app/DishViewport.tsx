import { useId, useMemo, useState } from "react";
import type { DishRenderSnapshot } from "../render/model";
import { PixiDish } from "../render/pixi/PixiDish";
import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import type { RendererMotionMode } from "../render/pixi/renderer";
import {
  defaultDishOverlayId,
  resolveDishOverlay,
} from "./dishPresentation";

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

  return (
    <div
      className="dish-renderer-shell"
      data-render-source={usingDemo ? "visual-demo" : "authoritative-snapshot"}
    >
      <div className="dish-renderer-frame">
        <PixiDish
          snapshot={snapshot}
          motion={motion}
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
          className="dish-overlay-legend"
          data-overlay-kind={activeOverlay?.kind ?? "none"}
          aria-live="polite"
        >
          <span className="dish-overlay-swatch" aria-hidden="true" />
          <span>
            {activeOverlay === null
              ? "No field overlay"
              : `${activeOverlay.label} · ${activeOverlay.unit}`}
          </span>
        </div>
      </div>

      <p className="dish-interaction-hint" id={interactionHintId}>
        Pointer: wheel to zoom · drag while zoomed · double-click to focus.
        Keyboard: +/− zoom · arrow keys pan · Home or 0 reset.
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
