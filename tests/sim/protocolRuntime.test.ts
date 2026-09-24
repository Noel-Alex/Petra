import { describe, expect, it } from 'vitest'

import {
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import {
  PROTOCOL_VERSION,
  createRunIdentity,
  type SimulationSnapshot,
} from '../../src/sim/protocol'
import {
  parseWorkerRequest,
  parseWorkerResponse,
} from '../../src/sim/protocolRuntime'

const syntheticIdentity = createRunIdentity({
  scenarioId: 'protocol-runtime-synthetic',
  scenarioVersion: '1',
  parameterSetId: 'synthetic-fixture',
  parameterSetVersion: '1',
  seed: 17,
})

function syntheticSnapshot(): SimulationSnapshot {
  return {
    checkpoint: {
      identity: syntheticIdentity,
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
    traceHash: 'synthetic-fixture-trace',
  }
}

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'protocol-runtime-composed',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'VAR', relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
}

const composedConfig: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [8, 8],
  initialLineageBiomass: [[1, 0], [2, 0]],
  growth: {
    maxDivisionRate: 0.8,
    halfSaturation: 2,
    biomassYield: 0.5,
    localCapacity: 20,
    spreadRate: 0,
  },
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'variant', genotypeId: 'VAR', deathHazardPerHour: 0.1 },
  ],
  evolutionGraph,
  evolutionScenario: {
    scenarioId: 'protocol-runtime-composed',
    scenarioVersion: '1',
  },
  samplingExecutionPolicy: null,
  hoursPerTick: 0.01,
}

const parameterSetId = 'fixture:protocol-runtime-composed'
const parameterSetVersion = '1'
const composedIdentity = createRunIdentity({
  scenarioId: 'protocol-runtime-composed',
  scenarioVersion: '1',
  parameterSetId,
  parameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    parameterSetId,
    parameterSetVersion,
    composedConfig,
  ),
  seed: 23,
})

const composedSnapshot = new ComposedSimulationEngine(
  composedIdentity,
  composedConfig,
).snapshot()

describe('worker protocol-v4 runtime validation', () => {
  it('accepts valid synthetic protocol requests and responses', () => {
    expect(
      parseWorkerRequest({
        protocolVersion: PROTOCOL_VERSION,
        type: 'initialize',
        identity: syntheticIdentity,
      }),
    ).toMatchObject({ ok: true })

    expect(
      parseWorkerResponse({
        protocolVersion: PROTOCOL_VERSION,
        type: 'ready',
        snapshot: syntheticSnapshot(),
      }),
    ).toMatchObject({ ok: true })
  })

  it('preserves the complete composed initialize payload after validation', () => {
    const payload = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'initialize' as const,
      identity: composedIdentity,
      composedConfig,
    }
    const parsed = parseWorkerRequest(payload)

    expect(parsed).toMatchObject({ ok: true })
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.value).toBe(payload)
    if (parsed.value.type !== 'initialize') {
      throw new Error('expected initialize request')
    }
    expect(parsed.value.identity.parameterSetBinding).toEqual(
      composedIdentity.parameterSetBinding,
    )
    expect(parsed.value.composedConfig).toBe(composedConfig)
  })

  it('accepts a valid composed authoritative snapshot', () => {
    const payload = {
      protocolVersion: PROTOCOL_VERSION,
      type: 'ready' as const,
      snapshot: composedSnapshot,
    }
    const parsed = parseWorkerResponse(payload)

    expect(parsed).toMatchObject({ ok: true })
    if (!parsed.ok) throw new Error(parsed.error)
    expect(parsed.value).toBe(payload)
    if (parsed.value.type !== 'ready') throw new Error('expected ready response')
    expect(parsed.value.snapshot.checkpoint.authority).toBe('composed')
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

  it('rejects unsupported protocol versions before typed handling', () => {
    const request = parseWorkerRequest({
      protocolVersion: 99,
      type: 'command',
      command: { id: 'snapshot-99', type: 'snapshot' },
    })
    expect(request).toMatchObject({
      ok: false,
      commandId: 'snapshot-99',
    })
    if (!request.ok) {
      expect(request.error).toContain('unsupported protocol version')
    }

    expect(
      parseWorkerResponse({
        protocolVersion: 99,
        type: 'ready',
        snapshot: syntheticSnapshot(),
      }),
    ).toEqual({
      ok: false,
      error: 'Worker protocol mismatch: expected 4, received 99',
      commandId: null,
    })
  })

  it('rejects malformed nested restore RNG state while retaining request correlation', () => {
    const sparseRng = [1, , 3, 4]
    const checkpoint = structuredClone(syntheticSnapshot().checkpoint)
    ;(checkpoint as { rngState: unknown }).rngState = sparseRng

    const parsed = parseWorkerRequest({
      protocolVersion: PROTOCOL_VERSION,
      type: 'command',
      command: {
        id: 'restore-bad-rng',
        type: 'restore',
        checkpoint,
      },
    })

    expect(parsed).toMatchObject({
      ok: false,
      commandId: 'restore-bad-rng',
    })
    if (!parsed.ok) expect(parsed.error).toContain('rngState')
  })

  it('rejects composed initialize config that does not match its binding', () => {
    const changedConfig: ComposedSimulationConfig = {
      ...composedConfig,
      growth: {
        ...composedConfig.growth,
        maxDivisionRate: composedConfig.growth.maxDivisionRate + 0.01,
      },
    }

    const parsed = parseWorkerRequest({
      protocolVersion: PROTOCOL_VERSION,
      type: 'initialize',
      identity: composedIdentity,
      composedConfig: changedConfig,
    })

    expect(parsed).toEqual({
      ok: false,
      error:
        'Invalid worker request: initialize.composedConfig or parameter-set binding is invalid',
      commandId: null,
    })
  })

  it('rejects malformed composed metrics instead of promoting false authority', () => {
    const corrupt = structuredClone(composedSnapshot)
    ;(corrupt.checkpoint.metrics as { totalBiomass: number }).totalBiomass += 1

    const parsed = parseWorkerResponse({
      protocolVersion: PROTOCOL_VERSION,
      type: 'ready',
      snapshot: corrupt,
    })

    expect(parsed).toMatchObject({
      ok: false,
      commandId: null,
    })
    if (!parsed.ok) {
      expect(parsed.error).toContain('aggregate values do not match')
    }
  })

  it('rejects composed state whose fingerprint is detached from run identity', () => {
    const corrupt = structuredClone(composedSnapshot)
    ;(
      corrupt.checkpoint.composedState as {
        configurationFingerprint: string
      }
    ).configurationFingerprint += '-forged'

    const parsed = parseWorkerResponse({
      protocolVersion: PROTOCOL_VERSION,
      type: 'ready',
      snapshot: corrupt,
    })

    expect(parsed).toMatchObject({ ok: false, commandId: null })
    if (!parsed.ok) {
      expect(parsed.error).toContain('parameter-set binding')
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
  })

  it('rejects sparse authoritative event arrays', () => {
    const events = new Array(2)
    events[1] = syntheticSnapshot().events[0]

    const parsed = parseWorkerResponse({
      protocolVersion: PROTOCOL_VERSION,
      type: 'ready',
      snapshot: {
        ...syntheticSnapshot(),
        events,
      },
    })

    expect(parsed).toMatchObject({ ok: false })
    if (!parsed.ok) expect(parsed.error).toContain('events must be dense')
  })
})
