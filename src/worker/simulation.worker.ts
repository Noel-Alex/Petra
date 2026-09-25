/// <reference lib="webworker" />

import { AdvanceExecutionPolicyRefusalError } from '../sim/advanceExecutionPolicy'
import { ComposedSimulationEngine } from '../sim/composedEngine'
import { SimulationEngine } from '../sim/engine'
import { PROTOCOL_VERSION } from '../sim/protocol'
import type {
  SimulationCommand,
  SimulationEvent,
  SimulationSnapshot,
} from '../sim/protocol'
import {
  createWorkerSnapshotTransportResponse,
  type WorkerTransportResponse,
} from './eventDeltaTransport'
import {
  WORKER_PERFORMANCE_DIAGNOSTICS_VERSION,
  parseInstrumentedWorkerRequest,
  type InstrumentedWorkerResponse,
} from './performanceInstrumentation'

interface WorkerSimulationEngine {
  snapshot(): SimulationSnapshot
  execute(command: SimulationCommand): SimulationSnapshot
}

let engine: WorkerSimulationEngine | undefined
let lastPostedEvents: readonly SimulationEvent[] | null = null

function post(
  response: WorkerTransportResponse,
  executionDurationMs?: number,
): void {
  const payload: InstrumentedWorkerResponse =
    executionDurationMs === undefined
      ? response
      : {
          ...response,
          performanceDiagnostics: {
            version: WORKER_PERFORMANCE_DIAGNOSTICS_VERSION,
            executionDurationMs,
          },
        }
  self.postMessage(payload)
}

function elapsedSince(startedAtMs: number | null): number | undefined {
  if (startedAtMs === null) return undefined
  return Math.max(0, performance.now() - startedAtMs)
}

self.onmessage = (event: MessageEvent<unknown>) => {
  const parsed = parseInstrumentedWorkerRequest(event.data)
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

  const startedAtMs =
    request.performanceDiagnostics === true ? performance.now() : null

  try {
    if (request.type === 'initialize') {
      // Reinitialization is a run-authority boundary. Never retain a previous
      // run if construction of the requested replacement fails.
      engine = undefined
      lastPostedEvents = null
      engine =
        request.composedConfig === undefined
          ? new SimulationEngine(request.identity)
          : new ComposedSimulationEngine(
              request.identity,
              request.composedConfig,
            )

      const snapshot = engine.snapshot()
      post(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: 'ready',
          snapshot,
        },
        elapsedSince(startedAtMs),
      )
      lastPostedEvents = snapshot.events
      return
    }

    if (!engine) {
      throw new Error('Simulation worker must be initialized before commands')
    }

    const snapshot = engine.execute(request.command)
    const response = createWorkerSnapshotTransportResponse({
      commandId: request.command.id,
      previousEvents: lastPostedEvents,
      snapshot,
    })
    post(response, elapsedSince(startedAtMs))
    lastPostedEvents = snapshot.events
  } catch (error) {
    post(
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'error',
        ...(request.type === 'command'
          ? { commandId: request.command.id }
          : {}),
        ...(error instanceof AdvanceExecutionPolicyRefusalError
          ? { code: error.code }
          : {}),
        message: error instanceof Error ? error.message : String(error),
      },
      elapsedSince(startedAtMs),
    )
  }
}

export {}
