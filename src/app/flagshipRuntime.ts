import { ExperimentRuntime } from './experimentRuntime'
import {
  createSimulationWorkerSession,
  type WorkerSession,
} from './workerSession'
import { buildDefaultFlagshipRun } from './flagshipRunPreset'

export const DEFAULT_FLAGSHIP_COMMAND_ID_PREFIX = 'flagship-command'

function createCommandIdFactory(): () => string {
  let sequence = 0
  return () => {
    sequence += 1
    return `${DEFAULT_FLAGSHIP_COMMAND_ID_PREFIX}-${sequence}`
  }
}

/**
 * Create one fresh authoritative runtime lifetime for React.
 *
 * The default path owns a fresh browser WorkerSession. Tests may supply an
 * already-fresh session without gaining authority over scenario/config values.
 */
export function createFlagshipExperimentRuntime(
  session: WorkerSession = createSimulationWorkerSession(),
): ExperimentRuntime {
  const { plan } = buildDefaultFlagshipRun()
  return new ExperimentRuntime(
    session,
    plan.identity,
    createCommandIdFactory(),
    plan.config,
  )
}
