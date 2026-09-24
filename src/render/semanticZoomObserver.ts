import type { SemanticZoomLevel } from "./model";

export interface SemanticZoomLevelObserver {
  readonly current: () => SemanticZoomLevel | null;
  readonly update: (level: SemanticZoomLevel) => boolean;
  readonly reset: () => void;
  readonly dispose: () => void;
}

/**
 * Presentation-only bridge for renderer -> adapter semantic zoom updates.
 *
 * The first observed level is emitted once. Subsequent updates notify only when
 * the named semantic level changes, so camera animation frames inside one level
 * never force React state updates. Resetting re-arms the initial emission for a
 * new renderer lifecycle; disposed observers become inert.
 */
export function createSemanticZoomLevelObserver(
  onChange: (level: SemanticZoomLevel) => void,
): SemanticZoomLevelObserver {
  let currentLevel: SemanticZoomLevel | null = null;
  let disposed = false;

  return {
    current() {
      return currentLevel;
    },

    update(level) {
      if (disposed || currentLevel === level) return false;
      currentLevel = level;
      onChange(level);
      return true;
    },

    reset() {
      if (disposed) return;
      currentLevel = null;
    },

    dispose() {
      disposed = true;
      currentLevel = null;
    },
  };
}
