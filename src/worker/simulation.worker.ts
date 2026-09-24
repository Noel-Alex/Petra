/// <reference lib="webworker" />

import { SimulationEngine } from '../sim/engine'
import {
  PROTOCOL_VERSION,
  parseWorkerRequest,
  type WorkerRequest,
  type WorkerResponse,
} from '../sim/protocol'

let engine: SimulationEngine | undefined

function post(response: WorkerResponse): void {
  self.postMessage(response)
}

self.onmessage = (event: MessageEvent<unknown>) => {
  const rawRequest = event.data
  let request: WorkerRequest

  try {
    request = parseWorkerRequest(rawRequest)
  } catch (error) {
    const commandId = requestCommandId(rawRequest)
    post({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      ...(commandId === null ? {} : { commandId }),
      message: error instanceof Error ? error.message : 'Malformed worker request',
    })
    return
  }

  try {
    if (request.type === 'initialize') {
      engine = new SimulationEngine(request.identity)
      post({ protocolVersion: PROTOCOL_VERSION, type: 'ready', snapshot: engine.snapshot() })
      return
    }

    if (!engine) throw new Error('Simulation worker must be initialized before commands')
    const snapshot = engine.execute(request.command)
    post({ protocolVersion: PROTOCOL_VERSION, type: 'snapshot', commandId: request.command.id, snapshot })
  } catch (error) {
    post({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      ...(request.type === 'command' ? { commandId: request.command.id } : {}),
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function requestCommandId(value: unknown): string | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  if (record.type !== 'command') return null
  const command = record.command
  if (command === null || typeof command !== 'object' || Array.isArray(command)) return null
  const id = (command as Record<string, unknown>).id
  return typeof id === 'string' ? id : null
}

export {}
