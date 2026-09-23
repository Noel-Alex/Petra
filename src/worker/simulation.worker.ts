/// <reference lib="webworker" />

import { SimulationEngine } from '../sim/engine'
import { PROTOCOL_VERSION } from '../sim/protocol'
import type { WorkerRequest, WorkerResponse } from '../sim/protocol'

let engine: SimulationEngine | undefined

function post(response: WorkerResponse): void {
  self.postMessage(response)
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data
  if (request.protocolVersion !== PROTOCOL_VERSION) {
    post({ protocolVersion: PROTOCOL_VERSION, type: 'error', message: `Unsupported protocol version: ${request.protocolVersion}` })
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

export {}
