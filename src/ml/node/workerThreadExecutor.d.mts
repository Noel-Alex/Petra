import type { MechanisticTrajectoryResult } from "../generator";
import type { MechanisticSweepTask } from "../sweep";

export interface WorkerThreadMechanisticExecutorOptions {
  readonly maxWorkers: number;
  readonly executorModuleUrl: string;
  readonly executorData?: unknown;
  readonly workerModuleUrl?: string | URL;
}

export class WorkerThreadMechanisticExecutor {
  constructor(options: WorkerThreadMechanisticExecutorOptions);
  execute<TInput = unknown, TTarget = unknown>(
    task: MechanisticSweepTask,
  ): Promise<MechanisticTrajectoryResult<TInput, TTarget>>;
  dispose(): Promise<void>;
}
