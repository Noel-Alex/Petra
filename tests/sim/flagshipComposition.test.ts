import { describe, expect, it } from 'vitest'

import {
  composedConfigurationFingerprint,
} from '../../src/sim/authoritative'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from '../../src/sim/flagshipComposition'
import { PROTOCOL_VERSION } from '../../src/sim/protocol'

const baseline: FlagshipRunInitialization = {
  seed: 0x5eed1234,
  initialResourceLevel: 8,
  inocula: [
    {
      lineageId: 'founder-wt',
      x: 80,
      y: 80,
      biomass: 1,
    },
  ],
}

describe('flagship composed run planning', () => {
  it('projects bundled scenario authority into a provenance-bound protocol-v5 config', () => {
    const plan = buildFlagshipComposedRunPlan(baseline)
    const center = 80 * plan.config.width + 80

    expect(plan.identity).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      scenarioId: 'ecoli-ciprofloxacin-spatial',
      scenarioVersion: '1.5.0-research',
      parameterSetId: 'ecoli-ciprofloxacin-baseline-composed',
      parameterSetVersion: '1.1.0',
      seed: baseline.seed,
    })
    expect(plan.parameterSetBinding.authority).toBe('provenance')
    expect(plan.identity.parameterSetBinding).toEqual(
      plan.parameterSetBinding,
    )
    expect(plan.parameterSetBinding.configurationFingerprint).toBe(
      composedConfigurationFingerprint(plan.config),
    )

    expect(plan.config.width).toBe(160)
    expect(plan.config.height).toBe(160)
    expect(plan.config.growth).toEqual({
      maxDivisionRate: 0.8,
      halfSaturation: 1,
      biomassYield: 1,
      localCapacity: 32,
      spreadRate: 0.05,
    })
    expect(plan.config.hoursPerTick).toBe(0.02)
    expect(plan.config.ciprofloxacinConcentrationMgPerL.every((value) => value === 0)).toBe(true)
    expect(plan.config.ciprofloxacin).toMatchObject({
      policyId: 'reference_pd_decrement_as_first_order_loss_v1',
      concentrationUnit: 'mg/L',
      referenceMicMgPerL: 0.03,
      referencePharmacodynamics: {
        psiMaxLog10PerHour: 0.88,
        psiMinLog10PerHour: -6.5,
        zMic: 0.017,
        kappa: 1.1,
      },
    })
    expect(
      plan.config.ciprofloxacin?.genotypeMicMgPerL.find(
        (entry) => entry.genotypeId === 'WT',
      )?.micMgPerL,
    ).toBe(0.016)
    expect(plan.config.samplingExecutionPolicy).toBeNull()
    expect(plan.config.lineages).toEqual([
      {
        id: 'founder-wt',
        genotypeId: 'WT',
        deathHazardPerHour: 0,
      },
    ])

    expect(plan.config.mask[center]).toBe(1)
    expect(plan.config.initialResource[center]).toBe(8)
    expect(plan.config.initialLineageBiomass[0]![center]).toBe(1)
    expect(plan.config.mask[0]).toBe(0)
    expect(plan.config.ciprofloxacinConcentrationMgPerL[0]).toBe(0)
    expect(plan.config.initialResource[0]).toBe(0)
    expect(plan.config.initialLineageBiomass[0]![0]).toBe(0)
  })

  it('enters the real composed engine and advances baseline ecology', () => {
    const plan = buildFlagshipComposedRunPlan(baseline)
    const engine = new ComposedSimulationEngine(plan.identity, plan.config)
    const before = engine.snapshot().checkpoint

    expect(before.authority).toBe('composed')
    expect(before.metrics.totalBiomass).toBe(1)

    const after = engine.execute({
      id: 'baseline-advance',
      type: 'advance',
      ticks: 10,
    }).checkpoint

    expect(after.tick).toBe(10)
    expect(after.simulationTimeHours).toBeCloseTo(0.2)
    expect(after.metrics.totalBiomass).toBeGreaterThan(1)
    expect(after.metrics.totalResource).toBeLessThan(
      before.metrics.totalResource,
    )
  })

  it('keeps run-state initialization outside mechanism parameter-set identity', () => {
    const first = buildFlagshipComposedRunPlan(baseline)
    const second = buildFlagshipComposedRunPlan({
      ...baseline,
      seed: baseline.seed + 1,
      initialResourceLevel: 4,
      inocula: [
        {
          lineageId: 'founder-wt',
          x: 81,
          y: 80,
          biomass: 0.5,
        },
      ],
    })

    expect(second.identity.seed).not.toBe(first.identity.seed)
    expect(second.config.initialResource).not.toEqual(
      first.config.initialResource,
    )
    expect(second.config.initialLineageBiomass).not.toEqual(
      first.config.initialLineageBiomass,
    )
    expect(second.parameterSetBinding).toEqual(first.parameterSetBinding)
  })

  it('fails closed on invalid founder/state initialization', () => {
    expect(() =>
      buildFlagshipComposedRunPlan({
        ...baseline,
        initialResourceLevel: Number.NaN,
      }),
    ).toThrow(/initialResourceLevel/)

    expect(() =>
      buildFlagshipComposedRunPlan({
        ...baseline,
        inocula: [
          {
            lineageId: 'unknown-lineage',
            x: 80,
            y: 80,
            biomass: 1,
          },
        ],
      }),
    ).toThrow(/unknown baseline lineage/)

    expect(() =>
      buildFlagshipComposedRunPlan({
        ...baseline,
        inocula: [
          {
            lineageId: 'founder-wt',
            x: 0,
            y: 0,
            biomass: 1,
          },
        ],
      }),
    ).toThrow(/inside the dish mask/)

    expect(() =>
      buildFlagshipComposedRunPlan({
        ...baseline,
        inocula: [
          {
            lineageId: 'founder-wt',
            x: 80,
            y: 80,
            biomass: 33,
          },
        ],
      }),
    ).toThrow(/localCapacity/)
  })
})
