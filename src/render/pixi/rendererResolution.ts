export const MAX_RENDERER_RESOLUTION = 2;
const RESOLUTION_EPSILON = 1e-3;

export interface ResolutionMediaQueryList {
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

export interface RendererResolutionEnvironment {
  readDevicePixelRatio(): number | undefined;
  readonly matchMedia?: (query: string) => ResolutionMediaQueryList;
}

export interface RendererResolutionWatcher {
  dispose(): void;
}

export function normalizeDevicePixelRatio(
  devicePixelRatio: number | undefined,
): number {
  if (
    devicePixelRatio === undefined ||
    !Number.isFinite(devicePixelRatio) ||
    devicePixelRatio <= 0
  ) {
    return 1;
  }
  return devicePixelRatio;
}

export function rendererResolutionForDevicePixelRatio(
  devicePixelRatio: number | undefined,
): number {
  return Math.min(
    MAX_RENDERER_RESOLUTION,
    normalizeDevicePixelRatio(devicePixelRatio),
  );
}

export function nextRendererResolution(
  currentResolution: number,
  devicePixelRatio: number | undefined,
): number | null {
  const desired = rendererResolutionForDevicePixelRatio(devicePixelRatio);
  return Math.abs(desired - currentResolution) > RESOLUTION_EPSILON
    ? desired
    : null;
}

/**
 * Watch display-scale changes without polling every render frame.
 *
 * The watcher binds to the current raw DPR media query. When that query stops
 * matching, it re-reads DPR, reports a changed Petra-capped resolution, then
 * rebinds to the new raw DPR so later monitor/zoom transitions remain visible.
 */
export function watchRendererResolution(
  environment: RendererResolutionEnvironment,
  currentResolution: number,
  onResolutionChange: (resolution: number) => void,
): RendererResolutionWatcher {
  if (environment.matchMedia === undefined) {
    return { dispose() {} };
  }

  let disposed = false;
  let trackedResolution = currentResolution;
  let activeQuery: ResolutionMediaQueryList | null = null;
  let activeListener: (() => void) | null = null;

  const unbind = () => {
    if (activeQuery !== null && activeListener !== null) {
      activeQuery.removeEventListener("change", activeListener);
    }
    activeQuery = null;
    activeListener = null;
  };

  const bind = () => {
    if (disposed) return;
    const rawDpr = normalizeDevicePixelRatio(
      environment.readDevicePixelRatio(),
    );

    let query: ResolutionMediaQueryList;
    try {
      query = environment.matchMedia!(
        `(resolution: ${rawDpr}dppx)`,
      );
    } catch {
      return;
    }

    const listener = () => {
      if (disposed) return;
      unbind();

      const next = nextRendererResolution(
        trackedResolution,
        environment.readDevicePixelRatio(),
      );
      if (next !== null) {
        trackedResolution = next;
        onResolutionChange(next);
      }

      bind();
    };

    activeQuery = query;
    activeListener = listener;
    query.addEventListener("change", listener);
  };

  bind();

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      unbind();
    },
  };
}
