import { describe, expect, it } from 'vitest'

import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import {
  assertComposedEcologyObservationEnvelopeMatchesPosition,
  createComposedEcologyObservationEnvelope,
} from '../../src/sim/composedEcologyObservation'
import {
  createComposedStepObservationPosition,
} from '../../src/sim/composedObservationTransaction'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import {
  ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
  type EcologyFluxObservation,
} from '../../src/sim/ecology/fluxObservation'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'composed-observation-envelope-test',
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
    scenarioId: evolutionGraph.scenarioId,
    scenarioVersion: evolutionGraph.scenarioVersion,
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  lineages: [{ id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 }],
  hoursPerTick: 0.01,
}

function createEngine(seed = 41): ComposedSimulationEngine {
  const binding = createFixtureComposedParameterSetBinding(
    'fixture:composed-observation-envelope',
    '1',
    config,
  )
  return new ComposedSimulationEngine(
    createRunIdentity({
      scenarioId: evolutionGraph.scenarioId,
      scenarioVersion: evolutionGraph.scenarioVersion,
      parameterSetId: binding.parameterSetId,
      parameterSetVersion: binding.parameterSetVersion,
      parameterSetBinding: binding,
      seed,
    }),
    config,
  )
}

function observationFor(
  position: ReturnType<typeof createComposedStepObservationPosition>,
): EcologyFluxObservation {
  const cellCount = position.width * position.height
  const zeros = () => new Array<number>(cellCount).fill(0)

  return {
    schemaVersion: ECOLOGY_FLUX_OBSERVATION_SCHEMA_VERSION,
    width: position.width,
    height: position.height,
    mask: [...position.mask],
    lineageIds: [...position.lineageIds],
    biomassUnit: 'model-biomass',
    timeUnit: 'hour',
    stepDuration: 0.01,
    divisionBiomassByLineage: position.lineageIds.map(() => zeros()),
    deathBiomassByLineage: position.lineageIds.map(() => zeros()),
    divisionBiomassByCell: zeros(),
    deathBiomassByCell: zeros(),
    netLocalBiomassChangeByCell: zeros(),
    averageDivisionBiomassRateByCell: zeros(),
    averageDeathBiomassRateByCell: zeros(),
    averageNetLocalBiomassRateByCell: zeros(),
    totalDivisionBiomass: 0,
    totalDeathBiomass: 0,
  }
}

describe('composed ecology observation envelope', () => {
  it('binds a detached payload to one exact accepted composed position', () => {
    const engine = createEngine()
    engine.execute({ id: 'advance-1', type: 'advance', ticks: 1 })
    const position = createComposedStepObservationPosition(
      engine.snapshot().checkpoint,
    )
    const observation = observationFor(position)
    const envelope = createComposedEcologyObservationEnvelope(
      position,
      observation,
    )

    expect(envelope.position).toEqual(position)
    expect(envelope.position).not.toBe(position)
    expect(envelope.observation).toEqual(observation)
    expect(envelope.observation).not.toBe(observation)
    expect(envelope.intervalStartSimulationTimeHours).toBe(0)
    expect(envelope.intervalEndSimulationTimeHours).toBe(0.01)
    expect(() =>
      assertComposedEcologyObservationEnvelopeMatchesPosition(
        position,
        envelope,
      ),
    ).not.toThrow()

    ;(observation.mask as number[])[0] = 0
    ;(observation.divisionBiomassByCell as number[])[0] = 999
    expect(envelope.observation.mask[0]).toBe(1)
    expect(envelope.observation.divisionBiomassByCell[0]).toBe(0)
  })

  it('rejects grid, mask, lineage and composed-unit drift', () => {
    const engine = createEngine()
    engine.execute({ id: 'advance-1', type: 'advance', ticks: 1 })
    const position = createComposedStepObservationPosition(
      engine.snapshot().checkpoint,
    )
    const observation = observationFor(position)

    expect(() =>
      createComposedEcologyObservationEnvelope(position, {
        ...observation,
        width: position.width + 1,
      }),
    ).toThrow(/grid dimensions/i)

    expect(() =>
      createComposedEcologyObservationEnvelope(position, {
        ...observation,
        mask: [0, ...observation.mask.slice(1)],
      }),
    ).toThrow(/mask does not match/i)

    expect(() =>
      createComposedEcologyObservationEnvelope(position, {
        ...observation,
        lineageIds: ['wrong-lineage'],
      }),
    ).toThrow(/lineage order does not match/i)

    expect(() =>
      createComposedEcologyObservationEnvelope(position, {
        ...observation,
        divisionBiomassByCell: [0, 0, 0, 1],
      }),
    ).toThrow(/zero outside the ecology mask/i)

    expect(() =>
      createComposedEcologyObservationEnvelope(position, {
        ...observation,
        biomassUnit: 'cells',
      }),
    ).toThrow(/model-biomass/i)

    expect(() =>
      createComposedEcologyObservationEnvelope(position, {
        ...observation,
        timeUnit: 'minute',
      }),
    ).toThrow(/timeUnit must be hour/i)
  })

  it('rejects an observation whose interval would precede time zero', () => {
    const engine = createEngine()
    engine.execute({ id: 'advance-1', type: 'advance', ticks: 1 })
    const position = createComposedStepObservationPosition(
      engine.snapshot().checkpoint,
    )
    const observation = observationFor(position)

    expect(() =>
      createComposedEcologyObservationEnvelope(position, {
        ...observation,
        stepDuration: position.simulationTimeHours + 0.01,
      }),
    ).toThrow(/cannot precede simulation time zero/i)
  })

  it('rejects cross-position reuse after a later accepted command', () => {
    const engine = createEngine()
    engine.execute({ id: 'advance-1', type: 'advance', ticks: 1 })
    const firstPosition = createComposedStepObservationPosition(
      engine.snapshot().checkpoint,
    )
    const envelope = createComposedEcologyObservationEnvelope(
      firstPosition,
      observationFor(firstPosition),
    )

    engine.execute({ id: 'advance-2', type: 'advance', ticks: 1 })
    const secondPosition = createComposedStepObservationPosition(
      engine.snapshot().checkpoint,
    )

    expect(() =>
      assertComposedEcologyObservationEnvelopeMatchesPosition(
        secondPosition,
        envelope,
      ),
    ).toThrow(/does not match the accepted state transaction/i)
  })
})
