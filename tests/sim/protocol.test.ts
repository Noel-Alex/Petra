import { describe, expect, it } from 'vitest'
import {
  PROTOCOL_VERSION,
  createRunIdentity,
  parseWorkerRequest,
  parseWorkerResponse,
  type SimulationSnapshot,
} from '../../src/sim/protocol'

const identity = createRunIdentity({
  scenarioId: 'protocol-fixture',
  scenarioVersion: '1',
  parameterSetId: 'protocol-fixture',
  parameterSetVersion: '1',
  seed: 23,
})

function snapshot(): SimulationSnapshot {
  return {
    checkpoint: {
      identity,
      tick: 0,
      simulationTimeHours: 0,
      syntheticPopulation: 1_000,
      rngState: [1, 2, 3, 4],
      commandCount: 0,
    },
    events: [
      {
        sequence: 0,
        tick: 0,
        simulationTimeHours: 0,
        type: 'initialized',
      },
    ],
    traceHash: 'protocol-fixture-trace',
  }
}

describe('worker protocol runtime parsers', () => {
  it('accepts valid protocol-v2 requests and responses without coercion', () => {
    const initialize = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'initialize' as const,
      identity,
    }
    const command = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'command' as const,
      command: { id: 'snapshot-1', type: 'snapshot' as const },
    }
    const ready = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ready' as const,
      snapshot: snapshot(),
    }
    const response = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'snapshot' as const,
      commandId: 'snapshot-1',
      snapshot: snapshot(),
    }

    expect(parseWorkerRequest(initialize)).toBe(initialize)
    expect(parseWorkerRequest(command)).toBe(command)
    expect(parseWorkerResponse(ready)).toBe(ready)
    expect(parseWorkerResponse(response)).toBe(response)
  })

  it('rejects null, primitive, missing, and unknown request envelopes before engine handling', () => {
    for (const value of [
      null,
      7,
      'request',
      [],
      { protocolVersion: PROTOCOL_VERSION },
      { protocolVersion: PROTOCOL_VERSION, type: 'unknown' },
      { protocolVersion: PROTOCOL_VERSION, type: 'command', command: null },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'command',
        command: { type: 'snapshot' },
      },
    ]) {
      expect(() => parseWorkerRequest(value)).toThrow('Malformed worker request')
    }
  })

  it('keeps numeric protocol-version mismatch distinct from malformed request shape', () => {
    expect(() =>
      parseWorkerRequest({
        protocolVersion: PROTOCOL_VERSION + 1,
        type: 'initialize',
        identity,
      }),
    ).toThrow(`Unsupported protocol version: ${PROTOCOL_VERSION + 1}`)

    expect(() =>
      parseWorkerRequest({
        protocolVersion: String(PROTOCOL_VERSION),
        type: 'initialize',
        identity,
      }),
    ).toThrow('Malformed worker request')
  })

  it('rejects malformed nested command/checkpoint authority instead of defaulting values', () => {
    expect(() =>
      parseWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        type: 'command',
        command: { id: 'advance', type: 'advance', ticks: 0.5 },
      }),
    ).toThrow('Malformed worker request')

    expect(() =>
      parseWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        type: 'command',
        command: {
          id: 'restore',
          type: 'restore',
          checkpoint: {
            ...snapshot().checkpoint,
            rngState: [1, 2, 3],
          },
        },
      }),
    ).toThrow('Malformed worker request')
  })

  it('rejects malformed response discriminants, command ids, and nested snapshots', () => {
    for (const value of [
      null,
      { protocolVersion: PROTOCOL_VERSION, type: 'unknown' },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'snapshot',
        snapshot: snapshot(),
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'ready',
        snapshot: { ...snapshot(), checkpoint: null },
      },
      {
        protocolVersion: PROTOCOL_VERSION,
        type: 'error',
        commandId: 7,
        message: 'bad',
      },
    ]) {
      expect(() => parseWorkerResponse(value)).toThrow('Malformed worker response')
    }
  })

  it('rejects sparse snapshot event arrays and non-finite scientific values', () => {
    const sparseEvents = new Array(1)
    expect(() =>
      parseWorkerResponse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'ready',
        snapshot: { ...snapshot(), events: sparseEvents },
      }),
    ).toThrow('Malformed worker response')

    expect(() =>
      parseWorkerResponse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'ready',
        snapshot: {
          ...snapshot(),
          checkpoint: {
            ...snapshot().checkpoint,
            syntheticPopulation: Number.NaN,
          },
        },
      }),
    ).toThrow('Malformed worker response')
  })

  it('keeps response protocol-version mismatch distinct from malformed shape', () => {
    expect(() =>
      parseWorkerResponse({
        protocolVersion: PROTOCOL_VERSION + 1,
        type: 'ready',
        snapshot: snapshot(),
      }),
    ).toThrow(
      `Worker protocol mismatch: expected ${PROTOCOL_VERSION}, received ${PROTOCOL_VERSION + 1}`,
    )
  })
})
