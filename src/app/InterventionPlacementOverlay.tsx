import type {
  CSSProperties,
  PointerEvent as ReactPointerEvent,
} from "react";

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
import { PetraIconGeometry } from "../ui/icons/PetraIcon";
import type { PetraIconName } from "../ui/icons/spec";
import { planDishMotionPhase } from "../ui/motion/dishVocabulary";
import type { MotionPreference } from "../ui/motion/policy";

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
  const placementMotion = planDishMotionPhase({
    phase: "intervention-placement",
    preference: motion,
    evidence: "presentation-intent",
  });

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
      data-transition-treatment={
        placementMotion.eligible ? placementMotion.treatment : "instant"
      }
      data-motion-token={placementMotion.eligible ? placementMotion.token : "none"}
      style={
        placementMotion.eligible
          ? ({
              "--placement-motion-ms": `${placementMotion.durationMs}ms`,
              "--placement-motion-easing": `cubic-bezier(${placementMotion.easing.join(", ")})`,
            } as CSSProperties)
          : undefined
      }
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

const TOOL_ICON_NAME: Readonly<Record<InterventionTool, PetraIconName>> = Object.freeze({
  inoculate: "inoculate",
  fungus: "fungus",
  antibiotic: "antibiotic",
  nutrient: "nutrient",
});

function ToolGlyph({ tool }: { readonly tool: InterventionTool }) {
  const iconName = TOOL_ICON_NAME[tool];
  return (
    <g
      className="dish-placement-target__glyph"
      data-petra-icon={iconName}
      transform="translate(-3 -3) scale(0.25)"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <PetraIconGeometry name={iconName} />
    </g>
  );
}
