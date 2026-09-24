import { threadId } from "node:worker_threads";

export async function executeMechanisticTask(task, executorData) {
  const spinMilliseconds =
    executorData && Number.isFinite(executorData.spinMilliseconds)
      ? Math.max(0, executorData.spinMilliseconds)
      : 0;
  const deadline = Date.now() + spinMilliseconds;
  while (Date.now() < deadline) {
    // Intentional CPU work for the worker-thread integration fixture.
  }

  if (executorData && executorData.failTaskId === task.taskId) {
    throw new RangeError("fixture worker refusal");
  }

  return {
    taskId: task.taskId,
    samples: [
      {
        datasetVersion: task.datasetVersion,
        trajectory: structuredClone(task.trajectory),
        snapshotIndex: 0,
        simulationTimeHours: 0,
        normalizationProfileId: task.normalizationProfileId,
        datasetSchema: structuredClone(task.datasetSchema),
        input: {
          parameterPointId: task.parameterPointId,
          interventionFamilyId: task.interventionFamilyId,
        },
        target: {
          workerThreadId: threadId,
          futurePopulation: 100 + task.trajectory.seed,
        },
      },
      {
        datasetVersion: task.datasetVersion,
        trajectory: structuredClone(task.trajectory),
        snapshotIndex: 1,
        simulationTimeHours: 1,
        normalizationProfileId: task.normalizationProfileId,
        datasetSchema: structuredClone(task.datasetSchema),
        input: {
          parameterPointId: task.parameterPointId,
          interventionFamilyId: task.interventionFamilyId,
        },
        target: {
          workerThreadId: threadId,
          futurePopulation: 110 + task.trajectory.seed,
        },
        terminationReason: "fixture-worker-complete",
      },
    ],
  };
}
