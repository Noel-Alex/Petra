import type { CSSProperties, ReactElement } from "react";

import {
  biologyMotifPlan,
  type BiologyMotifBranch,
  type BiologyMotifField,
  type BiologyMotifRod,
  type BiologyMotifVariant,
} from "./biologyMotif";
import { calmVectorCssVariables } from "./calmVector";

import "./CalmBiologyMotif.css";

export interface CalmBiologyMotifProps {
  readonly variant: BiologyMotifVariant;
  readonly className?: string;
}

/**
 * Decorative vector motif built entirely from code-rendered biological
 * primitives. It never reads or represents authoritative simulation values.
 */
export function CalmBiologyMotif({
  variant,
  className,
}: CalmBiologyMotifProps): ReactElement {
  const plan = biologyMotifPlan(variant);
  const style = calmVectorCssVariables() as CSSProperties;

  return (
    <svg
      className={["petra-biology-motif", className].filter(Boolean).join(" ")}
      viewBox="0 0 160 120"
      role="presentation"
      aria-hidden="true"
      focusable="false"
      data-motif={variant}
      style={style}
    >
      <ellipse
        className="petra-biology-motif__dish"
        cx="80"
        cy="60"
        rx="66"
        ry="49"
      />
      <ellipse
        className="petra-biology-motif__dish-inner"
        cx="80"
        cy="60"
        rx="59"
        ry="42"
      />
      {plan.primitives.map((primitive) => {
        switch (primitive.kind) {
          case "field":
            return <Field key={primitive.id} field={primitive} />;
          case "rod":
            return <Rod key={primitive.id} rod={primitive} />;
          case "branch":
            return <Branch key={primitive.id} branch={primitive} />;
        }
      })}
    </svg>
  );
}

function Field({ field }: { readonly field: BiologyMotifField }): ReactElement {
  return (
    <ellipse
      className="petra-biology-motif__field"
      data-tone={field.tone}
      cx={field.cx}
      cy={field.cy}
      rx={field.rx}
      ry={field.ry}
      opacity={field.opacity}
    />
  );
}

function Rod({ rod }: { readonly rod: BiologyMotifRod }): ReactElement {
  const cx = rod.x + rod.length / 2;
  const cy = rod.y + rod.thickness / 2;

  return (
    <rect
      className="petra-biology-motif__rod"
      data-tone={rod.tone}
      x={rod.x}
      y={rod.y}
      width={rod.length}
      height={rod.thickness}
      rx={rod.thickness / 2}
      opacity={rod.opacity}
      transform={`rotate(${rod.rotationDeg} ${cx} ${cy})`}
    />
  );
}

function Branch({
  branch,
}: {
  readonly branch: BiologyMotifBranch;
}): ReactElement {
  return (
    <polyline
      className="petra-biology-motif__branch"
      data-tone={branch.tone}
      points={branch.points.map(([x, y]) => `${x},${y}`).join(" ")}
      strokeWidth={branch.width}
      opacity={branch.opacity}
    />
  );
}
