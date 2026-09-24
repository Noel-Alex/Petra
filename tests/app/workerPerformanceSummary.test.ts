import { describe, expect, it } from "vitest";
import { summarizeWorkerPerformance } from "../../src/app/workerPerformanceSummary";
import type { WorkerSessionPerformanceSample } from "../../src/app/workerSession";

function sample(
  overrides: Partial<WorkerSessionPerformanceSample>,
): WorkerSessionPerformanceSample {
  return {
    version: 1,
    completedAtMs: 110,
    requestType: "command",
    commandType: "advance",
    commandId: "advance-1",
    requestedAdvanceTicks: 4,
    queuedRequestsBehindAtDispatch: 0,
    requestPayloadBytes: 100,
    responsePayloadBytes: 300,
    roundTripMs: 10,
    workerExecutionMs: 6,
    workerExecutionMsPerTick: 1.5,
    nonWorkerRoundTripMs: 4,
    authoritativeEventQueueLength: 3,
    outcome: "success",
    ...overrides,
  };
}

describe("worker performance summary", () => {
  it("builds compact request-window evidence without claiming link bandwidth", () => {
    const summary = summarizeWorkerPerformance([
      sample({ completedAtMs: 110 }),
      sample({
        completedAtMs: 130,
        requestedAdvanceTicks: 2,
        requestPayloadBytes: 80,
        responsePayloadBytes: 220,
        roundTripMs: 5,
        workerExecutionMs: 2,
        workerExecutionMsPerTick: 1,
        nonWorkerRoundTripMs: 3,
        authoritativeEventQueueLength: 5,
        queuedRequestsBehindAtDispatch: 2,
      }),
    ]);

    expect(summary).toEqual({
      version: 1,
      sampleCount: 2,
      successfulSampleCount: 2,
      advanceSampleCount: 2,
      measuredWorkerExecutionSampleCount: 2,
      totalAdvanceTicks: 6,
      totalRequestPayloadBytes: 180,
      totalResponsePayloadBytes: 520,
      totalRoundTripMs: 15,
      totalWorkerExecutionMs: 8,
      workerExecutionMsPerAdvanceTick: 8 / 6,
      totalNonWorkerRoundTripMs: 7,
      maxQueuedRequestsBehindAtDispatch: 2,
      maxAuthoritativeEventQueueLength: 5,
      observationWindowMs: 30,
      observedPayloadBytesPerSecond: 700 / 0.03,
    });
  });

  it("returns null rates for an empty observation window", () => {
    expect(summarizeWorkerPerformance([])).toMatchObject({
      sampleCount: 0,
      observationWindowMs: 0,
      workerExecutionMsPerAdvanceTick: null,
      observedPayloadBytesPerSecond: null,
    });
  });
});
