import { describe, expect, it } from 'vitest'
import {
  ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION,
  DEFAULT_ADVANCE_EXECUTION_POLICY,
} from '../../src/sim/advanceExecutionPolicy'
import {
  ComposedSimulationEngine,
} from '../../src/sim/composedEngine'
import {
  composedConfigurationFingerprint,
  createComposedState,
  stepComposedState,
  type ComposedCiprofloxacinConfig,
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import {
  COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  createFixtureComposedParameterSetBinding,
} from '../../src/sim/parameterSetBinding'
import { createRunIdentity } from '../../src/sim/protocol'
import { SimulationRng } from '../../src/sim/rng'
import {
  BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
  EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
} from '../../src/sim/evolution/baselineLossPolicy'
import {
  CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
  FRACTIONAL_CARRY_POPULATION_POLICY,
} from '../../src/sim/populationAuthority'
import { SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION } from '../../src/sim/samplingPolicy'
import { MUTATION_EXECUTION_POLICY_SCHEMA_VERSION } from '../../src/sim/mutationExecutionPolicy'
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
} from '../../src/sim/taxonIdentity'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'composed-worker-fixture',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'VAR', relativeFitness: 0.9, sourceOrder: 1 },
  ],
  transitions: [],
}

const parameterSetId = 'fixture:explicit-test-config'
const parameterSetVersion = '1'

const config: ComposedSimulationConfig = {
  width: 2,
  height: 1,
  mask: [1, 1],
  initialResource: [8, 8],
  ciprofloxacinConcentrationMgPerL: [0, 0],
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
    scenarioId: 'composed-worker-fixture',
    scenarioVersion: '1',
  },
  ciprofloxacin: null,
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'variant', genotypeId: 'VAR', deathHazardPerHour: 0.1 },
  ],
  samplingExecutionPolicy: null,
  dynamicLineageLossPolicy: null,
  populationAuthority: null,
  hoursPerTick: 0.01,
}

const ciprofloxacinAuthority: ComposedCiprofloxacinConfig = {
  policyId: 'reference_pd_decrement_as_first_order_loss_v1',
  concentrationUnit: 'mg/L',
  referencePharmacodynamics: {
    psiMaxLog10PerHour: 0.88,
    psiMinLog10PerHour: -6.5,
    zMic: 0.017,
    kappa: 1.1,
  },
  referenceMicMgPerL: 0.03,
  genotypeMicMgPerL: [
    { genotypeId: 'WT', micMgPerL: 0.016 },
    { genotypeId: 'VAR', micMgPerL: 0.38 },
  ],
}

const drugConfig: ComposedSimulationConfig = {
  ...config,
  ciprofloxacin: ciprofloxacinAuthority,
}

const drugParameterSetId = 'fixture:explicit-ciprofloxacin-test-config'
const drugIdentity = createRunIdentity({
  scenarioId: evolutionGraph.scenarioId,
  scenarioVersion: evolutionGraph.scenarioVersion,
  parameterSetId: drugParameterSetId,
  parameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    drugParameterSetId,
    parameterSetVersion,
    drugConfig,
  ),
  seed: 0x5eed1234,
})

const drugIntervention = {
  schemaVersion: 1,
  concentrationMgPerL: 0.5,
  concentrationUnit: 'mg/L',
  blendMode: 'set',
  geometry: { kind: 'global' },
} as const

const identity = createRunIdentity({
  scenarioId: 'composed-worker-fixture',
  scenarioVersion: '1',
  parameterSetId,
  parameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    parameterSetId,
    parameterSetVersion,
    config,
  ),
  seed: 0x5eed1234,
})

const mutationEvolutionGraph: CuratedMutationGraph = {
  scenarioId: 'composed-mutation-fixture',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'MUT_A', relativeFitness: 0.95, sourceOrder: 1 },
    { id: 'MUT_B', relativeFitness: 0.9, sourceOrder: 2 },
  ],
  transitions: [
    {
      fromGenotypeId: 'WT',
      toGenotypeId: 'MUT_A',
      probabilityPerDivision: 0.5,
      mutationClass: 'fixture-a',
      citationKey: 'fixture-source',
      sourceOrder: 0,
    },
    {
      fromGenotypeId: 'WT',
      toGenotypeId: 'MUT_B',
      probabilityPerDivision: 0.5,
      mutationClass: 'fixture-b',
      citationKey: 'fixture-source',
      sourceOrder: 1,
    },
  ],
}

const mutationConfig: ComposedSimulationConfig = {
  width: 1,
  height: 1,
  mask: [1],
  initialResource: [100],
  ciprofloxacinConcentrationMgPerL: [0],
  initialLineageBiomass: [[2]],
  growth: {
    maxDivisionRate: 1,
    halfSaturation: 1,
    biomassYield: 10,
    localCapacity: 100,
    spreadRate: 0,
  },
  evolutionGraph: mutationEvolutionGraph,
  evolutionScenario: {
    scenarioId: mutationEvolutionGraph.scenarioId,
    scenarioVersion: mutationEvolutionGraph.scenarioVersion,
  },
  ciprofloxacin: null,
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
  ],
  samplingExecutionPolicy: {
    schemaVersion: SAMPLING_EXECUTION_POLICY_SCHEMA_VERSION,
    id: 'fixture-exact-mutation-sampling-v1',
    exactTrialLimit: 100,
    acceleration: 'disabled',
    maximumExpectedAcceleratedDraws: 100,
    maximumAcceleratedDraws: 100,
  },
  dynamicLineageLossPolicy: {
    schemaVersion: BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION,
    id: 'fixture-mutation-child-loss-v1',
    rule: EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE,
    entries: [
      {
        genotypeId: 'MUT_A',
        deathHazardPerHour: 0,
        provenance: {
          classification: 'engineering',
          sourceKeys: [],
          context: 'Deterministic composed mutation integration fixture.',
          limitation: 'Test-only non-drug loss authority.',
        },
      },
      {
        genotypeId: 'MUT_B',
        deathHazardPerHour: 0,
        provenance: {
          classification: 'engineering',
          sourceKeys: [],
          context: 'Deterministic composed mutation integration fixture.',
          limitation: 'Test-only non-drug loss authority.',
        },
      },
    ],
  },
  populationAuthority: {
    calibration: {
      schemaVersion: CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
      id: 'fixture-mutation-cell-scale-v1',
      modelBiomassPerCellEquivalent: 0.1,
      provenance: {
        classification: 'engineering',
        sourceKeys: [],
        limitation: 'Test-only exact cell-equivalent scale.',
      },
    },
    policy: FRACTIONAL_CARRY_POPULATION_POLICY,
  },
  hoursPerTick: 1,
}

const mutationParameterSetId = 'fixture:composed-mutation-config'
const mutationIdentity = createRunIdentity({
  scenarioId: mutationEvolutionGraph.scenarioId,
  scenarioVersion: mutationEvolutionGraph.scenarioVersion,
  parameterSetId: mutationParameterSetId,
  parameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    mutationParameterSetId,
    parameterSetVersion,
    mutationConfig,
  ),
  seed: 0x1234abcd,
})

const mutationTaxonRegistry = createAuthoritativeTaxonRegistry([
  {
    schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
    id: 'fixture-mutation-bacterium',
    contentVersion: '1.0.0',
    scientificName: 'Fixture mutation bacterium',
    background: 'test strain',
    microbialGroup: 'bacterium',
    provenance: {
      sourceKeys: ['fixture:mutation-taxon'],
      context: 'Test-only mutation taxon inheritance authority.',
      limitation: 'Not a scientific Petra content pack.',
    },
  },
])

const taxonMutationConfig: ComposedSimulationConfig = {
  ...mutationConfig,
  taxonRegistry: mutationTaxonRegistry,
  lineages: mutationConfig.lineages.map((lineage) => ({
    ...lineage,
    taxonId: 'fixture-mutation-bacterium',
    taxonContentVersion: '1.0.0',
  })),
}

const taxonMutationParameterSetId = 'fixture:composed-mutation-taxon-config'
const taxonMutationIdentity = createRunIdentity({
  scenarioId: mutationEvolutionGraph.scenarioId,
  scenarioVersion: mutationEvolutionGraph.scenarioVersion,
  parameterSetId: taxonMutationParameterSetId,
  parameterSetVersion,
  parameterSetBinding: createFixtureComposedParameterSetBinding(
    taxonMutationParameterSetId,
    parameterSetVersion,
    taxonMutationConfig,
  ),
  seed: 0x1234abcd,
})


describe('ComposedSimulationEngine', () => {
  it('requires the declared parameter set to own the exact composed config', () => {
    const unbound = createRunIdentity({
      scenarioId: 'composed-worker-fixture',
      scenarioVersion: '1',
      parameterSetId,
      parameterSetVersion,
      seed: identity.seed,
    })
    expect(() => new ComposedSimulationEngine(unbound, config)).toThrow(
      /parameter-set configuration binding/,
    )

    const wrongId = {
      ...identity,
      parameterSetId: 'fixture:other-config',
    }
    expect(() => new ComposedSimulationEngine(wrongId, config)).toThrow(
      /id does not match composed binding/,
    )

    const wrongFingerprint = structuredClone(identity)
    ;(
      wrongFingerprint.parameterSetBinding as {
        configurationFingerprint: string
      }
    ).configurationFingerprint += '-tampered'
    expect(() => new ComposedSimulationEngine(wrongFingerprint, config)).toThrow(
      /fingerprint does not match parameter-set binding/,
    )
  })

  it('preserves a provenance-owned binding in checkpoint/replay identity', () => {
    const provenanceParameterSetId = 'test-provenance-set'
    const provenanceParameterSetVersion = '1'
    const binding = {
      schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
      authority: 'provenance' as const,
      parameterSetId: provenanceParameterSetId,
      parameterSetVersion: provenanceParameterSetVersion,
      configurationFingerprint: composedConfigurationFingerprint(config),
    }
    const provenanceIdentity = createRunIdentity({
      scenarioId: 'composed-worker-fixture',
      scenarioVersion: '1',
      parameterSetId: provenanceParameterSetId,
      parameterSetVersion: provenanceParameterSetVersion,
      parameterSetBinding: binding,
      seed: identity.seed,
    })

    const engine = new ComposedSimulationEngine(provenanceIdentity, config)
    const checkpoint = engine.snapshot().checkpoint
    expect(checkpoint.identity.parameterSetBinding).toEqual(binding)

    const restored = new ComposedSimulationEngine(provenanceIdentity, config)
    restored.execute({ id: 'restore', type: 'restore', checkpoint })
    expect(restored.snapshot().checkpoint.identity.parameterSetBinding).toEqual(
      binding,
    )
  })

  it('advances real composed ecology instead of synthetic fixture state', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    const initial = engine.snapshot().checkpoint

    expect(initial.authority).toBe('composed')
    expect(initial.metrics.totalBiomass).toBe(3)
    expect(initial.metrics.totalResource).toBe(16)
    expect(initial.composedState.lineageIds).toEqual(['L1', 'L2'])
    expect(initial.composedState.genotypeIds).toEqual(['WT', 'VAR'])
    expect('syntheticPopulation' in initial).toBe(false)

    const advanced = engine.execute({
      id: 'advance-25',
      type: 'advance',
      ticks: 25,
    }).checkpoint

    expect(advanced.tick).toBe(25)
    expect(advanced.simulationTimeHours).toBeCloseTo(0.25)
    expect(advanced.metrics.totalBiomass).toBeGreaterThan(3)
    expect(advanced.metrics.totalResource).toBeLessThan(16)
  })

  it('checkpoints seed-derived composed RNG authority without deterministic ecology consuming it', () => {
    const expectedInitialRng = new SimulationRng(identity.seed).snapshot()
    const engine = new ComposedSimulationEngine(identity, config)

    expect(engine.snapshot().checkpoint.rngState).toEqual(expectedInitialRng)

    const advanced = engine.execute({
      id: 'rng-stable-advance',
      type: 'advance',
      ticks: 3,
    })
    expect(advanced.checkpoint.rngState).toEqual(expectedInitialRng)

    const restored = new ComposedSimulationEngine(identity, config)
    restored.execute({
      id: 'restore-rng-authority',
      type: 'restore',
      checkpoint: advanced.checkpoint,
    })
    expect(restored.snapshot().checkpoint.rngState).toEqual(expectedInitialRng)
  })

  it('refuses malformed composed RNG checkpoints atomically', () => {
    const source = new ComposedSimulationEngine(identity, config)
    source.execute({ id: 'advance-before-rng-corruption', type: 'advance', ticks: 2 })
    const checkpoint = source.snapshot().checkpoint
    ;(checkpoint.rngState as unknown as number[]).splice(0, 4, 0, 0, 0, 0)

    const target = new ComposedSimulationEngine(identity, config)
    const before = target.snapshot()
    expect(() =>
      target.execute({
        id: 'restore-bad-composed-rng',
        type: 'restore',
        checkpoint,
      }),
    ).toThrow(/RNG state/)
    expect(target.snapshot()).toEqual(before)
  })

  it('materializes mutation children conservatively and replays them exactly', () => {
    const initialRng = new SimulationRng(mutationIdentity.seed).snapshot()
    const first = new ComposedSimulationEngine(
      mutationIdentity,
      mutationConfig,
    )
    const second = new ComposedSimulationEngine(
      mutationIdentity,
      mutationConfig,
    )

    const firstStep = first.execute({
      id: 'mutate-one',
      type: 'advance',
      ticks: 1,
    })
    const secondStep = second.execute({
      id: 'mutate-one',
      type: 'advance',
      ticks: 1,
    })

    expect(firstStep).toEqual(secondStep)
    expect(firstStep.checkpoint.composedState.lineageIds[0]).toBe('L1')
    expect(firstStep.checkpoint.composedState.lineageIds.length).toBeGreaterThan(1)
    expect(
      firstStep.checkpoint.composedState.lineageRegistry.records,
    ).toHaveLength(firstStep.checkpoint.composedState.lineageIds.length)
    expect(
      firstStep.checkpoint.composedState.genotypeIds.slice(1).every(
        (genotypeId) => genotypeId === 'MUT_A' || genotypeId === 'MUT_B',
      ),
    ).toBe(true)
    expect(firstStep.checkpoint.rngState).not.toEqual(initialRng)
    expect(firstStep.ecologyObservation?.observation.lineageIds).toEqual(
      firstStep.checkpoint.composedState.lineageIds,
    )

    const totalFromLineages = Object.values(
      firstStep.checkpoint.metrics.lineageBiomass,
    ).reduce((sum, value) => sum + value, 0)
    expect(totalFromLineages).toBeCloseTo(
      firstStep.checkpoint.metrics.totalBiomass,
    )

    const checkpoint = firstStep.checkpoint
    const continued = first.execute({
      id: 'mutate-two',
      type: 'advance',
      ticks: 1,
    })
    const restored = new ComposedSimulationEngine(
      mutationIdentity,
      mutationConfig,
    )
    restored.execute({
      id: 'restore-mutation',
      type: 'restore',
      checkpoint,
    })
    const replayed = restored.execute({
      id: 'mutate-two',
      type: 'advance',
      ticks: 1,
    })
    expect(replayed.checkpoint).toEqual(continued.checkpoint)
  })

  it('inherits exact parent taxon authority onto mutation-created child lineages', () => {
    const engine = new ComposedSimulationEngine(
      taxonMutationIdentity,
      taxonMutationConfig,
    )
    const advanced = engine.execute({
      id: 'mutate-with-taxon',
      type: 'advance',
      ticks: 1,
    })
    const state = advanced.checkpoint.composedState

    expect(state.lineageIds.length).toBeGreaterThan(1)
    expect(state.lineageTaxonMap?.lineageIds).toEqual(state.lineageIds)
    expect(
      state.lineageTaxonMap?.taxonIds.every(
        (taxonId) => taxonId === 'fixture-mutation-bacterium',
      ),
    ).toBe(true)
    expect(
      state.lineageTaxonMap?.taxonContentVersions.every(
        (version) => version === '1.0.0',
      ),
    ).toBe(true)
  })

  it('rolls state and RNG back when mutation materialization exceeds runtime work policy', () => {
    const engine = new ComposedSimulationEngine(
      mutationIdentity,
      mutationConfig,
      DEFAULT_ADVANCE_EXECUTION_POLICY,
      {
        schemaVersion: MUTATION_EXECUTION_POLICY_SCHEMA_VERSION,
        id: 'fixture-one-child-per-tick',
        maximumMaterializedChildrenPerTick: 1,
      },
    )
    const before = engine.snapshot()

    expect(() =>
      engine.execute({
        id: 'over-budget-mutation',
        type: 'advance',
        ticks: 1,
      }),
    ).toThrow(/materialization work ceiling/)
    expect(engine.snapshot()).toEqual(before)
  })

  it('applies authoritative ciprofloxacin without advancing biological time', () => {
    const baseline = new ComposedSimulationEngine(drugIdentity, drugConfig)
    const treated = new ComposedSimulationEngine(drugIdentity, drugConfig)

    const applied = treated.execute({
      id: 'dose-global',
      type: 'apply-ciprofloxacin',
      intervention: drugIntervention,
    })

    expect(applied.checkpoint.tick).toBe(0)
    expect(applied.checkpoint.simulationTimeHours).toBe(0)
    expect(applied.checkpoint.commandCount).toBe(1)
    expect(applied.checkpoint.composedState.ciprofloxacinConcentrationMgPerL).toEqual([
      0.5,
      0.5,
    ])
    expect(applied.events.at(-1)).toMatchObject({
      type: 'ciprofloxacin-applied',
      commandId: 'dose-global',
      intervention: drugIntervention,
    })

    const baselineAdvanced = baseline.execute({
      id: 'advance',
      type: 'advance',
      ticks: 1,
    })
    const treatedAdvanced = treated.execute({
      id: 'advance',
      type: 'advance',
      ticks: 1,
    })
    expect(treatedAdvanced.checkpoint.metrics.deathBiomass).toBeGreaterThan(
      baselineAdvanced.checkpoint.metrics.deathBiomass,
    )
  })

  it('deep-copies nested ciprofloxacin event payloads out of engine authority', () => {
    const engine = new ComposedSimulationEngine(drugIdentity, drugConfig)
    engine.execute({
      id: 'dose-global',
      type: 'apply-ciprofloxacin',
      intervention: drugIntervention,
    })
    const exported = engine.snapshot()
    const event = exported.events.at(-1)
    if (event?.type !== 'ciprofloxacin-applied' || event.intervention === undefined) {
      throw new Error('expected ciprofloxacin-applied event')
    }
    ;(
      event.intervention as unknown as { concentrationMgPerL: number }
    ).concentrationMgPerL = 999

    expect(engine.snapshot().events.at(-1)).toMatchObject({
      type: 'ciprofloxacin-applied',
      intervention: { concentrationMgPerL: 0.5 },
    })
  })

  it('restores and replays mutable ciprofloxacin checkpoint state exactly', () => {
    const original = new ComposedSimulationEngine(drugIdentity, drugConfig)
    original.execute({
      id: 'dose-global',
      type: 'apply-ciprofloxacin',
      intervention: drugIntervention,
    })
    const checkpoint = original.snapshot().checkpoint
    original.execute({ id: 'advance-after-dose', type: 'advance', ticks: 3 })
    const expected = original.snapshot().checkpoint

    const restored = new ComposedSimulationEngine(drugIdentity, drugConfig)
    restored.execute({ id: 'restore-dose', type: 'restore', checkpoint })
    restored.execute({ id: 'advance-after-dose', type: 'advance', ticks: 3 })

    expect(restored.snapshot().checkpoint).toEqual(expected)
  })

  it('refuses malformed or unsupported ciprofloxacin commands atomically', () => {
    const engine = new ComposedSimulationEngine(drugIdentity, drugConfig)
    const before = engine.snapshot()

    expect(() =>
      engine.execute({
        id: 'invalid-dose',
        type: 'apply-ciprofloxacin',
        intervention: {
          ...drugIntervention,
          geometry: {
            kind: 'radial',
            center: { x: 0.5, y: 0.5 },
            radiusFraction: 0,
          },
        },
      }),
    ).toThrow(/radiusFraction/)
    expect(engine.snapshot()).toEqual(before)

    const noAuthority = new ComposedSimulationEngine(identity, config)
    const beforeNoAuthority = noAuthority.snapshot()
    expect(() =>
      noAuthority.execute({
        id: 'unsupported-dose',
        type: 'apply-ciprofloxacin',
        intervention: drugIntervention,
      }),
    ).toThrow(/requires explicit pharmacodynamic authority/)
    expect(noAuthority.snapshot()).toEqual(beforeNoAuthority)
  })

  it('replays deterministically for identical identity, config, and commands', () => {
    const first = new ComposedSimulationEngine(identity, config)
    const second = new ComposedSimulationEngine(identity, config)
    const commands = [
      { id: 'a', type: 'advance' as const, ticks: 12 },
      { id: 'b', type: 'advance' as const, ticks: 7 },
    ]

    for (const command of commands) {
      first.execute(command)
      second.execute(command)
    }

    expect(first.snapshot()).toEqual(second.snapshot())
  })

  it('restores exact composed state including genotype channel identity', () => {
    const original = new ComposedSimulationEngine(identity, config)
    original.execute({ id: 'warmup', type: 'advance', ticks: 10 })
    const checkpoint = original.snapshot().checkpoint

    original.execute({ id: 'future', type: 'advance', ticks: 5 })
    const expected = original.snapshot().checkpoint

    const restored = new ComposedSimulationEngine(identity, config)
    restored.execute({ id: 'restore', type: 'restore', checkpoint })
    restored.execute({ id: 'future', type: 'advance', ticks: 5 })

    expect(restored.snapshot().checkpoint).toEqual(expected)
  })

  it('refuses stale protocol checkpoints atomically before composed restore', () => {
    const source = new ComposedSimulationEngine(identity, config)
    source.execute({ id: 'warmup', type: 'advance', ticks: 3 })
    const checkpoint = source.snapshot().checkpoint
    ;(
      checkpoint.identity as unknown as { protocolVersion: number }
    ).protocolVersion -= 1

    const target = new ComposedSimulationEngine(identity, config)
    const before = target.snapshot()

    expect(() =>
      target.execute({
        id: 'restore-old-protocol',
        type: 'restore',
        checkpoint,
      }),
    ).toThrow(/protocol version .* is unsupported.*No migration is registered/i)
    expect(target.snapshot()).toEqual(before)
  })

  it('deep-copies transport state and metrics', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    const exported = engine.snapshot()

    exported.checkpoint.composedState.resource[0] = 999
    exported.checkpoint.composedState.ciprofloxacinConcentrationMgPerL[0] = 999
    exported.checkpoint.composedState.genotypeIds[0] = 'CORRUPT'
    ;(
      exported.checkpoint.metrics.lineageBiomass as Record<string, number>
    ).L1 = 999

    const fresh = engine.snapshot().checkpoint
    expect(fresh.composedState.resource[0]).toBe(8)
    expect(fresh.composedState.ciprofloxacinConcentrationMgPerL[0]).toBe(0)
    expect(fresh.composedState.genotypeIds[0]).toBe('WT')
    expect(fresh.metrics.lineageBiomass.L1).toBe(1)
  })

  it('uses one scientific-state validator for direct continuation and restore', () => {
    const directState = createComposedState(config)
    directState.mask[0] = 2

    let directError = ''
    try {
      stepComposedState(directState, config)
    } catch (error) {
      directError = error instanceof Error ? error.message : String(error)
    }

    expect(directError).toMatch(/mask values must be exactly 0 or 1/)

    const source = new ComposedSimulationEngine(identity, config)
    const checkpoint = source.snapshot().checkpoint
    checkpoint.composedState.mask[0] = 2

    const target = new ComposedSimulationEngine(identity, config)
    const before = target.snapshot()
    expect(() =>
      target.execute({
        id: 'restore-shared-validator',
        type: 'restore',
        checkpoint,
      }),
    ).toThrow(directError)
    expect(target.snapshot()).toEqual(before)
  })

  it('rejects config, genotype, and metric checkpoint corruption', () => {
    const source = new ComposedSimulationEngine(identity, config)
    source.execute({ id: 'advance', type: 'advance', ticks: 2 })
    const checkpoint = source.snapshot().checkpoint

    const changedConfig: ComposedSimulationConfig = {
      ...config,
      growth: { ...config.growth, maxDivisionRate: 0.81 },
    }
    expect(() =>
      new ComposedSimulationEngine(identity, changedConfig).execute({
        id: 'restore-config',
        type: 'restore',
        checkpoint,
      }),
    ).toThrow(/fingerprint mismatch/)

    const genotypeCorrupt = structuredClone(checkpoint)
    genotypeCorrupt.composedState.genotypeIds[0] = 'VAR'
    expect(() =>
      new ComposedSimulationEngine(identity, config).execute({
        id: 'restore-genotype',
        type: 'restore',
        checkpoint: genotypeCorrupt,
      }),
    ).toThrow(/genotype order/)

    const metricCorrupt = structuredClone(checkpoint)
    ;(metricCorrupt.metrics as { totalBiomass: number }).totalBiomass += 1
    expect(() =>
      new ComposedSimulationEngine(identity, config).execute({
        id: 'restore-metric',
        type: 'restore',
        checkpoint: metricCorrupt,
      }),
    ).toThrow(/metrics do not match/)
  })

  it('rejects an over-capacity composed checkpoint atomically at restore', () => {
    const source = new ComposedSimulationEngine(identity, config)
    const checkpoint = source.snapshot().checkpoint
    checkpoint.composedState.lineageBiomass[0]![0] = 15
    checkpoint.composedState.lineageBiomass[1]![0] = 10

    const target = new ComposedSimulationEngine(identity, config)
    const before = target.snapshot()

    expect(() =>
      target.execute({
        id: 'restore-over-capacity',
        type: 'restore',
        checkpoint,
      }),
    ).toThrow(/ecology biomass exceeds localCapacity/)

    expect(target.snapshot()).toEqual(before)
  })

  it('keeps synthetic fixture commands out of biological authority', () => {
    expect(
      () =>
        new ComposedSimulationEngine(
          { ...identity, scenarioId: 'other' },
          config,
        ),
    ).toThrow(/run identity scenario/)

    const engine = new ComposedSimulationEngine(identity, config)
    expect(() =>
      engine.execute({
        id: 'pulse',
        type: 'synthetic-pulse',
        magnitude: 10,
      }),
    ).toThrow(/not available in composed authority/)
  })
  it('refuses over-budget composed work before cloning or advancing authority', () => {
    const engine = new ComposedSimulationEngine(identity, config, {
      schemaVersion: ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION,
      id: 'composed-test-one-tick-cap',
      maximumTicksPerAdvance: 1,
    })
    const before = engine.snapshot()

    expect(() =>
      engine.execute({
        id: 'over-budget-composed',
        type: 'advance',
        ticks: 2,
      }),
    ).toThrow(/execution policy cap 1/)
    expect(engine.snapshot()).toEqual(before)

    const accepted = engine.execute({
      id: 'within-budget-composed',
      type: 'advance',
      ticks: 1,
    })
    expect(accepted.checkpoint.tick).toBe(1)
    expect(accepted.checkpoint.commandCount).toBe(1)
  })

  it('refuses a non-representable accepted simulation time before mutating live authority', () => {
    const extremeTimeConfig: ComposedSimulationConfig = {
      ...config,
      growth: {
        ...config.growth,
        maxDivisionRate: 0,
      },
      lineages: config.lineages.map((lineage) => ({
        ...lineage,
        deathHazardPerHour: 0,
      })),
      hoursPerTick: Number.MAX_VALUE,
    }
    const extremeParameterSetId = 'fixture:extreme-time-atomicity'
    const extremeIdentity = createRunIdentity({
      scenarioId: evolutionGraph.scenarioId,
      scenarioVersion: evolutionGraph.scenarioVersion,
      parameterSetId: extremeParameterSetId,
      parameterSetVersion,
      parameterSetBinding: createFixtureComposedParameterSetBinding(
        extremeParameterSetId,
        parameterSetVersion,
        extremeTimeConfig,
      ),
      seed: identity.seed,
    })
    const engine = new ComposedSimulationEngine(
      extremeIdentity,
      extremeTimeConfig,
    )

    const first = engine.execute({
      id: 'extreme-time-first',
      type: 'advance',
      ticks: 1,
    })
    expect(first.checkpoint.tick).toBe(1)
    expect(first.checkpoint.simulationTimeHours).toBe(Number.MAX_VALUE)
    const before = engine.snapshot()

    expect(() =>
      engine.execute({
        id: 'extreme-time-overflow',
        type: 'advance',
        ticks: 1,
      }),
    ).toThrow(/simulation time became invalid/)
    expect(engine.snapshot()).toEqual(before)
  })

  it('publishes only the final accepted ecology step observation on advance snapshots', () => {
    const engine = new ComposedSimulationEngine(identity, config)
    const advanced = engine.execute({ id: 'observe-advance', type: 'advance', ticks: 2 })

    expect(advanced.ecologyObservation).toBeDefined()
    expect(advanced.ecologyObservation?.position.tick).toBe(2)
    expect(advanced.ecologyObservation?.position.commandCount).toBe(1)
    expect(advanced.ecologyObservation?.position.simulationTimeHours).toBe(
      advanced.checkpoint.simulationTimeHours,
    )
    expect(advanced.ecologyObservation?.observation.stepDuration).toBe(
      config.hoursPerTick,
    )
    expect(advanced.ecologyObservation?.intervalEndSimulationTimeHours).toBe(
      advanced.checkpoint.simulationTimeHours,
    )
    expect(advanced.ecologyObservation?.intervalStartSimulationTimeHours).toBe(
      advanced.checkpoint.simulationTimeHours - config.hoursPerTick,
    )

    expect(engine.snapshot().ecologyObservation).toBeUndefined()
    expect(
      engine.execute({ id: 'observe-snapshot', type: 'snapshot' })
        .ecologyObservation,
    ).toBeUndefined()
    expect(
      engine.execute({ id: 'observe-zero', type: 'advance', ticks: 0 })
        .ecologyObservation,
    ).toBeUndefined()
  })

  it('does not leak a prior ecology observation onto intervention or restore snapshots', () => {
    const engine = new ComposedSimulationEngine(drugIdentity, drugConfig)
    engine.execute({ id: 'observed-step', type: 'advance', ticks: 1 })

    const intervention = engine.execute({
      id: 'dose-after-observation',
      type: 'apply-ciprofloxacin',
      intervention: drugIntervention,
    })
    expect(intervention.ecologyObservation).toBeUndefined()

    const checkpoint = intervention.checkpoint
    const restored = engine.execute({
      id: 'restore-after-observation',
      type: 'restore',
      checkpoint,
    })
    expect(restored.ecologyObservation).toBeUndefined()
  })

})
