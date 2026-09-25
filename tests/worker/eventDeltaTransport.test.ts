import { describe, expect, it } from 'vitest'

import { SimulationEngine } from '../../src/sim/engine'
import {
  PROTOCOL_VERSION,
  createRunIdentity,
  type SimulationEvent,
  type SimulationSnapshot,
} from '../../src/sim/protocol'
import {
  WORKER_EVENT_DELTA_TRANSPORT_VERSION,
  createWorkerSnapshotTransportResponse,
  materializeWorkerSnapshotDelta,
  parseWorkerSnapshotDeltaResponse,
  type WorkerSnapshotDeltaResponse,
} from '../../src/worker/eventDeltaTransport'

const identity = createRunIdentity({
  scenarioId: 'worker-event-delta-fixture',
  scenarioVersion: '1',
  parameterSetId: 'none',
  parameterSetVersion: '1',
  seed: 17,
})

function syntheticSnapshot(args: {
  readonly tick: number
  readonly commandCount: number
  readonly events: readonly SimulationEvent[]
  readonly traceHash?: string
}): SimulationSnapshot {
  return {
    checkpoint: {
      identity,
      tick: args.tick,
      simulationTimeHours: args.tick / 60,
      syntheticPopulation: 1000,
      rngState: [1, 2, 3, 4],
      commandCount: args.commandCount,
    },
    events: args.events,
    traceHash: args.traceHash ?? `trace-${args.tick}-${args.commandCount}`,
  }
}

describe('worker append-only event delta transport', () => {
  it('sends only the newly appended suffix and reconstructs the exact full snapshot', () => {
    const engine = new SimulationEngine(identity)
    const baseline = engine.snapshot()
    const next = engine.execute({
      id: 'advance-one',
      type: 'advance',
      ticks: 1,
    })

    const response = createWorkerSnapshotTransportResponse({
      commandId: 'advance-one',
      previousEvents: baseline.events,
      snapshot: next,
    })

    expect(response.type).toBe('snapshot-delta')
    if (response.type !== 'snapshot-delta') {
      throw new Error('expected append-only delta response')
    }
    expect(response).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      transportVersion: WORKER_EVENT_DELTA_TRANSPORT_VERSION,
      previousEventCount: 1,
      currentEventCount: 2,
    })
    expect(response.appendedEvents).toHaveLength(1)
    expect(response.appendedEvents[0]).toMatchObject({
      sequence: 1,
      commandId: 'advance-one',
      type: 'advanced',
    })
    expect(response.snapshot).not.toHaveProperty('events')

    const parsed = parseWorkerSnapshotDeltaResponse(response)
    expect(parsed.ok).toBe(true)

    const ownedBaseline = structuredClone(baseline)
    const materialized = materializeWorkerSnapshotDelta(
      ownedBaseline,
      response,
    )
    expect(materialized).toEqual(next)
    expect(materialized.events[0]).toBe(ownedBaseline.events[0])
    expect(materialized.events).not.toBe(ownedBaseline.events)
  })

  it('uses a zero-event delta for snapshot-only commands', () => {
    const engine = new SimulationEngine(identity)
    const baseline = engine.snapshot()
    const sameHistory = engine.execute({
      id: 'snapshot-only',
      type: 'snapshot',
    })

    const response = createWorkerSnapshotTransportResponse({
      commandId: 'snapshot-only',
      previousEvents: baseline.events,
      snapshot: sameHistory,
    })

    expect(response.type).toBe('snapshot-delta')
    if (response.type !== 'snapshot-delta') {
      throw new Error('expected snapshot-only delta')
    }
    expect(response.appendedEvents).toEqual([])
    expect(response.previousEventCount).toBe(1)
    expect(response.currentEventCount).toBe(1)
    expect(
      materializeWorkerSnapshotDelta(structuredClone(baseline), response),
    ).toEqual(sameHistory)
  })

  it('falls back to a full protocol snapshot when restore replaces history', () => {
    const engine = new SimulationEngine(identity)
    const origin = engine.snapshot()
    const advanced = engine.execute({
      id: 'advance-before-restore',
      type: 'advance',
      ticks: 2,
    })
    const restored = engine.execute({
      id: 'restore-origin',
      type: 'restore',
      checkpoint: origin.checkpoint,
    })

    const response = createWorkerSnapshotTransportResponse({
      commandId: 'restore-origin',
      previousEvents: advanced.events,
      snapshot: restored,
    })

    expect(response.type).toBe('snapshot')
    if (response.type !== 'snapshot') {
      throw new Error('restore must rebase with a full snapshot')
    }
    expect(response.snapshot.events).toEqual(restored.events)
    expect(response.snapshot.events).toHaveLength(1)
    expect(response.snapshot.events[0]).toMatchObject({
      sequence: 0,
      type: 'restored',
      commandId: 'restore-origin',
    })
  })

  it('keeps a 1000-event retained prefix out of the delta payload', () => {
    const previousEvents: SimulationEvent[] = Array.from(
      { length: 1000 },
      (_, sequence) =>
        sequence === 0
          ? {
              sequence,
              tick: 0,
              simulationTimeHours: 0,
              type: 'initialized' as const,
            }
          : {
              sequence,
              tick: sequence,
              simulationTimeHours: sequence / 60,
              type: 'advanced' as const,
              commandId: `advance-${sequence}`,
              value: 1,
            },
    )
    const previous = syntheticSnapshot({
      tick: 999,
      commandCount: 999,
      events: previousEvents,
    })
    const appended: SimulationEvent = {
      sequence: 1000,
      tick: 1000,
      simulationTimeHours: 1000 / 60,
      type: 'advanced',
      commandId: 'advance-1000',
      value: 1,
    }
    const response: WorkerSnapshotDeltaResponse = {
      protocolVersion: PROTOCOL_VERSION,
      transportVersion: WORKER_EVENT_DELTA_TRANSPORT_VERSION,
      type: 'snapshot-delta',
      commandId: 'advance-1000',
      previousEventCount: 1000,
      previousTerminalEvent: previousEvents[999]!,
      currentEventCount: 1001,
      appendedEvents: [appended],
      snapshot: {
        checkpoint: {
          identity,
          tick: 1000,
          simulationTimeHours: 1000 / 60,
          syntheticPopulation: 1000,
          rngState: [1, 2, 3, 4],
          commandCount: 1000,
        },
        traceHash: 'trace-1000',
      },
    }

    expect(parseWorkerSnapshotDeltaResponse(response).ok).toBe(true)
    expect(response.appendedEvents).toHaveLength(1)
    expect(response.previousTerminalEvent?.sequence).toBe(999)

    const materialized = materializeWorkerSnapshotDelta(previous, response)
    expect(materialized.events).toHaveLength(1001)
    expect(materialized.events[999]).toBe(previous.events[999])
    expect(materialized.events[1000]).toEqual(appended)
  })

  it('fails closed on a dropped/reordered suffix or mismatched retained frontier', () => {
    const engine = new SimulationEngine(identity)
    const baseline = structuredClone(engine.snapshot())
    const next = engine.execute({
      id: 'advance-one',
      type: 'advance',
      ticks: 1,
    })
    const created = createWorkerSnapshotTransportResponse({
      commandId: 'advance-one',
      previousEvents: structuredClone(baseline.events),
      snapshot: next,
    })

    // A cloned prefix does not share Worker-owned immutable event identity,
    // therefore creation itself refuses delta transport.
    expect(created.type).toBe('snapshot')

    const valid: WorkerSnapshotDeltaResponse = {
      protocolVersion: PROTOCOL_VERSION,
      transportVersion: WORKER_EVENT_DELTA_TRANSPORT_VERSION,
      type: 'snapshot-delta',
      commandId: 'advance-one',
      previousEventCount: 1,
      previousTerminalEvent: baseline.events[0]!,
      currentEventCount: 2,
      appendedEvents: [
        {
          sequence: 1,
          tick: 1,
          simulationTimeHours: 1 / 60,
          type: 'advanced',
          commandId: 'advance-one',
          value: 1,
        },
      ],
      snapshot: {
        checkpoint: next.checkpoint,
        traceHash: next.traceHash,
      },
    }

    const reordered = structuredClone(valid)
    ;(reordered.appendedEvents[0] as { sequence: number }).sequence = 4
    expect(parseWorkerSnapshotDeltaResponse(reordered)).toMatchObject({
      ok: false,
      error: expect.stringMatching(/sequence must equal 1/),
    })

    const wrongFrontier = structuredClone(valid)
    ;(
      wrongFrontier.previousTerminalEvent as {
        commandId?: string
      }
    ).commandId = 'forged-old-command'
    expect(() =>
      materializeWorkerSnapshotDelta(baseline, wrongFrontier),
    ).toThrow(/retained event frontier/)
  })
})
