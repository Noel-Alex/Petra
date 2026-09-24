/**
 * Scientific fixture provenance:
 * - Regoes et al. 2004, DOI 10.1128/AAC.48.10.3670-3676.2004: CAB1/LB/37 C
 *   ciprofloxacin reference pharmacodynamic curve.
 * - Marcusson et al. 2009, DOI 10.1371/journal.ppat.1000541: MG1655 genotype MICs.
 *
 * The resource×drug composition tested here is Petra's declared transferred
 * mechanistic approximation, not a claim that those studies measured one
 * combined spatial/starvation experiment.
 */
import { describe, expect, it } from 'vitest'
import { stepEcology, type EcologyState, type GrowthParameters } from '../../src/sim/ecology/growth'
import {
  CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY,
  ciprofloxacinIncrementalLoss,
  composeSpatialCiprofloxacinLoss,
} from '../../src/sim/pharmacodynamics/composition'
import {
  log10RateToNaturalPerHour,
  type RegoesPharmacodynamics,
} from '../../src/sim/pharmacodynamics/ciprofloxacin'

const REGOES_CAB1_CIPRO: RegoesPharmacodynamics = {
  psiMaxLog10PerHour: 0.88,
  psiMinLog10PerHour: -6.5,
  kappa: 1.1,
  zMic: 0.017,
}

const REFERENCE_MIC = 0.03

describe('ciprofloxacin incremental-loss composition', () => {
  it('adds no loss channel at zero concentration', () => {
    const result = ciprofloxacinIncrementalLoss(0, REGOES_CAB1_CIPRO, REFERENCE_MIC, 0.016)
    expect(result.deathHazardPerHour).toBe(0)
    expect(result.drugEffectNaturalPerHour).toBe(0)
    expect(result.policyId).toBe(CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.id)
    expect(result.classification).toBe('transferred_mechanistic_approximation')
  })

  it('maps the reference zMIC crossing to loss equal to the reference drug-free natural rate', () => {
    const result = ciprofloxacinIncrementalLoss(
      REGOES_CAB1_CIPRO.zMic,
      REGOES_CAB1_CIPRO,
      REFERENCE_MIC,
      REFERENCE_MIC,
    )
    expect(result.response.netRateNaturalPerHour).toBeCloseTo(0, 12)
    expect(result.deathHazardPerHour).toBeCloseTo(
      log10RateToNaturalPerHour(REGOES_CAB1_CIPRO.psiMaxLog10PerHour),
      12,
    )
  })

  it('approaches a finite high-concentration loss asymptote', () => {
    const result = ciprofloxacinIncrementalLoss(1e12, REGOES_CAB1_CIPRO, REFERENCE_MIC, REFERENCE_MIC)
    const expected = log10RateToNaturalPerHour(
      REGOES_CAB1_CIPRO.psiMaxLog10PerHour - REGOES_CAB1_CIPRO.psiMinLog10PerHour,
    )
    expect(result.deathHazardPerHour).toBeCloseTo(expected, 5)
  })

  it('gives a higher-MIC genotype less loss at the same intermediate concentration', () => {
    const wildType = ciprofloxacinIncrementalLoss(0.5, REGOES_CAB1_CIPRO, REFERENCE_MIC, 0.016)
    const highMic = ciprofloxacinIncrementalLoss(0.5, REGOES_CAB1_CIPRO, REFERENCE_MIC, 32)
    expect(highMic.deathHazardPerHour).toBeLessThan(wildType.deathHazardPerHour)
    expect(highMic.deathHazardPerHour).toBeGreaterThanOrEqual(0)
  })
})

describe('spatial ciprofloxacin composition', () => {
  it('builds masked genotype hazard fields from one authoritative concentration array', () => {
    const composed = composeSpatialCiprofloxacinLoss(
      new Float32Array([0, 0.5, 100]),
      new Uint8Array([1, 1, 0]),
      REGOES_CAB1_CIPRO,
      REFERENCE_MIC,
      [
        { genotypeId: 'WT', genotypeMic: 0.016 },
        { genotypeId: 'ACB', genotypeMic: 32 },
      ],
    )

    const wt = composed.fields[0]!
    const resistant = composed.fields[1]!
    expect(composed.policy.id).toBe(CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.id)
    expect(wt.deathHazardPerHour[0]).toBe(0)
    expect(wt.deathHazardPerHour[1]).toBeGreaterThan(resistant.deathHazardPerHour[1]!)
    expect(wt.deathHazardPerHour[2]).toBe(0)
    expect(resistant.deathHazardPerHour[2]).toBe(0)
  })

  it('rejects invalid concentration/mask/genotype inputs instead of contaminating state', () => {
    expect(() =>
      composeSpatialCiprofloxacinLoss(
        new Float32Array([Number.NaN]),
        new Uint8Array([1]),
        REGOES_CAB1_CIPRO,
        REFERENCE_MIC,
        [{ genotypeId: 'WT', genotypeMic: 0.016 }],
      ),
    ).toThrow(/concentration/)

    expect(() =>
      composeSpatialCiprofloxacinLoss(
        new Float32Array([0]),
        new Uint8Array([2]),
        REGOES_CAB1_CIPRO,
        REFERENCE_MIC,
        [{ genotypeId: 'WT', genotypeMic: 0.016 }],
      ),
    ).toThrow(/mask/)

    expect(() =>
      composeSpatialCiprofloxacinLoss(
        new Float32Array([0]),
        new Uint8Array([1]),
        REGOES_CAB1_CIPRO,
        REFERENCE_MIC,
        [
          { genotypeId: 'WT', genotypeMic: 0.016 },
          { genotypeId: 'WT', genotypeMic: 0.38 },
        ],
      ),
    ).toThrow(/unique/)
  })
})

describe('resource × drug ecology integration', () => {
  const syntheticGrowth: GrowthParameters = {
    maxDivisionRate: 1,
    halfSaturation: 2,
    biomassYield: 1_000_000,
    localCapacity: 1_000,
    spreadRate: 0,
  }

  it('leaves zero-drug growth unchanged while a drug-present cell can lose biomass', () => {
    const concentration = new Float32Array([0, 100])
    const mask = new Uint8Array([1, 1])
    const composed = composeSpatialCiprofloxacinLoss(
      concentration,
      mask,
      REGOES_CAB1_CIPRO,
      REFERENCE_MIC,
      [{ genotypeId: 'WT', genotypeMic: 0.016 }],
    )
    const state: EcologyState = {
      width: 2,
      height: 1,
      mask,
      resource: new Float32Array([1_000, 1_000]),
      lineages: [new Float32Array([10, 10])],
    }

    const result = stepEcology(
      state,
      syntheticGrowth,
      [{ relativeFitness: 1, deathHazardPerTime: composed.fields[0]!.deathHazardPerHour }],
      0.1,
    )

    expect(state.lineages[0]![0]).toBeGreaterThan(10)
    expect(state.lineages[0]![1]).toBeLessThan(10)
    expect(result.fluxes.deathBiomass[0]![0]).toBe(0)
    expect(result.fluxes.deathBiomass[0]![1]).toBeGreaterThan(0)
  })

  it('keeps zero-resource division at zero while applying the declared PD-derived loss policy', () => {
    const concentration = new Float32Array([REGOES_CAB1_CIPRO.zMic])
    const mask = new Uint8Array([1])
    const composed = composeSpatialCiprofloxacinLoss(
      concentration,
      mask,
      REGOES_CAB1_CIPRO,
      REFERENCE_MIC,
      [{ genotypeId: 'reference', genotypeMic: REFERENCE_MIC }],
    )
    const state: EcologyState = {
      width: 1,
      height: 1,
      mask,
      resource: new Float32Array([0]),
      lineages: [new Float32Array([10])],
    }

    const result = stepEcology(
      state,
      syntheticGrowth,
      [{ relativeFitness: 1, deathHazardPerTime: composed.fields[0]!.deathHazardPerHour }],
      0.1,
    )

    expect(result.metrics.divisionBiomass).toBe(0)
    expect(result.metrics.deathBiomass).toBeGreaterThan(0)
    expect(state.lineages[0]![0]).toBeLessThan(10)
  })
})
