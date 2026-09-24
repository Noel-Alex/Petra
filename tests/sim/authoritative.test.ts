import { describe, expect, it } from 'vitest'
import {
  cloneComposedState,
  composedConfigurationFingerprint,
  createComposedState,
  stepComposedState,
  type ComposedCiprofloxacinConfig,
  type ComposedSimulationConfig,
} from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import type { SamplingExecutionPolicy } from '../../src/sim/samplingPolicy'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'test-scenario',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'VAR', relativeFitness: 0.9, sourceOrder: 1 },
    { id: 'ISO', relativeFitness: 1, sourceOrder: 2 },
  ],
  transitions: [],
}

const acceleratedSamplingPolicy: SamplingExecutionPolicy = {
  schemaVersion: 1,
  id: 'test-sampling-policy',
  exactTrialLimit: 1000,
  acceleration: 'exact-sparse-binomial-v1',
  maximumExpectedAcceleratedDraws: 10000,
  maximumAcceleratedDraws: 20000,
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
  evolutionScenario: { scenarioId: 'test-scenario', scenarioVersion: '1' },
  ciprofloxacin: null,
  samplingExecutionPolicy: null,
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'variant', genotypeId: 'VAR', deathHazardPerHour: 0.1 },
  ],
  hoursPerTick: 0.01,
}

describe('authoritative composed state', () => {
  const maskedConfig: ComposedSimulationConfig = {
    ...config,
    mask: [1, 0],
    initialResource: [8, 0],
    initialLineageBiomass: [[1, 0], [2, 0]],
  }

  it('is deterministic for identical explicit configuration and starting state', () => {
    const first = createComposedState(config)
    const second = createComposedState(config)
    const firstMetrics = Array.from({ length: 50 }, () =>
      stepComposedState(first, config),
    ).at(-1)
    const secondMetrics = Array.from({ length: 50 }, () =>
      stepComposedState(second, config),
    ).at(-1)

    expect(first).toEqual(second)
    expect(firstMetrics).toEqual(secondMetrics)
    expect(firstMetrics!.totalBiomass).toBeGreaterThan(3)
    expect(firstMetrics!.totalResource).toBeLessThan(16)
  })

  it('clones checkpoint state without sharing mutable arrays', () => {
    const original = createComposedState(config)
    stepComposedState(original, config)
    const checkpoint = cloneComposedState(original)
    const branch = cloneComposedState(checkpoint)
    stepComposedState(branch, config)

    expect(branch).not.toEqual(checkpoint)
    expect(original).toEqual(checkpoint)
    expect(branch.resource).not.toBe(checkpoint.resource)
    expect(branch.ciprofloxacinConcentrationMgPerL).not.toBe(
      checkpoint.ciprofloxacinConcentrationMgPerL,
    )
    expect(branch.lineageIds).not.toBe(checkpoint.lineageIds)
    expect(branch.genotypeIds).not.toBe(checkpoint.genotypeIds)
    expect(branch.lineageBiomass[0]).not.toBe(checkpoint.lineageBiomass[0])
  })

  it('binds positional lineage/genotype channels and mechanism config to one fingerprint', () => {
    const state = createComposedState(config)
    expect(state.configurationFingerprint).toBe(
      composedConfigurationFingerprint(config),
    )
    expect(state.genotypeIds).toEqual(['WT', 'VAR'])

    expect(() =>
      stepComposedState(state, {
        ...config,
        lineages: [config.lineages[1]!, config.lineages[0]!],
      }),
    ).toThrow(/fingerprint mismatch/)

    expect(() =>
      stepComposedState(state, {
        ...config,
        growth: { ...config.growth, maxDivisionRate: 0.81 },
      }),
    ).toThrow(/fingerprint mismatch/)
  })

  it('stores mutable ciprofloxacin checkpoint concentration canonically as Float32', () => {
    const floatConfig: ComposedSimulationConfig = {
      ...config,
      ciprofloxacin: ciprofloxacinAuthority,
      ciprofloxacinConcentrationMgPerL: [0.1, 0],
    }
    const state = createComposedState(floatConfig)

    expect(state.ciprofloxacinConcentrationMgPerL[0]).toBe(Math.fround(0.1))

    state.ciprofloxacinConcentrationMgPerL[0] = 0.1
    expect(() => stepComposedState(state, floatConfig)).toThrow(
      /canonical Float32/,
    )
  })

  it('binds the initial ciprofloxacin landscape into replay identity and ecology loss', () => {
    const baselineState = createComposedState(config)
    const baselineMetrics = stepComposedState(baselineState, config)

    const drugConfig: ComposedSimulationConfig = {
      ...config,
      ciprofloxacinConcentrationMgPerL: [0.5, 0.5],
      ciprofloxacin: ciprofloxacinAuthority,
    }
    const drugState = createComposedState(drugConfig)
    const drugMetrics = stepComposedState(drugState, drugConfig)

    expect(composedConfigurationFingerprint(drugConfig)).not.toBe(
      composedConfigurationFingerprint(config),
    )
    expect(drugMetrics.deathBiomass).toBeGreaterThan(
      baselineMetrics.deathBiomass,
    )
    expect(drugState.lineageBiomass[0]![0]).toBeLessThan(
      baselineState.lineageBiomass[0]![0]!,
    )
  })

  it('requires explicit source-backed ciprofloxacin authority for non-zero exposure', () => {
    expect(() =>
      createComposedState({
        ...config,
        ciprofloxacinConcentrationMgPerL: [0.5, 0],
      }),
    ).toThrow(/requires explicit PD authority/)

    expect(() =>
      createComposedState({
        ...config,
        ciprofloxacin: {
          ...ciprofloxacinAuthority,
          genotypeMicMgPerL: [
            { genotypeId: 'WT', micMgPerL: 0.016 },
          ],
        },
      }),
    ).toThrow(/missing active genotype VAR/)

    const missingAuthority = {
      ...config,
    } as Partial<ComposedSimulationConfig>
    delete missingAuthority.ciprofloxacin
    expect(() =>
      createComposedState(missingAuthority as ComposedSimulationConfig),
    ).toThrow(/ciprofloxacin authority must be explicit null/)
  })

  it('binds sampling execution policy identity into composed replay configuration', () => {
    const nullFingerprint = composedConfigurationFingerprint(config)
    expect(JSON.parse(nullFingerprint).samplingExecutionPolicy).toBeNull()

    const withPolicy: ComposedSimulationConfig = {
      ...config,
      samplingExecutionPolicy: acceleratedSamplingPolicy,
    }
    const equivalentPolicy: ComposedSimulationConfig = {
      ...withPolicy,
      samplingExecutionPolicy: { ...acceleratedSamplingPolicy },
    }
    expect(composedConfigurationFingerprint(equivalentPolicy)).toBe(
      composedConfigurationFingerprint(withPolicy),
    )
    expect(composedConfigurationFingerprint(withPolicy)).not.toBe(
      nullFingerprint,
    )

    const state = createComposedState(withPolicy)
    const reassigned: ComposedSimulationConfig = {
      ...withPolicy,
      samplingExecutionPolicy: {
        ...acceleratedSamplingPolicy,
        maximumAcceleratedDraws:
          acceleratedSamplingPolicy.maximumAcceleratedDraws + 1,
      },
    }
    expect(composedConfigurationFingerprint(reassigned)).not.toBe(
      state.configurationFingerprint,
    )
    expect(() => stepComposedState(state, reassigned)).toThrow(
      /fingerprint mismatch/,
    )
  })

  it('requires an explicit valid sampling execution policy or null', () => {
    expect(() =>
      createComposedState({
        ...config,
        samplingExecutionPolicy: {
          ...acceleratedSamplingPolicy,
          exactTrialLimit: -1,
        },
      }),
    ).toThrow(/exactTrialLimit/)

    const missing = { ...config } as Partial<ComposedSimulationConfig>
    delete missing.samplingExecutionPolicy
    expect(() =>
      createComposedState(missing as ComposedSimulationConfig),
    ).toThrow(/sampling execution policy must be explicit null/)
  })

  it('rejects genotype reassignment even when numerical fitness is identical', () => {
    const state = createComposedState(config)
    const reassigned: ComposedSimulationConfig = {
      ...config,
      lineages: [
        { ...config.lineages[0]!, genotypeId: 'ISO' },
        config.lineages[1]!,
      ],
    }

    expect(evolutionGraph.genotypes[0]!.relativeFitness).toBe(
      evolutionGraph.genotypes[2]!.relativeFitness,
    )
    expect(composedConfigurationFingerprint(reassigned)).not.toBe(
      state.configurationFingerprint,
    )
    expect(() => stepComposedState(state, reassigned)).toThrow(
      /fingerprint mismatch/,
    )
  })

  it('rejects serialized genotype channel drift independently of biomass order', () => {
    const state = createComposedState(config)
    state.genotypeIds[0] = 'ISO'

    expect(() => stepComposedState(state, config)).toThrow(/genotype order/)
  })

  it('sources relative fitness from the curated genotype graph', () => {
    const baseline = createComposedState(config)
    const alteredGraph: CuratedMutationGraph = {
      ...evolutionGraph,
      genotypes: evolutionGraph.genotypes.map((genotype) =>
        genotype.id === 'VAR' ? { ...genotype, relativeFitness: 0.5 } : genotype,
      ),
    }
    const alteredConfig = { ...config, evolutionGraph: alteredGraph }

    expect(composedConfigurationFingerprint(alteredConfig)).not.toBe(
      baseline.configurationFingerprint,
    )
    expect(() => stepComposedState(baseline, alteredConfig)).toThrow(
      /fingerprint mismatch/,
    )
  })

  it('rejects hidden or malformed scenario authority instead of inventing defaults', () => {
    expect(() => createComposedState({ ...config, hoursPerTick: 0 })).toThrow(
      /hoursPerTick/,
    )
    expect(() =>
      createComposedState({ ...config, initialResource: [8] }),
    ).toThrow(/grid dimensions/)
    expect(() =>
      createComposedState({
        ...config,
        lineages: [config.lineages[0]!, config.lineages[0]!],
      }),
    ).toThrow(/duplicate active lineage|unique/)
    expect(() =>
      createComposedState({ ...config, mask: [1, 2] }),
    ).toThrow(/exactly 0 or 1/)
    expect(() =>
      createComposedState({
        ...config,
        lineages: [
          { ...config.lineages[0]!, id: ' ' },
          config.lineages[1]!,
        ],
      }),
    ).toThrow(/non-empty|canonical/)
    expect(() =>
      createComposedState({
        ...config,
        lineages: [
          { ...config.lineages[0]!, genotypeId: 'unknown' },
          config.lineages[1]!,
        ],
      }),
    ).toThrow(/unknown genotype/)
    expect(() =>
      createComposedState({
        ...config,
        evolutionScenario: { scenarioId: 'other', scenarioVersion: '1' },
      }),
    ).toThrow(/scenario mismatch/)
  })

  it('rejects non-canonical replay identities before fitness binding or fingerprinting', () => {
    expect(() =>
      createComposedState({
        ...config,
        lineages: [
          { ...config.lineages[0]!, id: ' ancestor ' },
          config.lineages[1]!,
        ],
      }),
    ).toThrow(/lineage id.*canonical/)
    expect(() =>
      createComposedState({
        ...config,
        lineages: [
          { ...config.lineages[0]!, genotypeId: ' WT ' },
          config.lineages[1]!,
        ],
      }),
    ).toThrow(/genotype id.*canonical/)
    expect(() =>
      createComposedState({
        ...config,
        evolutionScenario: {
          scenarioId: ' test-scenario ',
          scenarioVersion: '1',
        },
      }),
    ).toThrow(/scenario id.*canonical/)
    expect(() =>
      createComposedState({
        ...config,
        evolutionScenario: {
          scenarioId: 'test-scenario',
          scenarioVersion: ' 1 ',
        },
      }),
    ).toThrow(/scenario version.*canonical/)
  })

  it('rejects malformed serialized identity with explicit validation errors', () => {
    const malformedValue = createComposedState(config)
    ;(malformedValue.genotypeIds as unknown[])[0] = 7
    expect(() => stepComposedState(malformedValue, config)).toThrow(
      /composed state genotype id.*non-empty string/,
    )

    const malformedContainer = createComposedState(config)
    ;(
      malformedContainer as unknown as {
        genotypeIds: unknown
      }
    ).genotypeIds = 'WT'
    expect(() => stepComposedState(malformedContainer, config)).toThrow(
      /identity channels must be arrays/,
    )
  })

  it('rejects non-zero initial ecology state outside the dish mask', () => {
    expect(() =>
      createComposedState({
        ...maskedConfig,
        initialResource: [8, 9],
      }),
    ).toThrow(/resource must be zero outside composed mask/)

    expect(() =>
      createComposedState({
        ...maskedConfig,
        initialLineageBiomass: [[1, 4], [2, 0]],
      }),
    ).toThrow(/lineage biomass must be zero outside composed mask/)
  })

  it('rejects corrupted serialized ecology state outside the dish mask', () => {
    const drugState = createComposedState({
      ...maskedConfig,
      ciprofloxacin: ciprofloxacinAuthority,
    })
    drugState.ciprofloxacinConcentrationMgPerL[1] = 0.5
    expect(() =>
      stepComposedState(
        drugState,
        { ...maskedConfig, ciprofloxacin: ciprofloxacinAuthority },
      ),
    ).toThrow(/ciprofloxacin concentration must be zero outside composed mask/)

    const resourceState = createComposedState(maskedConfig)
    resourceState.resource[1] = 9
    expect(() => stepComposedState(resourceState, maskedConfig)).toThrow(
      /resource must be zero outside composed mask/,
    )

    const lineageState = createComposedState(maskedConfig)
    lineageState.lineageBiomass[1]![1] = 4
    expect(() => stepComposedState(lineageState, maskedConfig)).toThrow(
      /lineage biomass must be zero outside composed mask/,
    )
  })

  it('rejects materially over-capacity initial composed state', () => {
    expect(() =>
      createComposedState({
        ...config,
        growth: { ...config.growth, localCapacity: 2.5 },
      }),
    ).toThrow(/initial composed state: ecology biomass exceeds localCapacity/)
  })

  it('rejects materially over-capacity continued state before mutation', () => {
    const state = createComposedState(config)
    state.lineageBiomass[0]![0] = 15
    state.lineageBiomass[1]![0] = 10
    const before = cloneComposedState(state)

    expect(() => stepComposedState(state, config)).toThrow(
      /composed state: ecology biomass exceeds localCapacity/,
    )
    expect(state).toEqual(before)
  })

  it('accepts a Float32-representable boundary across composed create and continue', () => {
    const roundedConfig: ComposedSimulationConfig = {
      ...config,
      width: 1,
      height: 1,
      mask: [1],
      initialResource: [0],
      ciprofloxacinConcentrationMgPerL: [0],
      initialLineageBiomass: [
        [Math.fround(0.1)],
        [Math.fround(0.2)],
      ],
      growth: {
        ...config.growth,
        localCapacity: 0.3,
        spreadRate: 0,
      },
    }
    const representedTotal =
      roundedConfig.initialLineageBiomass[0]![0]! +
      roundedConfig.initialLineageBiomass[1]![0]!
    expect(representedTotal).toBeGreaterThan(
      roundedConfig.growth.localCapacity,
    )

    const state = createComposedState(roundedConfig)
    expect(() => stepComposedState(state, roundedConfig)).not.toThrow()
  })

  it('reports resource and lineage aggregates over the same in-mask domain', () => {
    const state = createComposedState(maskedConfig)
    const metrics = stepComposedState(state, maskedConfig)
    const lineageTotal = Object.values(metrics.lineageBiomass).reduce(
      (sum, value) => sum + value,
      0,
    )

    expect(metrics.totalResource).toBeCloseTo(state.resource[0]!)
    expect(lineageTotal).toBeCloseTo(metrics.totalBiomass)
    expect(state.resource[1]).toBe(0)
    expect(state.lineageBiomass[0]![1]).toBe(0)
    expect(state.lineageBiomass[1]![1]).toBe(0)
  })

  it('rejects corrupted serialized state before typed-array conversion can hide it', () => {
    const state = createComposedState(config)
    state.mask[0] = 256
    expect(() => stepComposedState(state, config)).toThrow(/mask values/)
  })
})
