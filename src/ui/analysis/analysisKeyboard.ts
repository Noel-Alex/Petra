export interface AnalysisDataScrollKeyEvent {
  readonly key: string;
  stopPropagation(): void;
}

/**
 * Keep Space local to focused, bounded analysis data scrollers so the app-level
 * playback shortcut cannot steal the browser's native scrolling behavior.
 *
 * This event contract intentionally does not expose preventDefault().
 */
export function keepAnalysisDataScrollKeyLocal(
  event: AnalysisDataScrollKeyEvent,
): void {
  if (event.key === " " || event.key === "Spacebar") {
    event.stopPropagation();
  }
}
