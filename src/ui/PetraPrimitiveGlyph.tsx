import {
  type CSSProperties,
  type ReactElement,
} from "react";

import {
  resolvePetraVectorPrimitive,
  type PetraPrimitiveGeometry,
} from "../design/vectorPrimitives";
import { resolveMotion, type MotionPreference } from "./motion/policy";
import { MOTION } from "./motion/tokens";

import "./petraPrimitiveGlyph.css";

export type PetraPrimitiveGlyphId =
  | "round-colony-cluster"
  | "rounded-bacterial-rod"
  | "budding-cluster"
  | "selection-ring"
  | "intervention-marker";

export type PetraPrimitiveGlyphState =
  | "idle"
  | "hover"
  | "selected"
  | "disabled"
  | "loading"
  | "active";

export type PetraPrimitiveGlyphTone =
  | "cream"
  | "teal"
  | "mint"
  | "amber"
  | "coral"
  | "olive"
  | "lavender";

export interface PetraPrimitiveGlyphProps {
  readonly primitive: PetraPrimitiveGlyphId;
  readonly state?: PetraPrimitiveGlyphState;
  readonly tone?: PetraPrimitiveGlyphTone;
  readonly motionPreference: MotionPreference;
  readonly size?: number;
  readonly decorative?: boolean;
  readonly label?: string;
  readonly className?: string;
}

/**
 * React/SVG adapter over Petra's framework-neutral flat-vector primitive vocabulary.
 *
 * This component is presentation-only. Choosing a primitive never establishes
 * organism identity, field identity, abundance, fitness, or any other
 * scientific fact. Live scientific adapters must obtain those meanings from
 * authoritative state before choosing an organism-associated primitive.
 */
export function PetraPrimitiveGlyph({
  primitive,
  state = "idle",
  tone = "teal",
  motionPreference,
  size = 56,
  decorative = true,
  label,
  className,
}: PetraPrimitiveGlyphProps): ReactElement {
  if (!Number.isFinite(size) || size <= 0) {
    throw new RangeError("Petra primitive glyph size must be a finite positive number");
  }
  if (!decorative && (label === undefined || label.trim().length === 0)) {
    throw new TypeError("non-decorative Petra primitive glyphs require an accessible label");
  }

  const spec = resolvePetraVectorPrimitive(primitive);
  const token = MOTION.toolPreview;
  const motion = resolveMotion(motionPreference, {
    kind: "decorative",
    durationMs: token.durationMs,
    loops: state === "loading",
  });

  const style = {
    "--petra-primitive-color": `var(--petra-color-${tone})`,
    "--petra-primitive-duration": `${motion.durationMs}ms`,
    "--petra-primitive-easing": `cubic-bezier(${token.easing.join(", ")})`,
  } as CSSProperties;

  return (
    <svg
      className={["petra-primitive-glyph", className].filter(Boolean).join(" ")}
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      focusable="false"
      data-primitive={primitive}
      data-state={state}
      data-motion={motionPreference}
      data-motion-treatment={motion.treatment}
      data-loop={motion.loops ? "true" : "false"}
      data-semantic-boundary={spec.semanticBoundary}
      data-requires={spec.requires}
      style={style}
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": label })}
    >
      {renderGeometry(spec.geometry)}
    </svg>
  );
}

function renderGeometry(geometry: PetraPrimitiveGeometry): ReactElement {
  switch (geometry.kind) {
    case "circle-cluster":
      return (
        <g className="petra-primitive-glyph__cluster">
          {geometry.circles.map((circle, index) => (
            <circle
              key={index}
              cx={circle.x * 100}
              cy={circle.y * 100}
              r={circle.radius * 100}
            />
          ))}
        </g>
      );

    case "rounded-rect": {
      const rect = geometry.rect;
      return (
        <rect
          className="petra-primitive-glyph__rod"
          x={rect.x * 100}
          y={rect.y * 100}
          width={rect.width * 100}
          height={rect.height * 100}
          rx={rect.radius * 100}
        />
      );
    }

    case "ring": {
      const radius = 40 * geometry.outerRadius;
      const strokeWidth = Math.max(
        2,
        20 * (geometry.outerRadius - geometry.innerRadius),
      );
      return (
        <circle
          className="petra-primitive-glyph__ring"
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={strokeWidth}
        />
      );
    }

    case "marker": {
      const shaftWidth = geometry.shaftWidth * 100;
      const headRadius = geometry.headRadius * 100;
      return (
        <g className="petra-primitive-glyph__marker">
          <circle cx="50" cy="34" r={headRadius} />
          <rect
            x={50 - shaftWidth / 2}
            y="42"
            width={shaftWidth}
            height="42"
            rx={shaftWidth / 2}
          />
        </g>
      );
    }

    case "path":
    case "contour":
    case "icon":
      throw new RangeError(
        `PetraPrimitiveGlyph does not render geometry kind ${geometry.kind}; use its specialized adapter`,
      );
  }
}
