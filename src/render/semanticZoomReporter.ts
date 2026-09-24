import {
  semanticZoomLevel,
  type SemanticZoomLevel,
} from "./model";

export interface SemanticZoomReport {
  readonly level: SemanticZoomLevel;
  readonly changed: boolean;
}

/**
 * Presentation-only named semantic zoom reporting.
 * Raw numeric camera zoom remains renderer state and never becomes React/science authority.
 */
export function resolveSemanticZoomReport(
  previousLevel: SemanticZoomLevel | null,
  zoom: number,
): SemanticZoomReport {
  const level = semanticZoomLevel(zoom);
  return {
    level,
    changed: level !== previousLevel,
  };
}
