import {
  buildAuthoritativeMetricSeries,
  type AuthoritativeMetricSeriesConfig,
} from "./analysisMetrics";
import type { AuthoritativeAnalysisRecords } from "./analysisView";
import {
  LIVE_ANALYSIS_HISTORY_SCHEMA_VERSION,
  type LiveAnalysisHistorySnapshot,
} from "./liveAnalysisHistory";
import {
  RUNTIME_LINEAGE_ANALYSIS_FRAME_SCHEMA_VERSION,
  type RuntimeLineageAnalysisFrame,
} from "./runtimeLineageAnalysis";
import { validateMetricSamplingPolicy } from "../sim/metrics";
import { assertReplayCompatibility } from "../sim/replayCompatibility";

export const RUNTIME_ANALYSIS_TRANSACTION_SCHEMA_VERSION = 1 as const;

export interface RuntimeAnalysisHistoryBinding {
  /**
   * Runtime-owned command-history generation for this accumulator instance.
   * LiveAnalysisHistory intentionally does not own reset/replay branch lifecycle.
   */
  readonly runBranchIdentity: string;
  readonly history: LiveAnalysisHistorySnapshot;
}

export interface RuntimeAnalysisTransaction {
  readonly schemaVersion: typeof RUNTIME_ANALYSIS_TRANSACTION_SCHEMA_VERSION;
  readonly records: AuthoritativeAnalysisRecords;
}

/**
 * Join current lineage authority and accumulated metrics only when both describe
 * the same accepted runtime frontier and command-history generation.
 *
 * A sampled metric cadence may lag the current tick; the history accumulator
 * itself may not. No samples means no product analysis rather than an invented
 * preview trace.
 */
export function composeRuntimeAnalysisTransaction(args: {
  readonly lineage: RuntimeLineageAnalysisFrame;
  readonly metrics: RuntimeAnalysisHistoryBinding;
  readonly seriesConfig: AuthoritativeMetricSeriesConfig;
}): RuntimeAnalysisTransaction | null {
  const { lineage } = args;
  const { history } = args.metrics;

  if (
    lineage.schemaVersion !== RUNTIME_LINEAGE_ANALYSIS_FRAME_SCHEMA_VERSION
  ) {
    throw new Error("unsupported runtime lineage-analysis frame schema");
  }
  if (history.schemaVersion !== LIVE_ANALYSIS_HISTORY_SCHEMA_VERSION) {
    throw new Error("unsupported live analysis history schema");
  }

  assertCanonicalText("lineage runBranchIdentity", lineage.runBranchIdentity);
  assertCanonicalText(
    "metric history runBranchIdentity",
    args.metrics.runBranchIdentity,
  );
  assertCanonicalText("lineage traceHash", lineage.traceHash);

  if (args.metrics.runBranchIdentity !== lineage.runBranchIdentity) {
    throw new Error(
      "runtime analysis metric history belongs to a different command-history generation",
    );
  }

  if (
    !Number.isSafeInteger(lineage.tick) ||
    lineage.tick < 0 ||
    !Number.isSafeInteger(lineage.commandCount) ||
    lineage.commandCount < 0 ||
    !Number.isFinite(lineage.simulationTimeHours) ||
    lineage.simulationTimeHours < 0
  ) {
    throw new Error("runtime lineage-analysis frontier is malformed");
  }
  if (lineage.analysis.simulationTimeHours !== lineage.simulationTimeHours) {
    throw new Error(
      "runtime lineage-analysis biological time disagrees with its enclosing frontier",
    );
  }

  validateMetricSamplingPolicy(history.samplingPolicy);
  if (
    !Number.isSafeInteger(history.acceptedSnapshotCount) ||
    history.acceptedSnapshotCount < 0
  ) {
    throw new Error(
      "live analysis acceptedSnapshotCount must be a non-negative safe integer",
    );
  }

  assertReplayCompatibility({
    artifactIdentity: history.identity,
    targetIdentity: lineage.analysis.identity,
    artifactAuthority: "composed",
    targetAuthority: "composed",
  });

  if (history.acceptedSnapshotCount === 0) {
    if (
      history.lastCommandCount !== null ||
      history.lastTraceHash !== null ||
      history.samples.length !== 0
    ) {
      throw new Error("empty live analysis history has a non-empty frontier");
    }
    throw new Error(
      "live analysis history has not observed the current runtime snapshot",
    );
  }

  if (
    history.lastCommandCount !== lineage.commandCount ||
    history.lastTraceHash !== lineage.traceHash
  ) {
    throw new Error(
      "live analysis history frontier does not match the current lineage transaction",
    );
  }

  if (history.samples.length === 0) {
    return null;
  }

  const series = buildAuthoritativeMetricSeries(
    history.samples,
    args.seriesConfig,
  );
  assertReplayCompatibility({
    artifactIdentity: series.identity,
    targetIdentity: lineage.analysis.identity,
    artifactAuthority: "composed",
    targetAuthority: "composed",
  });

  if (
    series.lastTick > lineage.tick ||
    series.lastSimulationTimeHours > lineage.simulationTimeHours
  ) {
    throw new Error(
      "authoritative metric series extends beyond the current lineage transaction",
    );
  }

  const records: AuthoritativeAnalysisRecords = Object.freeze({
    identity: Object.freeze({
      runIdentity: lineage.runBranchIdentity,
      stateIdentity: lineage.traceHash,
      composedRunIdentity: structuredClone(lineage.analysis.identity),
      simulationTimeHours: lineage.simulationTimeHours,
    }),
    series: Object.freeze([
      series.totalBiomass,
      series.totalResource,
      series.resistantFraction,
      series.lineageDiversity,
      ...series.genotypeFractions,
    ]),
    lineageAnalysis: lineage.analysis,
  });

  return Object.freeze({
    schemaVersion: RUNTIME_ANALYSIS_TRANSACTION_SCHEMA_VERSION,
    records,
  });
}

function assertCanonicalText(name: string, value: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${name} must be canonical non-empty text`);
  }
}
