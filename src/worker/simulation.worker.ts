/// <reference lib="webworker" />

import { SimulationEngine } from '../sim/engine'
import { PROTOCOL_VERSION } from '../sim/protocol'
import type { WorkerResponse } from '../sim/protocol'
import { parseWorkerRequest } from '../sim/protocolRuntime'

let engine: SimulationEngine | undefined

function post(response: WorkerResponse): void {
  self.postMessage(response)
}

self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = parseWorkerRequest(event.data)
  if (!parsed.ok) {
    post({
      protocolVersion: PROTOCOL_VERSION,
      type: 'error',
      ...(parsed.commandId !== null ? { commandId: parsed.commandId } : {}),
      message: parsed.error,
    })
    return
  }

  const request = parsed.value

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

export {}
