import { describe, expect, it } from 'vitest'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import {
  assertSameComposedStepObservationPosition,
  createComposedStepObservationPosition,
} from '../../src/sim/composedObservationTransaction'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'observation-position-test',
  scenarioVersion: '1',
  genotypes: [{ id: 'WT', relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
}

const config: ComposedSimulationConfig = {
  width: 2,
  height: 2,
  mask: [1, 1, 1, 0],
  initialResource: [1, 1, 1, 0],
  ciprofloxacinConcentrationMgPerL: [0, 0, 0, 0],
  initialLineageBiomass: [[1, 0, 0, 0]],
  growth: {
    maxDivisionRate: 1,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  evolutionGraph,
  evolutionScenario: {
    scenarioId: 'observation-position-test',
    scenarioVersion: '1',
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  lineages: [{ id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 }],
  hoursPerTick: 0.01,
}

function createEngine(seed = 31) {
  const binding = createFixtureComposedParameterSetBinding(
    'fixture:composed-observation-position',
    '1',
    config,
  )
  const identity = createRunIdentity({
    scenarioId: 'observation-position-test',
    scenarioVersion: '1',
    parameterSetId: binding.parameterSetId,
    parameterSetVersion: binding.parameterSetVersion,
    parameterSetBinding: binding,
    seed,
  })
  return new ComposedSimulationEngine(identity, config)
}

describe('composed step observation position', () => {
  it('captures detached exact accepted-state identity without becoming checkpoint authority', () => {
    const engine = createEngine()
    engine.execute({ id: 'advance-1', type: 'advance', ticks: 1 })
    const checkpoint = engine.snapshot().checkpoint
    const position = createComposedStepObservationPosition(checkpoint)

    expect(position.runIdentity).toEqual(checkpoint.identity)
    expect(position.runIdentity).not.toBe(checkpoint.identity)
    expect(position.configurationFingerprint).toBe(
      checkpoint.composedState.configurationFingerprint,
    )
    expect(position.tick).toBe(checkpoint.tick)
    expect(position.simulationTimeHours).toBe(checkpoint.simulationTimeHours)
    expect(position.commandCount).toBe(checkpoint.commandCount)
    expect(position.mask).toEqual(checkpoint.composedState.mask)
    expect(position.mask).not.toBe(checkpoint.composedState.mask)
    expect(position.lineageIds).toEqual(checkpoint.composedState.lineageIds)
    expect(position.genotypeIds).toEqual(checkpoint.composedState.genotypeIds)
    expect('metrics' in position).toBe(false)
    expect('resource' in position).toBe(false)
  })

  it('accepts independently projected positions for the same accepted state', () => {
    const checkpoint = createEngine().snapshot().checkpoint
    const first = createComposedStepObservationPosition(checkpoint)
    const second = createComposedStepObservationPosition(checkpoint)

    expect(() =>
      assertSameComposedStepObservationPosition(first, second),
    ).not.toThrow()
  })

  it('rejects cross-run and cross-position mixing', () => {
    const leftEngine = createEngine(31)
    const initial = createComposedStepObservationPosition(
      leftEngine.snapshot().checkpoint,
    )
    leftEngine.execute({ id: 'advance-1', type: 'advance', ticks: 1 })
    const advanced = createComposedStepObservationPosition(
      leftEngine.snapshot().checkpoint,
    )
    const otherRun = createComposedStepObservationPosition(
      createEngine(32).snapshot().checkpoint,
    )

    expect(() =>
      assertSameComposedStepObservationPosition(initial, advanced),
    ).toThrow(/does not match the accepted state transaction/)
    expect(() =>
      assertSameComposedStepObservationPosition(initial, otherRun),
    ).toThrow(/does not match the accepted state transaction/)
  })

  it('fails closed on grid, lineage, or configuration-binding drift', () => {
    const original = createComposedStepObservationPosition(
      createEngine().snapshot().checkpoint,
    )

    expect(() =>
      assertSameComposedStepObservationPosition(original, {
        ...original,
        mask: [1, 0, 1, 0],
      }),
    ).toThrow(/does not match the accepted state transaction/)

    const malformed = {
      ...structuredClone(original),
      runIdentity: {
        ...structuredClone(original.runIdentity),
        parameterSetBinding: {
          ...structuredClone(original.runIdentity.parameterSetBinding!),
          configurationFingerprint: 'wrong-fingerprint',
        },
      },
    }
    expect(() =>
      assertSameComposedStepObservationPosition(original, malformed),
    ).toThrow(/run binding does not match configuration fingerprint/)
  })
})
