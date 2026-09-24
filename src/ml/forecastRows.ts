export const MECHANISTIC_FORECAST_ROW_SET_SCHEMA_VERSION =
  "petra-ml-forecast-row-set-v1" as const;

export const MECHANISTIC_FORECAST_ROW_SCHEMA_VERSION =
  "petra-ml-forecast-row-v1" as const;

export const MECHANISTIC_FORECAST_OMISSION_SCHEMA_VERSION =
  "petra-ml-forecast-omission-v1" as const;

export interface AuthoritativeForecastObservation<TInput, TTarget> {
  readonly snapshotIndex: number;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly input: TInput;
  readonly target: TTarget;
}

export interface MechanisticForecastRow<TInput, TTarget> {
  readonly schemaVersion: typeof MECHANISTIC_FORECAST_ROW_SCHEMA_VERSION;
  readonly rowId: string;
  readonly splitGroupKey: string;
  readonly trajectoryKey: string;
  readonly sourceSnapshotIndex: number;
  readonly targetSnapshotIndex: number;
  readonly sourceTick: number;
  readonly targetTick: number;
  readonly sourceTimeHours: number;
  readonly targetTimeHours: number;
  readonly forecastHorizonTicks: number;
  readonly forecastHorizonHours: number;
  readonly input: TInput;
  readonly target: TTarget;
}

export interface MechanisticForecastTargetOmission {
  readonly schemaVersion: typeof MECHANISTIC_FORECAST_OMISSION_SCHEMA_VERSION;
  readonly splitGroupKey: string;
  readonly trajectoryKey: string;
  readonly sourceSnapshotIndex: number;
  readonly sourceTick: number;
  readonly targetTick: number;
  readonly forecastHorizonTicks: number;
  readonly reason: "missing-exact-target-observation";
}

export interface MechanisticForecastRowSet<TInput, TTarget> {
  readonly schemaVersion: typeof MECHANISTIC_FORECAST_ROW_SET_SCHEMA_VERSION;
  readonly splitGroupKey: string;
  readonly trajectoryKey: string;
  readonly requestedHorizonTicks: readonly number[];
  readonly observationCount: number;
  readonly rows: readonly MechanisticForecastRow<TInput, TTarget>[];
  readonly omissions: readonly MechanisticForecastTargetOmission[];
}

/**
 * Pairs one authoritative trajectory's projected observations at exact tick
 * offsets. Targets are never interpolated and never borrowed from another
 * trajectory. Missing exact targets remain visible as omissions so a caller
 * cannot mistake a truncated/undersampled trajectory for complete coverage.
 *
 * This helper deliberately returns forecast-row identity separate from
 * MechanisticSample.snapshotIndex. Multiple requested horizons may share the
 * same source observation, so pretending each forecast row is a new biological
 * snapshot would corrupt provenance.
 */
export function buildExactMechanisticForecastRows<TInput, TTarget>(args: {
  readonly splitGroupKey: string;
  readonly trajectoryKey: string;
  readonly requestedHorizonTicks: readonly number[];
  readonly observations: readonly AuthoritativeForecastObservation<
    TInput,
    TTarget
  >[];
}): MechanisticForecastRowSet<TInput, TTarget> {
  requireCanonicalText("splitGroupKey", args.splitGroupKey);
  requireCanonicalText("trajectoryKey", args.trajectoryKey);
  validateRequestedHorizons(args.requestedHorizonTicks);
  validateObservations(args.observations);

  const observationByTick = new Map<
    number,
    AuthoritativeForecastObservation<TInput, TTarget>
  >();
  for (const observation of args.observations) {
    observationByTick.set(observation.tick, observation);
  }

  const rows: MechanisticForecastRow<TInput, TTarget>[] = [];
  const omissions: MechanisticForecastTargetOmission[] = [];

  for (const source of args.observations) {
    for (const forecastHorizonTicks of args.requestedHorizonTicks) {
      const targetTick = source.tick + forecastHorizonTicks;
      if (!Number.isSafeInteger(targetTick)) {
        throw new RangeError(
          `forecast target tick exceeds safe integer range for source tick ${source.tick} and horizon ${forecastHorizonTicks}`,
        );
      }

      const target = observationByTick.get(targetTick);
      if (target === undefined) {
        omissions.push(
          Object.freeze({
            schemaVersion: MECHANISTIC_FORECAST_OMISSION_SCHEMA_VERSION,
            splitGroupKey: args.splitGroupKey,
            trajectoryKey: args.trajectoryKey,
            sourceSnapshotIndex: source.snapshotIndex,
            sourceTick: source.tick,
            targetTick,
            forecastHorizonTicks,
            reason: "missing-exact-target-observation" as const,
          }),
        );
        continue;
      }

      const forecastHorizonHours =
        target.simulationTimeHours - source.simulationTimeHours;
      if (
        !Number.isFinite(forecastHorizonHours) ||
        forecastHorizonHours <= 0
      ) {
        throw new RangeError(
          `forecast horizon from tick ${source.tick} to ${target.tick} must advance biological time`,
        );
      }

      rows.push(
        Object.freeze({
          schemaVersion: MECHANISTIC_FORECAST_ROW_SCHEMA_VERSION,
          rowId: forecastRowId(
            args.trajectoryKey,
            source.tick,
            target.tick,
          ),
          splitGroupKey: args.splitGroupKey,
          trajectoryKey: args.trajectoryKey,
          sourceSnapshotIndex: source.snapshotIndex,
          targetSnapshotIndex: target.snapshotIndex,
          sourceTick: source.tick,
          targetTick: target.tick,
          sourceTimeHours: source.simulationTimeHours,
          targetTimeHours: target.simulationTimeHours,
          forecastHorizonTicks,
          forecastHorizonHours,
          input: structuredClone(source.input),
          target: structuredClone(target.target),
        }),
      );
    }
  }

  return Object.freeze({
    schemaVersion: MECHANISTIC_FORECAST_ROW_SET_SCHEMA_VERSION,
    splitGroupKey: args.splitGroupKey,
    trajectoryKey: args.trajectoryKey,
    requestedHorizonTicks: Object.freeze([...args.requestedHorizonTicks]),
    observationCount: args.observations.length,
    rows: Object.freeze(rows),
    omissions: Object.freeze(omissions),
  });
}

function validateRequestedHorizons(
  requestedHorizonTicks: readonly number[],
): void {
  if (requestedHorizonTicks.length === 0) {
    throw new RangeError("forecast rows require at least one requested horizon");
  }

  let previous = 0;
  for (let index = 0; index < requestedHorizonTicks.length; index += 1) {
    if (!(index in requestedHorizonTicks)) {
      throw new RangeError("requested forecast horizons must be a dense array");
    }
    const horizon = requestedHorizonTicks[index];
    if (!Number.isSafeInteger(horizon) || horizon < 1) {
      throw new RangeError(
        "requested forecast horizons must be positive safe-integer tick counts",
      );
    }
    if (horizon <= previous) {
      throw new RangeError(
        "requested forecast horizons must be strictly increasing and unique",
      );
    }
    previous = horizon;
  }
}

function validateObservations<TInput, TTarget>(
  observations: readonly AuthoritativeForecastObservation<TInput, TTarget>[],
): void {
  if (observations.length === 0) {
    throw new RangeError(
      "forecast rows require at least one authoritative observation",
    );
  }

  let previousTick = -1;
  let previousTime = -Infinity;

  for (let index = 0; index < observations.length; index += 1) {
    if (!(index in observations)) {
      throw new RangeError(
        "authoritative forecast observations must be a dense array",
      );
    }
    const observation = observations[index];
    if (observation === undefined || observation === null) {
      throw new TypeError(
        `authoritative forecast observation ${index} must be an object`,
      );
    }
    if (observation.snapshotIndex !== index) {
      throw new RangeError(
        `authoritative forecast observations must retain contiguous snapshot indices; expected ${index}, received ${observation.snapshotIndex}`,
      );
    }
    if (!Number.isSafeInteger(observation.tick) || observation.tick < 0) {
      throw new RangeError(
        `authoritative forecast observation ${index} tick must be a non-negative safe integer`,
      );
    }
    if (observation.tick <= previousTick) {
      throw new RangeError(
        "authoritative forecast observation ticks must be strictly increasing",
      );
    }
    if (
      !Number.isFinite(observation.simulationTimeHours) ||
      observation.simulationTimeHours < 0
    ) {
      throw new RangeError(
        `authoritative forecast observation ${index} simulationTimeHours must be finite and non-negative`,
      );
    }
    if (observation.simulationTimeHours <= previousTime) {
      throw new RangeError(
        "authoritative forecast observation biological time must be strictly increasing",
      );
    }

    previousTick = observation.tick;
    previousTime = observation.simulationTimeHours;
  }
}

function forecastRowId(
  trajectoryKey: string,
  sourceTick: number,
  targetTick: number,
): string {
  return `forecast:${encodePart(trajectoryKey)}:source-tick:${sourceTick}:target-tick:${targetTick}`;
}

function encodePart(value: string): string {
  return `${value.length}:${value}`;
}

function requireCanonicalText(name: string, value: string): void {
  if (typeof value !== "string" || value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name} must be a non-empty canonical string`);
  }
}
