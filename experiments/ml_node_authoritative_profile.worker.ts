import { threadId } from "node:worker_threads";

import { createComposedMechanisticTaskExecutor } from "../src/ml/runner";
import type { MechanisticSweepTask } from "../src/ml/sweep";
import {
  resolveNodeAuthoritativeProfileDefinition,
  type NodeAuthoritativeProfileExecutorData,
} from "./ml_node_authoritative_profile.shared";

export async function executeMechanisticTask(
  task: MechanisticSweepTask,
  executorData: NodeAuthoritativeProfileExecutorData,
) {
  const executor = createComposedMechanisticTaskExecutor(
    (candidate: MechanisticSweepTask) =>
      resolveNodeAuthoritativeProfileDefinition(
        candidate,
        executorData,
      ),
  );
  const result = await executor.execute(task);
  return Object.freeze({
    taskId: result.taskId,
    samples: result.samples,
    workerThreadId: threadId,
  });
}
