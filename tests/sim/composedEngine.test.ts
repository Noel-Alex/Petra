import { describe, expect, it } from 'vitest'
import { ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION } from '../../src/sim/advanceExecutionPolicy'
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
    expect(initial.composedState.lineageIds).toEqual(['ancestor', 'variant'])
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
    ).ancestor = 999

    const fresh = engine.snapshot().checkpoint
    expect(fresh.composedState.resource[0]).toBe(8)
    expect(fresh.composedState.ciprofloxacinConcentrationMgPerL[0]).toBe(0)
    expect(fresh.composedState.genotypeIds[0]).toBe('WT')
    expect(fresh.metrics.lineageBiomass.ancestor).toBe(1)
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

})
