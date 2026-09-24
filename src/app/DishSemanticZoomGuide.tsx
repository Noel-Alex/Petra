import type { CSSProperties } from "react";

import type { SemanticZoomLevel } from "../render/model";
import type { MotionPreference } from "../ui/motion/policy";
import { planSemanticTransition } from "../ui/motion/semanticTransitions";
import { SEMANTIC_ZOOM_GUIDE, surfaceMotionCss } from "./motionAdapter";

export interface DishSemanticZoomGuideProps {
  readonly previousLevel: SemanticZoomLevel;
  readonly currentLevel: SemanticZoomLevel;
  readonly motion: MotionPreference;
}

/**
 * Presentation-only guide for the renderer's named semantic zoom level.
 * Numeric camera zoom remains inside Pixi; this component receives only the
 * already-resolved semantic name.
 */
export function DishSemanticZoomGuide({
  previousLevel,
  currentLevel,
  motion,
}: DishSemanticZoomGuideProps) {
  const transition = surfaceMotionCss(
    planSemanticTransition({
      from: previousLevel,
      to: currentLevel,
      preference: motion,
    }),
  );
  const currentEntry = SEMANTIC_ZOOM_GUIDE.find(
    (entry) => entry.id === currentLevel,
  );

  return (
    <div
      className="dish-semantic-guide"
      role="note"
      aria-label={
        currentEntry === undefined
          ? "Semantic zoom meaning"
          : "Semantic zoom meaning. Current level: " + currentEntry.label
      }
      data-semantic-level={currentLevel}
      data-transition-treatment={transition.treatment}
      style={
        {
          "--semantic-guide-motion-ms": transition.duration,
          "--semantic-guide-easing": transition.easing,
        } as CSSProperties
      }
    >
      {SEMANTIC_ZOOM_GUIDE.map((entry) => {
        const active = entry.id === currentLevel;
        return (
          <span
            key={entry.id}
            data-semantic-view={entry.id}
            data-active={active ? "true" : "false"}
            aria-current={active ? "true" : undefined}
          >
            <strong>{entry.label}</strong>
            <span>{entry.meaning}</span>
            {active ? (
              <span className="dish-semantic-guide__current">Current</span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}
