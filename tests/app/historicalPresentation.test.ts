import { describe, expect, it } from 'vitest'

import { buildAuthoritativeMetricSeries } from '../../src/app/analysisMetrics'
import { createAuthoritativeDishReplayKeyframe } from '../../src/app/dishReplayKeyframe'
import {
  createAuthoritativeHistoryIndex,
  type AuthoritativeHistoryKeyframe,
} from '../../src/app/historicalState'
import { projectHistoricalPresentation } from '../../src/app/historicalPresentation'
import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { extractAuthoritativeMetricSample } from '../../src/sim/metrics'
import { createFixtureComposedParameterSetBinding } from '../../src/sim/parameterSetBinding'
import { createRunIdentity, type ComposedSimulationSnapshot } from '../../src/sim/protocol'
import type { NormalizedRegionSelection } from '../../src/sim/regionInspector'
import type { DishRenderSnapshot } from '../../src/render/model'
import { createDishReplayPresenter } from '../../src/render/replayPresentation'

const graph: CuratedMutationGraph = {
  scenarioId: 'historical-presentation-fixture',
  scenarioVersion: '1',
  genotypes: [{ id: 'WT', relativeFitness: 1, sourceOrder: 0 }],
  transitions: [],
}

const config: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [8],
  initialLineageBiomass: [[1]],
  growth: {
    maxDivisionRate: 0.5,
    halfSaturation: 1,
    biomassYield: 0.5,
    localCapacity: 20,
    spreadRate: 0,
  },
  lineages: [
    {
      id: 'ancestor',
      genotypeId: 'WT',
      deathHazardPerHour: 0,
    },
  ],
  evolutionGraph: graph,
  evolutionScenario: {
    scenarioId: graph.scenarioId,
    scenarioVersion: graph.scenarioVersion,
  },
  samplingExecutionPolicy: null,
  hoursPerTick: 0.01,
}

const binding = createFixtureComposedParameterSetBinding(
  'fixture:historical-presentation',
  '1',
  config,
)

const identity = createRunIdentity({
  scenarioId: graph.scenarioId,
  scenarioVersion: graph.scenarioVersion,
  parameterSetId: binding.parameterSetId,
  parameterSetVersion: binding.parameterSetVersion,
  parameterSetBinding: binding,
  seed: 7,
})

const selection: NormalizedRegionSelection = {
  id: 'center',
  centerX: 0.5,
  centerY: 0.5,
  radius: 0.75,
}

function renderSnapshot(
  simulation: ComposedSimulationSnapshot,
  snapshotId: string,
): DishRenderSnapshot {
  return {
    snapshotId,
    samplingIdentity: 'historical-presentation-fixture',
    simulationTimeHours: simulation.checkpoint.simulationTimeHours,
    gridWidth: 1,
    gridHeight: 1,
    dishMask: new Uint8Array([1]),
    biomass: new Float32Array([
      simulation.checkpoint.metrics.totalBiomass,
    ]),
    fields: [],
    lineages: [],
    events: [],
  }
}

function fixture() {
  const engine = new ComposedSimulationEngine(identity, config)
  const start = engine.snapshot()
  engine.execute({ id: 'advance-1', type: 'advance', ticks: 1 })
  const middle = engine.snapshot()
  engine.execute({ id: 'advance-2', type: 'advance', ticks: 1 })
  const end = engine.snapshot()
  engine.execute({ id: 'advance-3', type: 'advance', ticks: 1 })
  const later = engine.snapshot()

  const historyKeyframes: AuthoritativeHistoryKeyframe[] = [
    {
      schemaVersion: 1,
      runBranchIdentity: 'branch-main',
      snapshot: start,
    },
    {
      schemaVersion: 1,
      runBranchIdentity: 'branch-main',
      snapshot: end,
    },
  ]
  const history = createAuthoritativeHistoryIndex(historyKeyframes)

  const dishKeyframes = [
    createAuthoritativeDishReplayKeyframe({
      runBranchIdentity: 'branch-main',
      simulationSnapshot: start,
      dishSnapshot: renderSnapshot(start, 'dish-start'),
    }),
    createAuthoritativeDishReplayKeyframe({
      runBranchIdentity: 'branch-main',
      simulationSnapshot: end,
      dishSnapshot: renderSnapshot(end, 'dish-end'),
    }),
  ]
  const dishPresenter = createDishReplayPresenter(dishKeyframes)

  const samplingPolicy = {
    version: 1,
    everyTicks: 1,
    offsetTicks: 0,
  } as const
  const samples = [start, end].map((snapshot) =>
    extractAuthoritativeMetricSample({
      checkpoint: snapshot.checkpoint,
      samplingPolicy,
      resistantGenotypeIds: [],
    }),
  )
  const analysisSeries = buildAuthoritativeMetricSeries(samples, {
    biomassUnit: 'model-biomass',
    resourceUnit: 'model-resource',
    fractionUnit: 'fraction',
    diversityUnit: 'nats',
    totalBiomassStyle: {
      appearanceToken: 'biomass',
      patternToken: 'solid',
    },
    totalResourceStyle: {
      appearanceToken: 'resource',
      patternToken: 'solid',
    },
    resistantFractionStyle: {
      appearanceToken: 'resistance',
      patternToken: 'dashed',
    },
    lineageDiversityStyle: {
      appearanceToken: 'diversity',
      patternToken: 'dotted',
    },
    genotypes: [
      {
        genotypeId: 'WT',
        label: 'WT',
        appearanceToken: 'genotype-wt',
        patternToken: 'solid',
      },
    ],
  })

  return {
    start,
    middle,
    end,
    later,
    history,
    dishPresenter,
    analysisSeries,
  }
}

describe('synchronized historical presentation', () => {
  it('projects exact authority to dish, analysis cursor, inspector, and time together', () => {
    const { history, dishPresenter, analysisSeries } = fixture()
    const resolution = history.resolve(0)

    const frame = projectHistoricalPresentation({
      resolution,
      dishPresenter,
      analysisSeries,
      regionSelection: selection,
    })

    expect(frame.kind).toBe('authoritative')
    if (frame.kind !== 'authoritative') throw new Error('expected authority')
    expect(frame.stateAuthority).toBe('authoritative')
    expect(frame.scientificCheckpoint.commandCount).toBe(0)
    expect(frame.scientificCheckpoint.simulationTimeHours).toBe(0)
    expect(frame.dish.mode).toBe('authoritative-keyframe')
    expect(frame.dish.stateAuthority).toBe('authoritative')
    expect(frame.time).toEqual({
      kind: 'authoritative',
      commandCount: 0,
      simulationTimeHours: 0,
    })
    expect(frame.analysis?.cursor).toEqual({
      kind: 'authoritative',
      stateAuthority: 'authoritative',
      commandCount: 0,
      simulationTimeHours: 0,
    })
    expect(frame.regionInspection).toMatchObject({
      kind: 'measured',
      selectionId: 'center',
      totalBiomass: 1,
      totalResource: 8,
    })
  })

  it('keeps between-keyframe science unavailable while dish interpolation is presentation-only', () => {
    const { history, dishPresenter, analysisSeries } = fixture()
    const resolution = history.resolve(1)

    const frame = projectHistoricalPresentation({
      resolution,
      dishPresenter,
      analysisSeries,
      regionSelection: selection,
    })

    expect(frame.kind).toBe('between-authority')
    if (frame.kind !== 'between-authority') {
      throw new Error('expected between-authority frame')
    }
    expect(frame.stateAuthority).toBe('presentation-only')
    expect(frame.scientificCheckpoint).toBeNull()
    expect(frame.regionInspection).toBeNull()
    expect(frame.regionInspectionUnavailableReason).toBe(
      'presentation-only-cursor',
    )
    expect(frame.dish.mode).toBe('interpolated-presentation')
    expect(frame.dish.stateAuthority).toBe('presentation-only')
    expect(frame.time).toEqual({
      kind: 'bounded-presentation',
      lowerCommandCount: 0,
      upperCommandCount: 2,
      lowerSimulationTimeHours: 0,
      upperSimulationTimeHours: 0.02,
      progress: 0.5,
    })
    expect(frame.analysis?.cursor).toEqual({
      kind: 'between-authority',
      stateAuthority: 'presentation-only',
      lowerCommandCount: 0,
      upperCommandCount: 2,
      lowerSimulationTimeHours: 0,
      upperSimulationTimeHours: 0.02,
      progress: 0.5,
      scientificInterpolation: false,
    })
  })

  it('does not upgrade an in-between cursor when the renderer snaps to lower authority', () => {
    const { history, dishPresenter, analysisSeries } = fixture()
    const resolution = history.resolve(1)

    const frame = projectHistoricalPresentation({
      resolution,
      dishPresenter,
      dishMotion: 'snap-to-authority',
      analysisSeries,
      regionSelection: selection,
    })

    expect(frame.kind).toBe('between-authority')
    if (frame.kind !== 'between-authority') {
      throw new Error('expected between-authority frame')
    }
    expect(frame.dish.mode).toBe('previous-authority-snap')
    expect(frame.dish.stateAuthority).toBe('authoritative')
    expect(frame.stateAuthority).toBe('presentation-only')
    expect(frame.scientificCheckpoint).toBeNull()
    expect(frame.regionInspection).toBeNull()
  })

  it('fails closed when dish replay bounds do not match simulation history', () => {
    const { history, start, later, analysisSeries } = fixture()
    const mismatchedDishPresenter = createDishReplayPresenter([
      createAuthoritativeDishReplayKeyframe({
        runBranchIdentity: 'branch-main',
        simulationSnapshot: start,
        dishSnapshot: renderSnapshot(start, 'dish-start'),
      }),
      createAuthoritativeDishReplayKeyframe({
        runBranchIdentity: 'branch-main',
        simulationSnapshot: later,
        dishSnapshot: renderSnapshot(later, 'dish-later'),
      }),
    ])

    expect(() =>
      projectHistoricalPresentation({
        resolution: history.resolve(1),
        dishPresenter: mismatchedDishPresenter,
        analysisSeries,
      }),
    ).toThrow(/bounds do not match/)
  })

  it('fails closed when chart history belongs to another run identity', () => {
    const { history, dishPresenter, analysisSeries } = fixture()
    const foreignSeries = structuredClone(analysisSeries) as typeof analysisSeries
    ;(foreignSeries.identity as { seed: number }).seed = 99

    expect(() =>
      projectHistoricalPresentation({
        resolution: history.resolve(0),
        dishPresenter,
        analysisSeries: foreignSeries,
      }),
    ).toThrow(/different run identity/)
  })
})
