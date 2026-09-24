import { describe, expect, it } from 'vitest'
import { AuthoritativeMetricHistory } from '../../src/app/metricHistory'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import {
  METRIC_SAMPLING_POLICY_VERSION,
} from '../../src/sim/metrics'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import {
  createRunIdentity,
  type SimulationSnapshot,
} from '../../src/sim/protocol'

const graph: CuratedMutationGraph = {
  scenarioId: 'metric-history-fixture',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'R', relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
}

const config: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [4, 4],
  ciprofloxacinConcentrationMgPerL: [0, 0],
  initialLineageBiomass: [[1, 0], [3, 0]],
  growth: {
    maxDivisionRate: 0,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 10,
    spreadRate: 0,
  },
  lineages: [
    { id: 'wt-lineage', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'r-lineage', genotypeId: 'R', deathHazardPerHour: 0 },
  ],
  evolutionGraph: graph,
  evolutionScenario: {
    scenarioId: 'metric-history-fixture',
    scenarioVersion: '1',
  },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  hoursPerTick: 0.1,
}

const binding = createFixtureComposedParameterSetBinding(
  'fixture:metric-history',
  '1',
  config,
)

function identity(seed = 7) {
  return createRunIdentity({
    scenarioId: 'metric-history-fixture',
    scenarioVersion: '1',
    parameterSetId: binding.parameterSetId,
    parameterSetVersion: binding.parameterSetVersion,
    parameterSetBinding: binding,
    seed,
  })
}

const policy = {
  version: METRIC_SAMPLING_POLICY_VERSION,
  everyTicks: 5,
  offsetTicks: 0,
} as const

function history() {
  return new AuthoritativeMetricHistory({
    samplingPolicy: policy,
    resistantGenotypeIds: ['R'],
  })
}

describe('live authoritative metric history', () => {
  it('samples exact composed snapshots on the versioned tick cadence', () => {
    const engine = new ComposedSimulationEngine(identity(), config)
    const metricHistory = history()

    expect(metricHistory.record(engine.snapshot())).toMatchObject({
      status: 'recorded',
      sample: { tick: 0, simulationTimeHours: 0 },
    })

    expect(
      metricHistory.record(
        engine.execute({ id: 'advance-1', type: 'advance', ticks: 1 }),
      ),
    ).toEqual({ status: 'not-scheduled', sample: null })

    expect(
      metricHistory.record(
        engine.execute({ id: 'advance-2', type: 'advance', ticks: 4 }),
      ),
    ).toMatchObject({
      status: 'recorded',
      sample: { tick: 5, simulationTimeHours: 0.5 },
    })

    expect(metricHistory.samples.map((sample) => sample.tick)).toEqual([0, 5])
    expect(metricHistory.samples[1]?.resistantFraction).toBeCloseTo(0.75)
  })

  it('deduplicates identical delivery and refuses conflicting same-tick traces', () => {
    const engine = new ComposedSimulationEngine(identity(), config)
    const metricHistory = history()
    const snapshot = engine.snapshot()

    expect(metricHistory.record(snapshot).status).toBe('recorded')
    expect(metricHistory.record(snapshot)).toEqual({
      status: 'duplicate',
      sample: null,
    })

    const conflicting = structuredClone(snapshot)
    ;(conflicting as { traceHash: string }).traceHash = 'different-trace'

    expect(() => metricHistory.record(conflicting)).toThrow(
      /conflicting authoritative states at one tick/,
    )
  })

  it('fails closed on foreign runs and regressed replay generations', () => {
    const engine = new ComposedSimulationEngine(identity(), config)
    const metricHistory = history()
    const origin = engine.snapshot()

    metricHistory.record(origin)
    metricHistory.record(
      engine.execute({ id: 'advance-1', type: 'advance', ticks: 5 }),
    )

    const foreign = new ComposedSimulationEngine(identity(8), config).snapshot()
    expect(() => metricHistory.record(foreign)).toThrow(/mix run identities/)

    expect(() => metricHistory.record(origin)).toThrow(/cannot regress ticks/)
  })

  it('rejects synthetic infrastructure snapshots instead of charting them', () => {
    const syntheticIdentity = createRunIdentity({
      scenarioId: 'synthetic-metric-history',
      scenarioVersion: '1',
      parameterSetId: 'synthetic',
      parameterSetVersion: '1',
      seed: 3,
    })
    const synthetic: SimulationSnapshot = {
      checkpoint: {
        identity: syntheticIdentity,
        tick: 0,
        simulationTimeHours: 0,
        syntheticPopulation: 1,
        rngState: [1, 2, 3, 4],
        commandCount: 0,
      },
      events: [],
      traceHash: 'synthetic-trace',
    }

    expect(() => history().record(synthetic)).toThrow(
      /requires composed snapshot authority/,
    )
  })

  it('returns defensive sample copies so consumers cannot mutate history', () => {
    const engine = new ComposedSimulationEngine(identity(), config)
    const metricHistory = history()
    const recorded = metricHistory.record(engine.snapshot())

    if (recorded.status !== 'recorded') {
      throw new Error('expected a recorded metric sample')
    }

    ;(recorded.sample as { totalBiomass: number }).totalBiomass = 999
    const exposed = metricHistory.samples
    ;(exposed[0] as { totalBiomass: number }).totalBiomass = 777

    expect(metricHistory.samples[0]?.totalBiomass).toBe(4)
  })
})
