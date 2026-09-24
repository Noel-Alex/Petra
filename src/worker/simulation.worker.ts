/// <reference lib="webworker" />

import { AdvanceExecutionPolicyRefusalError } from '../sim/advanceExecutionPolicy'
import { ComposedSimulationEngine } from '../sim/composedEngine'
import { SimulationEngine } from '../sim/engine'
import { PROTOCOL_VERSION } from '../sim/protocol'
import type {
  SimulationCommand,
  SimulationSnapshot,
  WorkerResponse,
} from '../sim/protocol'
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

function post(
  response: WorkerResponse,
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
      engine =
        request.composedConfig === undefined
          ? new SimulationEngine(request.identity)
          : new ComposedSimulationEngine(
              request.identity,
              request.composedConfig,
            )

      post(
        {
          protocolVersion: PROTOCOL_VERSION,
          type: 'ready',
          snapshot: engine.snapshot(),
        },
        elapsedSince(startedAtMs),
      )
      return
    }

    if (!engine) {
      throw new Error('Simulation worker must be initialized before commands')
    }

    const snapshot = engine.execute(request.command)
    post(
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'snapshot',
        commandId: request.command.id,
        snapshot,
      },
      elapsedSince(startedAtMs),
    )
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
