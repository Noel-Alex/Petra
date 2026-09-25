import type {
  MechanisticDatasetFinalOutput,
  MechanisticDatasetFinalization,
  MechanisticIncrementalStagingStore,
  MechanisticStagedTrajectoryRecord,
  MechanisticTrajectoryStageWriter,
} from "../incrementalGenerator";

export class FilesystemMechanisticStagingStore
  implements MechanisticIncrementalStagingStore
{
  constructor(rootDirectory: string);
  listCommitted(): readonly MechanisticStagedTrajectoryRecord[];
  beginTrajectory(taskId: string): MechanisticTrajectoryStageWriter;
  readRows(taskId: string): Iterable<string>;
}

export class FilesystemMechanisticFinalOutput
  implements MechanisticDatasetFinalOutput
{
  constructor(rootDirectory: string, baseName?: string);
  begin(planDigest: string): void;
  writeRow(line: string): void;
  commit(finalization: MechanisticDatasetFinalization): void;
  abort(): void;
}

export function readFilesystemFinalization(
  path: string,
): MechanisticDatasetFinalization;
