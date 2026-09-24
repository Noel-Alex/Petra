import type {\n  CSSProperties,\n  PointerEvent as ReactPointerEvent,\n} from "react";

import {
  DISH_VIEWPORT_DIAMETER_FRACTION,
  isScreenPointInsideDishAperture,
  resolveDishViewportGeometry,
} from "../render/pixi/camera";
import type {
  InterventionTool,
  NormalizedDishPoint,
} from "../ui/interventionPreview";
import {
  INTERVENTION_TARGET_RING_RADIUS_FRACTION,
  constrainPointToCircularDish,
} from "../ui/interventionPlacement";
import { planDishMotionPhase } from "../ui/motion/dishVocabulary";\nimport type { MotionPreference } from "../ui/motion/policy";

export interface PlacementBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface InterventionPlacementOverlayProps {
  readonly tool: InterventionTool;
  readonly point: NormalizedDishPoint;
  readonly motion: MotionPreference;
  readonly onPointChange?: (point: NormalizedDishPoint) => void;
}

export function clientPointToDishPlacement(
  client: { readonly x: number; readonly y: number },
  bounds: PlacementBounds,
): NormalizedDishPoint | null {
  if (
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new RangeError("placement bounds must be finite with positive size");
  }

  const local = {
    x: client.x - bounds.left,
    y: client.y - bounds.top,
  };
  const viewport = { width: bounds.width, height: bounds.height };
  if (!isScreenPointInsideDishAperture(local, viewport)) return null;

  const geometry = resolveDishViewportGeometry(viewport);
  return constrainPointToCircularDish({
    x: 0.5 + (local.x - geometry.centerX) / geometry.diameter,
    y: 0.5 + (local.y - geometry.centerY) / geometry.diameter,
  });
}

export function InterventionPlacementOverlay({
  tool,
  point,
  motion,
  onPointChange,
}: InterventionPlacementOverlayProps) {
  const updateFromPointer = (
    event: ReactPointerEvent<SVGSVGElement>,
  ): boolean => {
    const rect = event.currentTarget.getBoundingClientRect();
    const next = clientPointToDishPlacement(
      { x: event.clientX, y: event.clientY },
      {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
    );
    if (next === null) return false;
    onPointChange?.(next);
    return true;
  };

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!updateFromPointer(event)) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.pointerType !== "mouse" && event.buttons === 0) return;
    updateFromPointer(event);
  };

  const handlePointerEnd = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const aperturePercent = DISH_VIEWPORT_DIAMETER_FRACTION * 100;
  const cx = 50 + (point.x - 0.5) * aperturePercent;
  const cy = 50 + (point.y - 0.5) * aperturePercent;
  const targetRadius =
    INTERVENTION_TARGET_RING_RADIUS_FRACTION * aperturePercent;

  return (
    <svg
      className="dish-placement-overlay"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      data-intervention-placement={tool}
      data-motion={motion}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
      <g
        className="dish-placement-target"
        data-placement-tool={tool}
        transform={`translate(${cx} ${cy})`}
      >
        <circle
          className="dish-placement-target__halo"
          cx="0"
          cy="0"
          r={targetRadius}
        />
        <circle
          className="dish-placement-target__ring"
          cx="0"
          cy="0"
          r={targetRadius}
        />
        <line x1={-targetRadius - 2} y1="0" x2={-targetRadius + 1.5} y2="0" />
        <line x1={targetRadius - 1.5} y1="0" x2={targetRadius + 2} y2="0" />
        <line x1="0" y1={-targetRadius - 2} x2="0" y2={-targetRadius + 1.5} />
        <line x1="0" y1={targetRadius - 1.5} x2="0" y2={targetRadius + 2} />
        <ToolGlyph tool={tool} />
      </g>
    </svg>
  );
}

function ToolGlyph({ tool }: { readonly tool: InterventionTool }) {
  if (tool === "inoculate") {
    return (
      <g className="dish-placement-target__glyph">
        <circle cx="-1.8" cy="0.4" r="1.4" />
        <circle cx="1.3" cy="-1.1" r="1.15" />
        <circle cx="1.8" cy="1.7" r="0.9" />
      </g>
    );
  }

  if (tool === "fungus") {
    return (
      <g className="dish-placement-target__glyph dish-placement-target__glyph--fungus">
        <path d="M -3 2 C -1 1 -1 -1 0 -3 M 0 -1 C 2 -1 2 -2 3 -3 M -1 0 C 1 1 1 2 3 3" />
      </g>
    );
  }

  if (tool === "antibiotic") {
    return (
      <g className="dish-placement-target__glyph">
        <circle cx="0" cy="0" r="2.25" />
        <path d="M -1.15 0 H 1.15 M 0 -1.15 V 1.15" />
      </g>
    );
  }

  return (
    <g className="dish-placement-target__glyph">
      <path d="M 0 -3 C 2.3 -0.5 2.6 1 0 3 C -2.6 1 -2.3 -0.5 0 -3 Z" />
      <path d="M 0 -1.7 V 1.8" />
    </g>
  );
}
