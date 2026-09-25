import { describe, expect, it } from 'vitest'

import rawAuthority from '../../data/pharmacodynamics/chloramphenicol_mg1655_v1.json'
import {
  CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION,
  GREULICH_RIBOSOME_CUBIC_MODEL_ID,
  evaluateChloramphenicolGrowthInhibition,
  greulichChloramphenicolCubicResidual,
  parseChloramphenicolGrowthInhibitionAuthority,
} from '../../src/sim/pharmacodynamics/chloramphenicol'

const authority = parseChloramphenicolGrowthInhibitionAuthority(rawAuthority)

function evaluate(
  family: 'mops-glycerol' | 'mops-glucose',
  concentrationMicromolar: number,
  lambda0PerHour = 1,
) {
  return evaluateChloramphenicolGrowthInhibition(authority, {
    environmentFamilyId: family,
    concentration: {
      value: concentrationMicromolar,
      unit: 'uM',
    },
    drugFreeGrowthRate: {
      value: lambda0PerHour,
      unit: 'h^-1',
    },
  })
}

describe('MG1655 chloramphenicol growth-inhibition authority', () => {
  it('promotes the exact repository-owned source records without merging contexts', () => {
    expect(authority.version).toBe(
      CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION,
    )
    expect(authority.model.id).toBe(GREULICH_RIBOSOME_CUBIC_MODEL_ID)
    expect(
      authority.families.map((family) => [
        family.id,
        family.lambda0Star.estimate,
        family.ic50Star.estimate,
      ]),
    ).toEqual([
      ['mops-glycerol', 1.83, 2.49],
      ['mops-glucose', 1.28, 4.5],
    ])
    expect(authority.families[0]!.provenance.sourceKeys).toEqual([
      'greulich_2015',
    ])
    expect(authority.families[1]!.provenance.sourceKeys).toEqual([
      'greulich_2015',
    ])
  })

  it('returns exact no-drug growth and no chloramphenicol killing channel', () => {
    for (const family of ['mops-glycerol', 'mops-glucose'] as const) {
      const response = evaluate(family, 0, 1.2)
      expect(response.normalizedGrowthRate).toBe(1)
      expect(response.inhibitedGrowthRatePerHour).toBe(1.2)
      expect(response.effect).toEqual({
        divisionMultiplier: 1,
        incrementalLossHazardPerHour: 0,
      })
      expect(response.cubicResidual).toBe(0)
    }
  })

  it('satisfies the source cubic across a deterministic numerical grid', () => {
    for (const family of ['mops-glycerol', 'mops-glucose'] as const) {
      for (const lambda0 of [0.25, 0.5, 1, 1.5, 2.5]) {
        for (const concentration of [0, 0.01, 0.1, 1, 2.5, 5, 10, 50]) {
          const response = evaluate(family, concentration, lambda0)
          expect(response.normalizedGrowthRate).toBeGreaterThanOrEqual(0)
          expect(response.normalizedGrowthRate).toBeLessThanOrEqual(1)
          expect(Number.isFinite(response.normalizedGrowthRate)).toBe(true)
          expect(Math.abs(response.cubicResidual)).toBeLessThanOrEqual(1e-8)
          expect(response.effect.incrementalLossHazardPerHour).toBe(0)
        }
      }
    }
  })

  it('selects a non-increasing physical branch for fixed source-compatible lambda0', () => {
    for (const family of ['mops-glycerol', 'mops-glucose'] as const) {
      const values = [0, 0.001, 0.01, 0.1, 0.5, 1, 2.5, 5, 10, 25, 100].map(
        (concentration) =>
          evaluate(family, concentration, 1.1).normalizedGrowthRate,
      )
      for (let index = 1; index < values.length; index += 1) {
        expect(values[index]!).toBeLessThanOrEqual(values[index - 1]!)
      }
      expect(values[1]!).toBeLessThan(1)
    }
  })

  it('keeps glucose and glycerol source families distinct', () => {
    const glycerol = evaluate('mops-glycerol', 4, 1)
    const glucose = evaluate('mops-glucose', 4, 1)

    expect(glycerol.familyId).toBe('mops-glycerol')
    expect(glucose.familyId).toBe('mops-glucose')
    expect(glycerol.normalizedGrowthRate).not.toBe(
      glucose.normalizedGrowthRate,
    )
  })

  it('fails closed on missing context, wrong units, and invalid numerical inputs', () => {
    expect(() =>
      evaluateChloramphenicolGrowthInhibition(authority, {
        environmentFamilyId: 'model-resource',
        concentration: { value: 1, unit: 'uM' },
        drugFreeGrowthRate: { value: 1, unit: 'h^-1' },
      }),
    ).toThrow(/unsupported.*environment family/i)

    expect(() =>
      evaluateChloramphenicolGrowthInhibition(authority, {
        environmentFamilyId: 'mops-glucose',
        concentration: { value: 1, unit: 'mg\/L' },
        drugFreeGrowthRate: { value: 1, unit: 'h^-1' },
      }),
    ).toThrow(/concentration unit.*uM/i)

    expect(() =>
      evaluateChloramphenicolGrowthInhibition(authority, {
        environmentFamilyId: 'mops-glucose',
        concentration: { value: 1, unit: 'uM' },
        drugFreeGrowthRate: { value: 1, unit: 'model-growth' },
      }),
    ).toThrow(/growth-rate unit.*h\^-1/i)

    expect(() => evaluate('mops-glucose', -1)).toThrow(/must be >= 0/i)
    expect(() => evaluate('mops-glucose', 1, 0)).toThrow(/must be > 0/i)
  })

  it('fails closed instead of accepting the ciprofloxacin loss model or a rewritten authority version', () => {
    expect(() =>
      parseChloramphenicolGrowthInhibitionAuthority({
        ...rawAuthority,
        model: {
          ...rawAuthority.model,
          id: 'reference_pd_decrement_as_first_order_loss_v1',
        },
      }),
    ).toThrow(/unsupported chloramphenicol growth-inhibition model/i)

    expect(() =>
      parseChloramphenicolGrowthInhibitionAuthority({
        ...rawAuthority,
        version: '1.0.1',
      }),
    ).toThrow(/unsupported.*content version/i)
  })

  it('rejects duplicate environment-family identity and malformed source parameters', () => {
    expect(() =>
      parseChloramphenicolGrowthInhibitionAuthority({
        ...rawAuthority,
        families: [rawAuthority.families[0], rawAuthority.families[0]],
      }),
    ).toThrow(/family ids must be unique/i)

    expect(() =>
      parseChloramphenicolGrowthInhibitionAuthority({
        ...rawAuthority,
        families: [
          {
            ...rawAuthority.families[0],
            ic50Star: {
              ...rawAuthority.families[0].ic50Star,
              estimate: -1,
            },
          },
        ],
      }),
    ).toThrow(/IC50Star estimate.*> 0/i)
  })

  it('exposes the residual helper without any genotype or CAT response inference', () => {
    const response = evaluate('mops-glycerol', 2.49, 1.2)
    const family = authority.families.find(
      (candidate) => candidate.id === 'mops-glycerol',
    )!

    expect(
      greulichChloramphenicolCubicResidual(
        response.normalizedGrowthRate,
        response.concentrationMicromolar,
        response.drugFreeGrowthRatePerHour,
        family.lambda0Star.estimate,
        family.ic50Star.estimate,
      ),
    ).toBeCloseTo(response.cubicResidual, 12)
    expect(response).not.toHaveProperty('genotypeId')
    expect(response).not.toHaveProperty('mic')
  })
})
