export interface ResizeRedrawScheduler {
  schedule(): void;
  cancel(): void;
}

export interface ResizeRedrawSchedulerOptions {
  readonly requestFrame?: (callback: FrameRequestCallback) => number;
  readonly cancelFrame?: (handle: number) => void;
}

/**
 * Coalesces container ResizeObserver bursts into one animation-frame resize/redraw.
 *
 * The resize callback runs immediately before redraw so scene geometry reads the
 * renderer's current dimensions. This is presentation scheduling only; it does
 * not alter camera or simulation state.
 */
export function createResizeRedrawScheduler(
  resize: () => void,
  redraw: () => void,
  options: ResizeRedrawSchedulerOptions = {},
): ResizeRedrawScheduler {
  const requestFrame =
    options.requestFrame ??
    ((callback: FrameRequestCallback) => globalThis.requestAnimationFrame(callback));
  const cancelFrame =
    options.cancelFrame ??
    ((handle: number) => globalThis.cancelAnimationFrame(handle));

  let frame: number | null = null;
  let cancelled = false;

  return {
    schedule() {
      if (cancelled || frame !== null) {
        return;
      }

      frame = requestFrame(() => {
        frame = null;
        if (cancelled) {
          return;
        }
        resize();
        redraw();
      });
    },

    cancel() {
      cancelled = true;
      if (frame !== null) {
        cancelFrame(frame);
        frame = null;
      }
    },
  };
}
