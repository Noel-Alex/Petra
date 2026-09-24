/// <reference lib="webworker" />

import { ComposedSimulationEngine } from '../sim/composedEngine'
import { SimulationEngine } from '../sim/engine'
import { PROTOCOL_VERSION } from '../sim/protocol'
import { parseWorkerRequest } from '../sim/protocolValidation'
import type {
  SimulationCommand,
  SimulationSnapshot,
  WorkerRequest,
  WorkerResponse,
} from '../sim/protocol'

interface WorkerSimulationEngine {
  snapshot(): SimulationSnapshot
  execute(command: SimulationCommand): SimulationSnapshot
}

let engine: WorkerSimulationEngine | undefined

function post(response: WorkerResponse): void {
  self.postMessage(response)
}

self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = parseWorkerRequest(event.data)
  if (!parsed.ok) {
    const commandId = malformedCommandId(event.data)
    post({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      ...(commandId === undefined ? {} : { commandId }),
      message: `Invalid worker request: ${parsed.error}`,
    })
    return
  }
  const request = parsed.value

  try {
    if (request.type === 'initialize') {
      engine =
        request.composedConfig === undefined
          ? new SimulationEngine(request.identity)
          : new ComposedSimulationEngine(
              request.identity,
              request.composedConfig,
            )

      post({
        protocolVersion: PROTOCOL_VERSION,
        type: 'ready',
        snapshot: engine.snapshot(),
      })
      return
    }

    if (!engine) {
      throw new Error('Simulation worker must be initialized before commands')
    }

    const snapshot = engine.execute(request.command)
    post({
      protocolVersion: PROTOCOL_VERSION,
      type: 'snapshot',
      commandId: request.command.id,
      snapshot,
    })
  } catch (error) {
    post({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      ...(request.type === 'command'
        ? { commandId: request.command.id }
        : {}),
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function malformedCommandId(value: unknown): string | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined
  }
  const request = value as Record<string, unknown>
  if (request.type !== 'command') return undefined
  if (
    typeof request.command !== 'object' ||
    request.command === null ||
    Array.isArray(request.command)
  ) {
    return undefined
  }
  const command = request.command as Record<string, unknown>
  return typeof command.id === 'string' && command.id.length > 0
    ? command.id
    : undefined
}

export {}
