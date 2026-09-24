import { describe, expect, it } from 'vitest'
import {
  composedConfigurationFingerprint,
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import { SimulationEngine } from '../../src/sim/engine'
import {
  ExperimentBundleError,
  createExperimentBundle,
  parseExperimentBundle,
  replayExperimentBundle,
  serializeExperimentBundle,
  validateExperimentBundle,
} from '../../src/sim/experimentBundle'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { extractAuthoritativeMetricSample } from '../../src/sim/metrics'
import {
  COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  type ComposedParameterSetBinding,
} from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'experiment-bundle-fixture',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'VAR', relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
}

const config: ComposedSimulationConfig = {
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
  evolutionGraph,
  evolutionScenario: {
    scenarioId: evolutionGraph.scenarioId,
    scenarioVersion: evolutionGraph.scenarioVersion,
  },
  samplingExecutionPolicy: null,
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'variant', genotypeId: 'VAR', deathHazardPerHour: 0.1 },
  ],
  hoursPerTick: 0.01,
}

const binding: ComposedParameterSetBinding = {
  schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  authority: 'provenance',
  parameterSetId: 'experiment-bundle-fixture-parameters',
  parameterSetVersion: '1',
  configurationFingerprint: composedConfigurationFingerprint(config),
}

describe('experiment export bundle', () => {
  it('round-trips a synthetic replay from an exact origin checkpoint', () => {
    const identity = createRunIdentity({
      scenarioId: 'synthetic-export-fixture',
      scenarioVersion: '1',
      parameterSetId: 'none',
      parameterSetVersion: '1',
      seed: 17,
    })
    const originEngine = new SimulationEngine(identity)
    originEngine.execute({ id: 'pre', type: 'advance', ticks: 2 })
    const origin = originEngine.snapshot()
    const commands = [
      { id: 'advance-1', type: 'advance' as const, ticks: 3 },
      { id: 'pulse-1', type: 'synthetic-pulse' as const, magnitude: 4 },
    ]

    const expectedEngine = new SimulationEngine(identity)
    expectedEngine.execute({
      id: 'expected-restore',
      type: 'restore',
      checkpoint: structuredClone(origin.checkpoint),
    })
    for (const command of commands) expectedEngine.execute(command)
    const expected = expectedEngine.snapshot()

    const bundle = createExperimentBundle({
      originCheckpoint: origin.checkpoint,
      commands,
      events: origin.events,
      provenanceSourceIds: ['source:z', 'source:a'],
    })

    expect(bundle.authority).toBe('synthetic')
    expect(bundle.evidence.provenanceSourceIds).toEqual([
      'source:a',
      'source:z',
    ])
    expect(bundle.capabilities).toEqual({
      rendererStateIncluded: false,
      rawDatasetIncluded: false,
      counterfactualAncestryIncluded: false,
    })

    const serialized = serializeExperimentBundle(bundle)
    const parsed = parseExperimentBundle(serialized)
    expect(serializeExperimentBundle(parsed)).toBe(serialized)

    const replayed = replayExperimentBundle(parsed)
    expect(replayed.checkpoint).toEqual(expected.checkpoint)
  })

  it('round-trips composed authority with exact config binding and compact metrics', () => {
    const identity = createRunIdentity({
      scenarioId: evolutionGraph.scenarioId,
      scenarioVersion: evolutionGraph.scenarioVersion,
      parameterSetId: binding.parameterSetId,
      parameterSetVersion: binding.parameterSetVersion,
      parameterSetBinding: binding,
      seed: 23,
    })
    const originEngine = new ComposedSimulationEngine(identity, config)
    originEngine.execute({ id: 'pre', type: 'advance', ticks: 2 })
    const origin = originEngine.snapshot()
    const metric = extractAuthoritativeMetricSample({
      checkpoint: origin.checkpoint,
      samplingPolicy: { version: 1, everyTicks: 1, offsetTicks: 0 },
      resistantGenotypeIds: ['VAR'],
    })
    const commands = [
      { id: 'advance-1', type: 'advance' as const, ticks: 4 },
    ]

    const expectedEngine = new ComposedSimulationEngine(identity, config)
    expectedEngine.execute({
      id: 'expected-restore',
      type: 'restore',
      checkpoint: structuredClone(origin.checkpoint),
    })
    for (const command of commands) expectedEngine.execute(command)
    const expected = expectedEngine.snapshot()

    const bundle = createExperimentBundle({
      originCheckpoint: origin.checkpoint,
      commands,
      composedConfig: config,
      events: origin.events,
      metrics: [metric],
      provenanceSourceIds: ['doi:fixture'],
    })
    expect(bundle.authority).toBe('composed')

    const replayed = replayExperimentBundle(bundle)
    expect(replayed.checkpoint).toEqual(expected.checkpoint)
    expect(replayed.checkpoint.identity.parameterSetBinding).toEqual(binding)
  })

  it('rejects composed config drift before replay', () => {
    const identity = createRunIdentity({
      scenarioId: evolutionGraph.scenarioId,
      scenarioVersion: evolutionGraph.scenarioVersion,
      parameterSetId: binding.parameterSetId,
      parameterSetVersion: binding.parameterSetVersion,
      parameterSetBinding: binding,
      seed: 23,
    })
    const origin = new ComposedSimulationEngine(identity, config).snapshot()
    const driftedConfig: ComposedSimulationConfig = {
      ...config,
      growth: {
        ...config.growth,
        maxDivisionRate: config.growth.maxDivisionRate + 0.01,
      },
    }

    expect(() =>
      createExperimentBundle({
        originCheckpoint: origin.checkpoint,
        commands: [],
        composedConfig: driftedConfig,
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'config-binding-mismatch',
      }),
    )
  })

  it('rejects unsupported runtime identity instead of approximating', () => {
    const identity = createRunIdentity({
      scenarioId: 'synthetic-export-fixture',
      scenarioVersion: '1',
      parameterSetId: 'none',
      parameterSetVersion: '1',
      seed: 17,
    })
    const bundle = createExperimentBundle({
      originCheckpoint: new SimulationEngine(identity).snapshot().checkpoint,
      commands: [],
    })
    const incompatible = structuredClone(bundle) as unknown as {
      identity: { engineVersion: string }
    }
    incompatible.identity.engineVersion = 'petra-ts-core/ancient'

    expect(() =>
      validateExperimentBundle(incompatible as never),
    ).toThrowError(
      expect.objectContaining({
        code: 'runtime-incompatible',
      }),
    )
  })

  it('rejects restore/snapshot history and synthetic commands in composed authority', () => {
    const identity = createRunIdentity({
      scenarioId: evolutionGraph.scenarioId,
      scenarioVersion: evolutionGraph.scenarioVersion,
      parameterSetId: binding.parameterSetId,
      parameterSetVersion: binding.parameterSetVersion,
      parameterSetBinding: binding,
      seed: 23,
    })
    const origin = new ComposedSimulationEngine(identity, config).snapshot()

    expect(() =>
      createExperimentBundle({
        originCheckpoint: origin.checkpoint,
        composedConfig: config,
        commands: [
          {
            id: 'not-biological',
            type: 'synthetic-pulse',
            magnitude: 1,
          } as never,
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'command-invalid',
      }),
    )

    expect(() =>
      createExperimentBundle({
        originCheckpoint: origin.checkpoint,
        composedConfig: config,
        commands: [
          {
            id: 'snapshot-in-history',
            type: 'snapshot',
          } as never,
        ],
      }),
    ).toThrowError(
      expect.objectContaining({
        code: 'command-invalid',
      }),
    )
  })

  it('keeps counterfactual ancestry fail-closed until its trace is independently verifiable', () => {
    const identity = createRunIdentity({
      scenarioId: 'synthetic-export-fixture',
      scenarioVersion: '1',
      parameterSetId: 'none',
      parameterSetVersion: '1',
      seed: 17,
    })
    const bundle = createExperimentBundle({
      originCheckpoint: new SimulationEngine(identity).snapshot().checkpoint,
      commands: [],
    })
    const mutated = structuredClone(bundle) as unknown as {
      counterfactualAncestry: unknown
    }
    mutated.counterfactualAncestry = { sourceRunId: 'forged' }

    expect(() =>
      validateExperimentBundle(mutated as never),
    ).toThrowError(
      expect.objectContaining({
        code: 'counterfactual-ancestry-unsupported',
      }),
    )
  })

  it('rejects unknown versionless payload fields instead of ignoring them', () => {
    const identity = createRunIdentity({
      scenarioId: 'synthetic-export-fixture',
      scenarioVersion: '1',
      parameterSetId: 'none',
      parameterSetVersion: '1',
      seed: 17,
    })
    const bundle = createExperimentBundle({
      originCheckpoint: new SimulationEngine(identity).snapshot().checkpoint,
      commands: [],
    })

    const extraTopLevel = structuredClone(bundle) as unknown as Record<
      string,
      unknown
    >
    extraTopLevel.rendererSnapshot = { decorative: true }
    expect(() =>
      validateExperimentBundle(extraTopLevel as never),
    ).toThrowError(
      expect.objectContaining({
        code: 'unsupported-schema',
      }),
    )

    const extraCommand = structuredClone(bundle) as unknown as {
      replay: { commands: Array<Record<string, unknown>> }
    }
    extraCommand.replay.commands.push({
      id: 'advance-with-renderer-data',
      type: 'advance',
      ticks: 1,
      rendererFrame: 42,
    })
    expect(() =>
      validateExperimentBundle(extraCommand as never),
    ).toThrowError(
      expect.objectContaining({
        code: 'command-invalid',
      }),
    )
  })

  it('returns explicit malformed-json errors on import', () => {
    expect(() => parseExperimentBundle('{not-json')).toThrowError(
      expect.objectContaining<Partial<ExperimentBundleError>>({
        code: 'malformed-json',
      }),
    )
  })
})
