import type { WorkerSessionPerformanceSample } from "./workerSession";

export interface WorkerPerformanceSummary {
  readonly version: 1;
  readonly sampleCount: number;
  readonly successfulSampleCount: number;
  readonly advanceSampleCount: number;
  readonly measuredWorkerExecutionSampleCount: number;
  readonly totalAdvanceTicks: number;
  readonly totalRequestPayloadBytes: number;
  readonly totalResponsePayloadBytes: number;
  readonly totalRoundTripMs: number;
  readonly totalWorkerExecutionMs: number;
  readonly workerExecutionMsPerAdvanceTick: number | null;
  readonly totalNonWorkerRoundTripMs: number;
  readonly maxQueuedRequestsBehindAtDispatch: number;
  readonly maxAuthoritativeEventArrayLength: number;
  readonly observationWindowMs: number;
  readonly observedPayloadBytesPerSecond: number | null;
}

/**
 * Compact, JSON-safe summary for local profiling evidence. Payload throughput
 * is observed application payload over the first-dispatch to last-completion
 * window; it is not a claim about browser transport-link bandwidth.
 */
export function summarizeWorkerPerformance(
  samples: readonly WorkerSessionPerformanceSample[],
): WorkerPerformanceSummary {
  let successfulSampleCount = 0;
  let advanceSampleCount = 0;
  let measuredWorkerExecutionSampleCount = 0;
  let totalAdvanceTicks = 0;
  let totalRequestPayloadBytes = 0;
  let totalResponsePayloadBytes = 0;
  let totalRoundTripMs = 0;
  let totalWorkerExecutionMs = 0;
  let totalMeasuredAdvanceTicks = 0;
  let totalMeasuredAdvanceExecutionMs = 0;
  let totalNonWorkerRoundTripMs = 0;
  let maxQueuedRequestsBehindAtDispatch = 0;
  let maxAuthoritativeEventArrayLength = 0;
  let firstDispatchAtMs = Number.POSITIVE_INFINITY;
  let lastCompletionAtMs = Number.NEGATIVE_INFINITY;

  for (const sample of samples) {
    if (sample.outcome === "success") successfulSampleCount += 1;
    if (sample.commandType === "advance") {
      advanceSampleCount += 1;
      totalAdvanceTicks += sample.requestedAdvanceTicks ?? 0;
    }
    if (sample.workerExecutionMs !== null) {
      measuredWorkerExecutionSampleCount += 1;
      totalWorkerExecutionMs += sample.workerExecutionMs;
    }
    if (
      sample.commandType === "advance" &&
      sample.requestedAdvanceTicks !== null &&
      sample.requestedAdvanceTicks > 0 &&
      sample.workerExecutionMs !== null
    ) {
      totalMeasuredAdvanceTicks += sample.requestedAdvanceTicks;
      totalMeasuredAdvanceExecutionMs += sample.workerExecutionMs;
    }
    if (sample.nonWorkerRoundTripMs !== null) {
      totalNonWorkerRoundTripMs += sample.nonWorkerRoundTripMs;
    }
    totalRequestPayloadBytes += sample.requestPayloadBytes;
    totalResponsePayloadBytes += sample.responsePayloadBytes ?? 0;
    totalRoundTripMs += sample.roundTripMs;
    maxQueuedRequestsBehindAtDispatch = Math.max(
      maxQueuedRequestsBehindAtDispatch,
      sample.queuedRequestsBehindAtDispatch,
    );
    maxAuthoritativeEventArrayLength = Math.max(
      maxAuthoritativeEventArrayLength,
      sample.authoritativeEventArrayLength ?? 0,
    );
    firstDispatchAtMs = Math.min(
      firstDispatchAtMs,
      sample.completedAtMs - sample.roundTripMs,
    );
    lastCompletionAtMs = Math.max(lastCompletionAtMs, sample.completedAtMs);
  }

  const observationWindowMs =
    samples.length === 0
      ? 0
      : Math.max(0, lastCompletionAtMs - firstDispatchAtMs);
  const totalPayloadBytes =
    totalRequestPayloadBytes + totalResponsePayloadBytes;

  return {
    version: 1,
    sampleCount: samples.length,
    successfulSampleCount,
    advanceSampleCount,
    measuredWorkerExecutionSampleCount,
    totalAdvanceTicks,
    totalRequestPayloadBytes,
    totalResponsePayloadBytes,
    totalRoundTripMs,
    totalWorkerExecutionMs,
    workerExecutionMsPerAdvanceTick:
      totalMeasuredAdvanceTicks === 0
        ? null
        : totalMeasuredAdvanceExecutionMs / totalMeasuredAdvanceTicks,
    totalNonWorkerRoundTripMs,
    maxQueuedRequestsBehindAtDispatch,
    maxAuthoritativeEventArrayLength,
    observationWindowMs,
    observedPayloadBytesPerSecond:
      observationWindowMs <= 0
        ? null
        : totalPayloadBytes / (observationWindowMs / 1000),
  };
}
