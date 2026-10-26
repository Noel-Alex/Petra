export const MINIMUM_VECTOR_REFRESH_INTERVAL_MS = 100;
export const MINIMUM_RASTER_REFRESH_INTERVAL_MS = 1000 / 30;

export interface DishTransitionRefreshInput {
  readonly nowMs: number;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly lastVectorSourcePreparedAtMs: number;
  readonly lastRasterPreparedAtMs: number;
  readonly hasPreparedFrame: boolean;
}

export interface DishTransitionRefreshDecision {
  readonly complete: boolean;
  readonly evaluateFrame: boolean;
  readonly refreshVectorSource: boolean;
  readonly refreshRaster: boolean;
}

/**
 * Resolve renderer-only interpolation work deadlines before walking any full
 * grid buffers. The simulation remains authoritative and keeps its own cadence.
 */
export function resolveDishTransitionRefresh(
  input: DishTransitionRefreshInput,
): DishTransitionRefreshDecision {
  assertFiniteNonNegative("nowMs", input.nowMs);
  assertFiniteNonNegative("elapsedMs", input.elapsedMs);
  assertFiniteNonNegative("durationMs", input.durationMs);
  assertPreparedAt("lastVectorSourcePreparedAtMs", input.lastVectorSourcePreparedAtMs);
  assertPreparedAt("lastRasterPreparedAtMs", input.lastRasterPreparedAtMs);

  const complete =
    input.durationMs === 0 || input.elapsedMs >= input.durationMs;
  const refreshVectorSource =
    complete ||
    !input.hasPreparedFrame ||
    input.nowMs - input.lastVectorSourcePreparedAtMs >=
      MINIMUM_VECTOR_REFRESH_INTERVAL_MS;
  const refreshRaster =
    complete ||
    !input.hasPreparedFrame ||
    input.nowMs - input.lastRasterPreparedAtMs >=
      MINIMUM_RASTER_REFRESH_INTERVAL_MS;

  return Object.freeze({
    complete,
    evaluateFrame: refreshVectorSource || refreshRaster,
    refreshVectorSource,
    refreshRaster,
  });
}

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
}

function assertPreparedAt(name: string, value: number): void {
  if (value === Number.NEGATIVE_INFINITY) return;
  assertFiniteNonNegative(name, value);
}
