import {
  semanticZoomLevel,
  type SemanticZoomLevel,
  type SemanticZoomPolicy,
} from "../model";

export interface SemanticZoomReporter {
  readonly currentLevel: () => SemanticZoomLevel;
  /**
   * Re-evaluates presentation zoom and returns the current named level.
   * The callback fires only when the named level changes.
   */
  readonly reportZoom: (zoom: number) => SemanticZoomLevel;
}

/**
 * Presentation-only semantic zoom bridge.
 *
 * Numeric camera zoom remains renderer-local. React receives only named
 * presentation levels, and only when a threshold crossing changes that name.
 */
export function createSemanticZoomReporter(
  initialZoom: number,
  onLevelChange: (level: SemanticZoomLevel) => void,
  policy?: SemanticZoomPolicy,
): SemanticZoomReporter {
  let current = semanticZoomLevel(initialZoom, policy);
  onLevelChange(current);

  return {
    currentLevel: () => current,
    reportZoom(zoom) {
      const next = semanticZoomLevel(zoom, policy);
      if (next === current) return current;
      current = next;
      onLevelChange(next);
      return current;
    },
  };
}
