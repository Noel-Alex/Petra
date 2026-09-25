import { createComposedMechanisticTaskExecutor } from "../runner";
import type {
  ComposedMechanisticTaskDefinition,
} from "../runner";
import type { MechanisticSweepTask } from "../sweep";
import {
  validateNodeMechanisticDatasetWorkerEnvelope,
} from "./datasetRuntime";

type DatasetTaskResolver = (
  task: MechanisticSweepTask,
  executorData: unknown,
) => ComposedMechanisticTaskDefinition<unknown, unknown>;

export async function executeMechanisticTask(
  task: MechanisticSweepTask,
  workerData: unknown,
) {
  validateNodeMechanisticDatasetWorkerEnvelope(workerData);

  const module = await import(
    /* @vite-ignore */ workerData.packageModuleUrl
  );
  const resolver = module.resolveNodeMechanisticDatasetTaskDefinition;
  if (typeof resolver !== "function") {
    throw new TypeError(
      "dataset package module must export resolveNodeMechanisticDatasetTaskDefinition(task, executorData)",
    );
  }

  const typedResolver = resolver as DatasetTaskResolver;
  const executor = createComposedMechanisticTaskExecutor(
    (candidate: MechanisticSweepTask) =>
      typedResolver(
        candidate,
        structuredClone(workerData.packageExecutorData),
      ),
  );
  return executor.execute(task);
}
