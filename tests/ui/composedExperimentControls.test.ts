import { describe, expect, it } from 'vitest'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'
import {
  createExperimentControlState,
  planExperimentControlAction,
  recordAcceptedCommand,
} from '../../src/ui/experimentControls'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'composed-controls-fixture',
  scenarioVersion: '1',
  genotypes: [{ id: 'WT', relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
}

const parameterSetId = 'fixture:explicit-config'
const parameterSetVersion = '1'

const composedConfig: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [5],
  initialLineageBiomass: [[1]],
  growth: {
    maxDivisionRate: 0.5,
    halfSaturation: 1,
    biomassYield: 0.5,
    localCapacity: 10,
    spreadRate: 0,
  },
  evolutionGraph,
  evolutionScenario: {
    scenarioId: 'composed-controls-fixture',
    scenarioVersion: '1',
  },
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
  ],
  hoursPerTick: 0.02,
}

const identity = createRunIdentity({
  scenarioId: 'composed-controls-fixture',
  scenarioVersion: '1',
  parameterSetId,
  parameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    parameterSetId,
    parameterSetVersion,
    composedConfig,
  ),
  seed: 7,
})

function firstInitialize(action: 'reset' | 'replay' | 'set-seed') {
  let state = createExperimentControlState(identity)
  state = recordAcceptedCommand(state, {
    id: 'accepted',
    type: 'advance',
    ticks: 2,
  })

  const planned = planExperimentControlAction(
    state,
    action === 'set-seed'
      ? { type: 'set-seed', seed: 9 }
      : { type: action },
    () => 'unused',
    composedConfig,
  )
  if (planned.effect.type !== 'worker-requests') {
    throw new Error('expected worker requests')
  }
  const request = planned.effect.requests[0]
  if (request?.type !== 'initialize') {
    throw new Error('expected initialize request')
  }
  return request
}

describe('composed experiment-control lifecycle', () => {
  it('preserves composed authority through reset, replay, and reseed', () => {
    for (const action of ['reset', 'replay', 'set-seed'] as const) {
      const request = firstInitialize(action)
      expect(request.composedConfig).toEqual(composedConfig)
      expect(request.composedConfig).not.toBe(composedConfig)
    }
  })

  it('keeps omitted composed capability on the synthetic fixture path', () => {
    const planned = planExperimentControlAction(
      createExperimentControlState(identity),
      { type: 'reset' },
      () => 'unused',
    )
    if (planned.effect.type !== 'worker-requests') {
      throw new Error('expected worker requests')
    }
    const request = planned.effect.requests[0]
    expect(request).toMatchObject({ type: 'initialize' })
    expect(request && 'composedConfig' in request).toBe(false)
  })
})
