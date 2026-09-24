import {
  mechanisticDatasetSchemaKey,
  trajectoryKey,
  validateMechanisticSample,
  type MechanisticDatasetSchemaIdentity,
  type MechanisticSample,
  type TrajectoryIdentity,
} from "./dataset";

export const MECHANISTIC_FORECAST_HORIZON_SCHEMA_VERSION =
  "mechanistic-forecast-horizon-v1" as const;
export const MECHANISTIC_FORECAST_ROW_SCHEMA_VERSION =
  "mechanistic-forecast-row-v1" as const;
export const MECHANISTIC_FORECAST_BUILD_SCHEMA_VERSION =
  "mechanistic-forecast-build-v1" as const;

export interface MechanisticForecastHorizon {
  readonly schemaVersion: typeof MECHANISTIC_FORECAST_HORIZON_SCHEMA_VERSION;
  /** Exact authoritative simulation-tick offset. */
  readonly ticks: number;
}

/**
 * One authoritative trajectory observation prepared for future-horizon pairing.
 *
 * tick must come from the authoritative checkpoint/execution schedule. It is
 * deliberately not inferred from snapshot index, snapshot cadence, or floating
 * simulation time.
 */
export interface MechanisticForecastObservation<TInput, TTarget> {
  readonly datasetVersion: string;
  readonly trajectory: TrajectoryIdentity;
  readonly snapshotIndex: number;
  readonly tick: number;
  readonly simulationTimeHours: number;
  readonly normalizationProfileId: string;
  readonly datasetSchema: MechanisticDatasetSchemaIdentity;
  readonly input: TInput;
  readonly target: TTarget;
}

export interface MechanisticForecastRow<TInput, TTarget> {
  readonly schemaVersion: typeof MECHANISTIC_FORECAST_ROW_SCHEMA_VERSION;
  readonly rowId: string;
  readonly datasetVersion: string;
  readonly trajectory: TrajectoryIdentity;
  readonly trajectoryKey: string;
  readonly normalizationProfileId: string;
  readonly datasetSchema: MechanisticDatasetSchemaIdentity;
  readonly horizon: MechanisticForecastHorizon;
  readonly sourceSnapshotIndex: number;
  readonly sourceTick: number;
  readonly sourceSimulationTimeHours: number;
  readonly targetSnapshotIndex: number;
  readonly targetTick: number;
  readonly targetSimulationTimeHours: number;
  /** Observed authoritative time separation for this exact tick pair. */
  readonly forecastHorizonHours: number;
  readonly input: TInput;
  readonly target: TTarget;
}

export interface MechanisticForecastOmission {
  readonly reason: "missing-exact-target";
  readonly sourceSnapshotIndex: number;
  readonly sourceTick: number;
  readonly requestedTargetTick: number;
  readonly horizon: MechanisticForecastHorizon;
}

export interface MechanisticForecastBuildResult<TInput, TTarget> {
  readonly schemaVersion: typeof MECHANISTIC_FORECAST_BUILD_SCHEMA_VERSION;
  readonly trajectoryKey: string;
  readonly horizons: readonly MechanisticForecastHorizon[];
  readonly rows: readonly MechanisticForecastRow<TInput, TTarget>[];
  readonly omissions: readonly MechanisticForecastOmission[];
}

/**
 * Adds an exact authoritative tick to one already-validated mechanistic sample.
 *
 * The caller must supply the checkpoint tick explicitly. This adapter never
 * derives it from snapshot index, cadence, or simulation time.
 */
export function createMechanisticForecastObservation<TInput, TTarget>(
  sample: MechanisticSample<TInput, TTarget>,
  tick: number,
): MechanisticForecastObservation<TInput, TTarget> {
  validateMechanisticSample(sample);
  requireTick("tick", tick);

  return Object.freeze({
    datasetVersion: sample.datasetVersion,
    trajectory: structuredClone(sample.trajectory),
    snapshotIndex: sample.snapshotIndex,
    tick,
    simulationTimeHours: sample.simulationTimeHours,
    normalizationProfileId: sample.normalizationProfileId,
    datasetSchema: structuredClone(sample.datasetSchema),
    input: structuredClone(sample.input),
    target: structuredClone(sample.target),
  });
}

/**
 * Builds exact source-at-t -> target-at-(t + delta) rows for one trajectory.
 *
 * Missing exact target observations are reported as omissions. The function
 * never interpolates, selects a nearest observation, crosses trajectories, or
 * treats snapshot cadence as a forecast horizon.
 */
export function buildMechanisticForecastRows<TInput, TTarget>(
  observations: readonly MechanisticForecastObservation<TInput, TTarget>[],
  requestedHorizons: readonly MechanisticForecastHorizon[],
): MechanisticForecastBuildResult<TInput, TTarget> {
  if (observations.length === 0) {
    throw new RangeError(
      "forecast row construction requires at least one trajectory observation",
    );
  }
  if (requestedHorizons.length === 0) {
    throw new RangeError(
      "forecast row construction requires at least one forecast horizon",
    );
  }

  const horizons = canonicalizeHorizons(requestedHorizons);
  const first = observations[0]!;
  validateObservation(first, "observations[0]");

  const expectedTrajectoryKey = trajectoryKey(first.trajectory);
  const expectedDatasetVersion = first.datasetVersion;
  const expectedNormalizationProfileId = first.normalizationProfileId;
  const expectedDatasetSchemaKey = mechanisticDatasetSchemaKey(
    first.datasetSchema,
  );

  let previousSnapshotIndex = -1;
  let previousTick = -1;
  let previousSimulationTimeHours = -1;
  const byTick = new Map<
    number,
    MechanisticForecastObservation<TInput, TTarget>
  >();

  for (let index = 0; index < observations.length; index += 1) {
    if (!(index in observations)) {
      throw new TypeError("forecast observations must be a dense array");
    }
    const observation = observations[index]!;
    validateObservation(observation, `observations[${index}]`);

    if (trajectoryKey(observation.trajectory) !== expectedTrajectoryKey) {
      throw new TypeError(
        "forecast observations must belong to exactly one trajectory",
      );
    }
    if (observation.datasetVersion !== expectedDatasetVersion) {
      throw new TypeError(
        "forecast observations must use one exact dataset version",
      );
    }
    if (
      observation.normalizationProfileId !== expectedNormalizationProfileId
    ) {
      throw new TypeError(
        "forecast observations must use one exact normalization profile",
      );
    }
    if (
      mechanisticDatasetSchemaKey(observation.datasetSchema) !==
      expectedDatasetSchemaKey
    ) {
      throw new TypeError(
        "forecast observations must use one exact input/target schema",
      );
    }

    if (observation.snapshotIndex <= previousSnapshotIndex) {
      throw new RangeError(
        "forecast observation snapshotIndex values must be strictly increasing",
      );
    }
    if (observation.tick <= previousTick) {
      throw new RangeError(
        "forecast observation ticks must be strictly increasing",
      );
    }
    if (observation.simulationTimeHours <= previousSimulationTimeHours) {
      throw new RangeError(
        "forecast observation simulationTimeHours values must be strictly increasing",
      );
    }
    if (byTick.has(observation.tick)) {
      throw new RangeError("forecast observations contain a duplicate tick");
    }

    previousSnapshotIndex = observation.snapshotIndex;
    previousTick = observation.tick;
    previousSimulationTimeHours = observation.simulationTimeHours;
    byTick.set(observation.tick, observation);
  }

  const rows: MechanisticForecastRow<TInput, TTarget>[] = [];
  const omissions: MechanisticForecastOmission[] = [];

  for (const source of observations) {
    for (const horizon of horizons) {
      const targetTick = source.tick + horizon.ticks;
      if (!Number.isSafeInteger(targetTick)) {
        throw new RangeError(
          "forecast source tick plus requested horizon exceeds safe integer range",
        );
      }
      const target = byTick.get(targetTick);
      if (target === undefined) {
        omissions.push(
          Object.freeze({
            reason: "missing-exact-target" as const,
            sourceSnapshotIndex: source.snapshotIndex,
            sourceTick: source.tick,
            requestedTargetTick: targetTick,
            horizon,
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
          "exact forecast target must occur at a later finite simulation time",
        );
      }

      const rowId = mechanisticForecastRowId({
        trajectoryKey: expectedTrajectoryKey,
        datasetVersion: expectedDatasetVersion,
        normalizationProfileId: expectedNormalizationProfileId,
        datasetSchemaKey: expectedDatasetSchemaKey,
        sourceTick: source.tick,
        targetTick,
        horizonTicks: horizon.ticks,
      });

      rows.push(
        Object.freeze({
          schemaVersion: MECHANISTIC_FORECAST_ROW_SCHEMA_VERSION,
          rowId,
          datasetVersion: expectedDatasetVersion,
          trajectory: structuredClone(source.trajectory),
          trajectoryKey: expectedTrajectoryKey,
          normalizationProfileId: expectedNormalizationProfileId,
          datasetSchema: structuredClone(source.datasetSchema),
          horizon,
          sourceSnapshotIndex: source.snapshotIndex,
          sourceTick: source.tick,
          sourceSimulationTimeHours: source.simulationTimeHours,
          targetSnapshotIndex: target.snapshotIndex,
          targetTick,
          targetSimulationTimeHours: target.simulationTimeHours,
          forecastHorizonHours,
          input: structuredClone(source.input),
          target: structuredClone(target.target),
        }),
      );
    }
  }

  return Object.freeze({
    schemaVersion: MECHANISTIC_FORECAST_BUILD_SCHEMA_VERSION,
    trajectoryKey: expectedTrajectoryKey,
    horizons: Object.freeze(horizons),
    rows: Object.freeze(rows),
    omissions: Object.freeze(omissions),
  });
}

function canonicalizeHorizons(
  horizons: readonly MechanisticForecastHorizon[],
): MechanisticForecastHorizon[] {
  const canonical: MechanisticForecastHorizon[] = [];
  const seenTicks = new Set<number>();

  for (let index = 0; index < horizons.length; index += 1) {
    if (!(index in horizons)) {
      throw new TypeError("forecast horizons must be a dense array");
    }
    const horizon = horizons[index]!;
    if (
      horizon === null ||
      typeof horizon !== "object" ||
      Array.isArray(horizon)
    ) {
      throw new TypeError(`forecast horizon ${index} must be an object`);
    }
    if (
      horizon.schemaVersion !==
      MECHANISTIC_FORECAST_HORIZON_SCHEMA_VERSION
    ) {
      throw new RangeError("unsupported mechanistic forecast horizon schema");
    }
    requirePositiveTick(`forecast horizon ${index}.ticks`, horizon.ticks);
    if (seenTicks.has(horizon.ticks)) {
      throw new RangeError(
        `duplicate mechanistic forecast horizon: ${horizon.ticks} ticks`,
      );
    }
    seenTicks.add(horizon.ticks);
    canonical.push(
      Object.freeze({
        schemaVersion: MECHANISTIC_FORECAST_HORIZON_SCHEMA_VERSION,
        ticks: horizon.ticks,
      }),
    );
  }

  canonical.sort((left, right) => left.ticks - right.ticks);
  return canonical;
}

function validateObservation<TInput, TTarget>(
  observation: MechanisticForecastObservation<TInput, TTarget>,
  name: string,
): void {
  if (
    observation === null ||
    typeof observation !== "object" ||
    Array.isArray(observation)
  ) {
    throw new TypeError(`${name} must be an object`);
  }
  validateMechanisticSample(observation);
  requireTick(`${name}.tick`, observation.tick);
}

function requireTick(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

function requirePositiveTick(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new RangeError(`${name} must be a positive safe integer`);
  }
}

function mechanisticForecastRowId(args: {
  trajectoryKey: string;
  datasetVersion: string;
  normalizationProfileId: string;
  datasetSchemaKey: string;
  sourceTick: number;
  targetTick: number;
  horizonTicks: number;
}): string {
  return encodeParts([
    MECHANISTIC_FORECAST_ROW_SCHEMA_VERSION,
    args.trajectoryKey,
    args.datasetVersion,
    args.normalizationProfileId,
    args.datasetSchemaKey,
    String(args.sourceTick),
    String(args.targetTick),
    String(args.horizonTicks),
  ]);
}

function encodeParts(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}
