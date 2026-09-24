import { assertSimulationSeed } from "../sim/seed";

export type DatasetSplit = "train" | "validation" | "test";

export interface MechanisticDatasetSchemaIdentity {
  readonly schemaVersion: "mechanistic-dataset-schema-v1";
  readonly inputSchemaVersion: string;
  readonly targetSchemaVersion: string;
}

export interface DatasetGroupIdentity {
  readonly engineVersion: string;
  readonly parameterSetHash: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  /**
   * Exact authoritative initialization/run-condition identity. Seed remains
   * outside this fingerprint so stochastic replicas of one condition stay in
   * exactly one dataset split.
   */
  readonly runConditionFingerprint: string;
  /**
   * Caller-defined intervention family used as the leakage boundary alongside
   * mechanism + run-condition identity.
   */
  readonly groupId: string;
}

export interface TrajectoryIdentity {
  readonly group: DatasetGroupIdentity;
  readonly seed: number;
  readonly interventionFingerprint: string;
}

export interface MechanisticSample<TInput, TTarget> {
  readonly datasetVersion: string;
  readonly trajectory: TrajectoryIdentity;
  readonly snapshotIndex: number;
  readonly simulationTimeHours: number;
  readonly normalizationProfileId: string;
  readonly datasetSchema: MechanisticDatasetSchemaIdentity;
  readonly input: TInput;
  readonly target: TTarget;
  readonly terminationReason?: string;
}

export interface SplitPolicy {
  readonly version: string;
  readonly trainFraction: number;
  readonly validationFraction: number;
  readonly testFraction: number;
}

export const DEFAULT_SPLIT_POLICY: SplitPolicy = Object.freeze({
  version: "trajectory-group-v2",
  trainFraction: 0.7,
  validationFraction: 0.15,
  testFraction: 0.15,
});

export function validateMechanisticSample<TInput, TTarget>(
  sample: MechanisticSample<TInput, TTarget>,
): void {
  requireNonEmpty("datasetVersion", sample.datasetVersion);
  validateGroupIdentity(sample.trajectory.group);
  assertSimulationSeed(sample.trajectory.seed);
  requireNonEmpty(
    "interventionFingerprint",
    sample.trajectory.interventionFingerprint,
  );
  requireNonEmpty("normalizationProfileId", sample.normalizationProfileId);
  validateMechanisticDatasetSchemaIdentity(sample.datasetSchema);

  if (!Number.isInteger(sample.snapshotIndex) || sample.snapshotIndex < 0) {
    throw new RangeError("snapshotIndex must be a non-negative integer");
  }
  if (
    !Number.isFinite(sample.simulationTimeHours) ||
    sample.simulationTimeHours < 0
  ) {
    throw new RangeError(
      "simulationTimeHours must be finite and non-negative",
    );
  }
}

export function validateMechanisticDatasetSchemaIdentity(
  identity: MechanisticDatasetSchemaIdentity,
): void {
  if (
    identity === null ||
    typeof identity !== "object" ||
    Array.isArray(identity)
  ) {
    throw new TypeError("mechanistic dataset schema identity must be an object");
  }
  if (identity.schemaVersion !== "mechanistic-dataset-schema-v1") {
    throw new RangeError("unsupported mechanistic dataset schema version");
  }
  if (typeof identity.inputSchemaVersion !== "string") {
    throw new TypeError("inputSchemaVersion must be a string");
  }
  if (typeof identity.targetSchemaVersion !== "string") {
    throw new TypeError("targetSchemaVersion must be a string");
  }
  requireNonEmpty("inputSchemaVersion", identity.inputSchemaVersion);
  requireNonEmpty("targetSchemaVersion", identity.targetSchemaVersion);
}

export function mechanisticDatasetSchemaKey(
  identity: MechanisticDatasetSchemaIdentity,
): string {
  validateMechanisticDatasetSchemaIdentity(identity);
  return encodeParts([
    identity.schemaVersion,
    identity.inputSchemaVersion,
    identity.targetSchemaVersion,
  ]);
}

export function trajectoryKey(identity: TrajectoryIdentity): string {
  validateGroupIdentity(identity.group);
  assertSimulationSeed(identity.seed);
  requireNonEmpty("interventionFingerprint", identity.interventionFingerprint);

  return encodeParts([
    splitGroupKey(identity.group),
    String(identity.seed),
    identity.interventionFingerprint,
  ]);
}

export function splitGroupKey(group: DatasetGroupIdentity): string {
  validateGroupIdentity(group);
  return encodeParts([
    group.engineVersion,
    group.parameterSetHash,
    group.scenarioId,
    group.scenarioVersion,
    group.runConditionFingerprint,
    group.groupId,
  ]);
}

/**
 * Assigns an entire mechanism/scenario/run-condition/intervention group to
 * exactly one split. Snapshot index, simulation time and seed are deliberately
 * absent from the hash so adjacent frames and stochastic replicas cannot leak
 * across splits.
 */
export function assignDatasetSplit(
  group: DatasetGroupIdentity,
  policy: SplitPolicy = DEFAULT_SPLIT_POLICY,
): DatasetSplit {
  validateSplitPolicy(policy);
  const unit = stableUnitInterval(
    encodeParts([policy.version, splitGroupKey(group)]),
  );

  if (unit < policy.trainFraction) return "train";
  if (unit < policy.trainFraction + policy.validationFraction) {
    return "validation";
  }
  return "test";
}

export function validateSplitPolicy(policy: SplitPolicy): void {
  requireNonEmpty("split policy version", policy.version);
  const fractions = [
    policy.trainFraction,
    policy.validationFraction,
    policy.testFraction,
  ];

  for (const fraction of fractions) {
    if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) {
      throw new RangeError("split fractions must be finite values in [0, 1]");
    }
  }

  const sum =
    policy.trainFraction + policy.validationFraction + policy.testFraction;
  if (Math.abs(sum - 1) > 1e-12) {
    throw new RangeError("split fractions must sum to 1");
  }
}

function validateGroupIdentity(group: DatasetGroupIdentity): void {
  requireNonEmpty("engineVersion", group.engineVersion);
  requireNonEmpty("parameterSetHash", group.parameterSetHash);
  requireNonEmpty("scenarioId", group.scenarioId);
  requireNonEmpty("scenarioVersion", group.scenarioVersion);
  requireNonEmpty("runConditionFingerprint", group.runConditionFingerprint);
  requireNonEmpty("groupId", group.groupId);
}

function requireNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}

function encodeParts(parts: readonly string[]): string {
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

function stableUnitInterval(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0x1_0000_0000;
}
