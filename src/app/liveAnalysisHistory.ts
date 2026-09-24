import { sameComposedParameterSetBinding } from "../sim/parameterSetBinding";
import {
  extractAuthoritativeMetricSample,
  shouldSampleAuthoritativeMetrics,
  validateMetricSamplingPolicy,
  type AuthoritativeMetricSample,
  type MetricSamplingPolicy,
} from "../sim/metrics";
import type {
  ComposedSimulationSnapshot,
  RunIdentity,
} from "../sim/protocol";

export const LIVE_ANALYSIS_HISTORY_SCHEMA_VERSION = 1 as const;

export interface LiveAnalysisHistorySnapshot {
  readonly schemaVersion: typeof LIVE_ANALYSIS_HISTORY_SCHEMA_VERSION;
  readonly identity: RunIdentity;
  readonly samplingPolicy: MetricSamplingPolicy;
  readonly acceptedSnapshotCount: number;
  readonly lastCommandCount: number | null;
  readonly lastTraceHash: string | null;
  readonly samples: readonly AuthoritativeMetricSample[];
}

/**
 * Append-only live bridge from accepted authoritative composed snapshots to the
 * existing scientific metric-history contract.
 *
 * The bridge owns no biology and performs no interpolation. Snapshot command
 * position + trace identity are retained only to reject rewrites/duplicates.
 * Metric rows are emitted solely at the declared authoritative sampling ticks.
 */
export class LiveAnalysisHistory {
  private readonly identity: RunIdentity;
  private readonly samplingPolicy: MetricSamplingPolicy;
  private readonly resistantGenotypeIds: readonly string[];
  private readonly samples: AuthoritativeMetricSample[] = [];
  private acceptedSnapshotCount = 0;
  private lastCommandCount: number | null = null;
  private lastTraceHash: string | null = null;
  private lastSimulationTimeHours: number | null = null;
  private lastSampleTick: number | null = null;

  constructor(args: {
    readonly identity: RunIdentity;
    readonly samplingPolicy: MetricSamplingPolicy;
    readonly resistantGenotypeIds: readonly string[];
  }) {
    validateMetricSamplingPolicy(args.samplingPolicy);
    this.identity = structuredClone(args.identity);
    this.samplingPolicy = Object.freeze({ ...args.samplingPolicy });
    this.resistantGenotypeIds = Object.freeze(
      args.resistantGenotypeIds.map((id, index) => {
        if (typeof id !== "string" || id.length === 0 || id.trim() !== id) {
          throw new Error(
            `resistant genotype id at index ${index} must be a canonical non-empty string`,
          );
        }
        return id;
      }),
    );
    if (
      new Set(this.resistantGenotypeIds).size !==
      this.resistantGenotypeIds.length
    ) {
      throw new Error("resistant genotype ids must be unique");
    }
  }

  append(snapshot: ComposedSimulationSnapshot): boolean {
    const checkpoint = snapshot.checkpoint;
    if (!sameRunIdentity(checkpoint.identity, this.identity)) {
      throw new Error("live analysis history received a foreign run identity");
    }
    if (
      !Number.isSafeInteger(checkpoint.commandCount) ||
      checkpoint.commandCount < 0
    ) {
      throw new Error(
        "live analysis snapshot commandCount must be a non-negative safe integer",
      );
    }
    if (
      !Number.isFinite(checkpoint.simulationTimeHours) ||
      checkpoint.simulationTimeHours < 0
    ) {
      throw new Error(
        "live analysis snapshot biological time must be finite and non-negative",
      );
    }
    if (typeof snapshot.traceHash !== "string" || snapshot.traceHash.length === 0) {
      throw new Error("live analysis snapshot traceHash must be non-empty");
    }

    if (this.lastCommandCount !== null) {
      if (checkpoint.commandCount < this.lastCommandCount) {
        throw new Error(
          "live analysis history command position cannot move backward",
        );
      }
      if (checkpoint.commandCount === this.lastCommandCount) {
        if (snapshot.traceHash !== this.lastTraceHash) {
          throw new Error(
            "live analysis history detected conflicting replacement at the same command position",
          );
        }
        return false;
      }
      if (
        this.lastSimulationTimeHours !== null &&
        checkpoint.simulationTimeHours < this.lastSimulationTimeHours
      ) {
        throw new Error(
          "live analysis history biological time cannot move backward",
        );
      }
    }

    this.acceptedSnapshotCount += 1;
    this.lastCommandCount = checkpoint.commandCount;
    this.lastTraceHash = snapshot.traceHash;
    this.lastSimulationTimeHours = checkpoint.simulationTimeHours;

    if (
      !shouldSampleAuthoritativeMetrics(checkpoint.tick, this.samplingPolicy) ||
      (this.lastSampleTick !== null && checkpoint.tick <= this.lastSampleTick)
    ) {
      return false;
    }

    const sample = extractAuthoritativeMetricSample({
      checkpoint,
      samplingPolicy: this.samplingPolicy,
      resistantGenotypeIds: this.resistantGenotypeIds,
    });

    if (
      this.samples.length > 0 &&
      sample.simulationTimeHours <=
        this.samples[this.samples.length - 1]!.simulationTimeHours
    ) {
      throw new Error(
        "live analysis sampled biological time must be strictly increasing",
      );
    }

    this.samples.push(structuredClone(sample));
    this.lastSampleTick = sample.tick;
    return true;
  }

  snapshot(): LiveAnalysisHistorySnapshot {
    return Object.freeze({
      schemaVersion: LIVE_ANALYSIS_HISTORY_SCHEMA_VERSION,
      identity: structuredClone(this.identity),
      samplingPolicy: { ...this.samplingPolicy },
      acceptedSnapshotCount: this.acceptedSnapshotCount,
      lastCommandCount: this.lastCommandCount,
      lastTraceHash: this.lastTraceHash,
      samples: Object.freeze(this.samples.map((sample) => structuredClone(sample))),
    });
  }
}

function sameRunIdentity(left: RunIdentity, right: RunIdentity): boolean {
  return (
    left.engineVersion === right.engineVersion &&
    left.protocolVersion === right.protocolVersion &&
    left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.parameterSetId === right.parameterSetId &&
    left.parameterSetVersion === right.parameterSetVersion &&
    sameComposedParameterSetBinding(
      left.parameterSetBinding,
      right.parameterSetBinding,
    ) &&
    left.seed === right.seed
  );
}
