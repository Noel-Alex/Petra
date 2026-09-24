import type { CSSProperties, ReactElement } from "react";

import type { SemanticZoomLevel } from "../render/model";
import type { MotionPreference } from "../ui/motion/policy";
import {
  SEMANTIC_ZOOM_GUIDE,
  semanticZoomGuideMotionCss,
} from "./motionAdapter";

export interface SemanticZoomGuideProps {
  readonly level: SemanticZoomLevel | null;
  readonly motion: MotionPreference;
}

/** Presentation-only explanation of the renderer's named semantic zoom state. */
export function SemanticZoomGuide({
  level,
  motion,
}: SemanticZoomGuideProps): ReactElement {
  const motionCss = semanticZoomGuideMotionCss(motion);
  const style = {
    "--semantic-guide-motion-ms": motionCss.duration,
    "--semantic-guide-motion-easing": motionCss.easing,
  } as CSSProperties;

  return (
    <div
      className="dish-semantic-guide"
      role="note"
      aria-label="Semantic zoom meaning"
      data-semantic-level={level ?? "unavailable"}
      data-transition-treatment={motionCss.treatment}
      style={style}
    >
      {SEMANTIC_ZOOM_GUIDE.map((entry) => {
        const active = entry.id === level;
        return (
          <span
            key={entry.id}
            data-semantic-view={entry.id}
            data-active={active ? "true" : undefined}
            aria-current={active ? "step" : undefined}
          >
            <strong>{entry.label}</strong>
            <span>{entry.meaning}</span>
          </span>
        );
      })}
    </div>
  );
}
