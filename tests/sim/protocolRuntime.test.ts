import { describe, expect, it } from 'vitest'

import {
  PROTOCOL_VERSION,
  createRunIdentity,
  type SimulationSnapshot,
} from '../../src/sim/protocol'
import {
  parseWorkerRequest,
  parseWorkerResponse,
} from '../../src/sim/protocolRuntime'

const identity = createRunIdentity({
  scenarioId: 'protocol-runtime-fixture',
  scenarioVersion: '1',
  parameterSetId: 'protocol-runtime-fixture',
  parameterSetVersion: '1',
  seed: 17,
})

function snapshot(): SimulationSnapshot {
  return {
    checkpoint: {
      identity,
      tick: 0,
      simulationTimeHours: 0,
      syntheticPopulation: 100,
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
    traceHash: 'fixture-trace',
  }
}

describe('worker protocol runtime validation', () => {
  it('accepts valid protocol-v2 requests and responses', () => {
    expect(
      parseWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        type: 'initialize',
        identity,
      }),
    ).toMatchObject({ ok: true })

    expect(
      parseWorkerResponse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'ready',
        snapshot: snapshot(),
      }),
    ).toMatchObject({ ok: true })
  })

  it('rejects non-object envelopes without throwing', () => {
    expect(parseWorkerRequest(null)).toEqual({
      ok: false,
      error: 'Invalid worker request: expected an object',
      commandId: null,
    })
    expect(parseWorkerResponse(undefined)).toEqual({
      ok: false,
      error: 'Invalid worker response: expected an object',
      commandId: null,
    })
  })

  it('retains a trustworthy command id when a request command is malformed', () => {
    expect(
      parseWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        type: 'command',
        command: {
          id: 'advance-17',
          type: 'advance',
          ticks: '4',
        },
      }),
    ).toEqual({
      ok: false,
      error:
        'Invalid worker request: command .ticks must be a non-negative safe integer',
      commandId: 'advance-17',
    })
  })

  it('rejects unsupported protocol versions before typed handling', () => {
    expect(
      parseWorkerRequest({
        protocolVersion: 99,
        type: 'command',
        command: { id: 'snapshot-99', type: 'snapshot' },
      }),
    ).toEqual({
      ok: false,
      error: 'Unsupported protocol version: 99',
      commandId: 'snapshot-99',
    })

    expect(
      parseWorkerResponse({
        protocolVersion: 99,
        type: 'ready',
        snapshot: snapshot(),
      }),
    ).toEqual({
      ok: false,
      error: 'Worker protocol mismatch: expected 2, received 99',
      commandId: null,
    })
  })

  it('rejects malformed nested restore checkpoints including sparse RNG state', () => {
    const sparseRng = [1, , 3, 4]

    const parsed = parseWorkerRequest({
      protocolVersion: PROTOCOL_VERSION,
      type: 'command',
      command: {
        id: 'restore-bad-rng',
        type: 'restore',
        checkpoint: {
          ...snapshot().checkpoint,
          rngState: sparseRng,
        },
      },
    })

    expect(parsed).toMatchObject({
      ok: false,
      commandId: 'restore-bad-rng',
    })
    if (!parsed.ok) {
      expect(parsed.error).toContain('rngState')
    }
  })

  it('never trusts a forged command id from a malformed response', () => {
    const parsed = parseWorkerResponse({
      protocolVersion: PROTOCOL_VERSION,
      type: 'snapshot',
      commandId: 'forged-command',
      snapshot: null,
    })

    expect(parsed).toMatchObject({
      ok: false,
      commandId: null,
    })
    if (!parsed.ok) {
      expect(parsed.error).toContain('snapshot.snapshot')
    }
  })

  it('rejects sparse authoritative event arrays', () => {
    const events = new Array(2)
    events[1] = snapshot().events[0]

    const parsed = parseWorkerResponse({
      protocolVersion: PROTOCOL_VERSION,
      type: 'ready',
      snapshot: {
        ...snapshot(),
        events,
      },
    })

    expect(parsed).toMatchObject({ ok: false })
    if (!parsed.ok) {
      expect(parsed.error).toContain('events must be dense')
    }
  })
})
