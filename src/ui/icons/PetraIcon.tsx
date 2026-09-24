import type { ReactElement } from "react";

import {
  PETRA_ICON_VIEWBOX,
  iconSpec,
  type IconPrimitive,
  type PetraIconName,
} from "./spec";

export interface PetraIconProps {
  readonly name: PetraIconName;
  readonly size?: number;
  readonly label?: string;
  readonly decorative?: boolean;
  readonly className?: string;
}

/**
 * Thin React adapter over Petra's framework-neutral icon geometry.
 * Geometry carries identity; component styling supplies color only.
 */
export function PetraIcon({
  name,
  size = 20,
  label,
  decorative = false,
  className,
}: PetraIconProps): ReactElement {
  const spec = iconSpec(name);
  const accessibleLabel = label ?? spec.label;

  return (
    <svg
      className={className}
      viewBox={PETRA_ICON_VIEWBOX.join(" ")}
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={spec.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "img", "aria-label": accessibleLabel })}
    >
      <PetraIconGeometry name={name} />
    </svg>
  );
}

export function PetraIconGeometry({
  name,
}: {
  readonly name: PetraIconName;
}): ReactElement {
  const spec = iconSpec(name);
  return (
    <>
      {spec.primitives.map((primitive, index) =>
        renderPrimitive(primitive, index),
      )}
    </>
  );
}

function renderPrimitive(
  primitive: IconPrimitive,
  index: number,
): ReactElement {
  const key = `${primitive.kind}-${index}`;

  if (primitive.kind === "line") {
    return (
      <line
        key={key}
        x1={primitive.x1}
        y1={primitive.y1}
        x2={primitive.x2}
        y2={primitive.y2}
      />
    );
  }

  if (primitive.kind === "circle") {
    return (
      <circle
        key={key}
        cx={primitive.cx}
        cy={primitive.cy}
        r={primitive.r}
      />
    );
  }

  if (primitive.kind === "rect") {
    return (
      <rect
        key={key}
        x={primitive.x}
        y={primitive.y}
        width={primitive.width}
        height={primitive.height}
        {...(primitive.rx === undefined ? {} : { rx: primitive.rx })}
      />
    );
  }

  const points = primitive.points
    .map(([x, y]) => `${x},${y}`)
    .join(" ");

  return primitive.closed === true ? (
    <polygon key={key} points={points} />
  ) : (
    <polyline key={key} points={points} />
  );
}
