import { describe, expect, it } from 'vitest'
import {
  ASPERGILLUS_NO10_MORPHOMETRIC_GLUCOSE_G_PER_L,
  ASPERGILLUS_NO10_MORPHOMETRIC_REPRODUCTION_TOLERANCE_PER_HOUR,
  ASPERGILLUS_NO10_PLATE_RADIUS_UM,
  ASPERGILLUS_NO10_RADIAL_REPRODUCTION_TOLERANCE_UM,
  ASPERGILLUS_NO10_SOURCE_PACK_ID,
  ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L,
  ASPERGILLUS_NO10_TAXON,
  ASPERGILLUS_NO10_TAXON_ID,
  ASPERGILLUS_NO10_TAXON_REGISTRY,
  advanceAspergillusNo10SurfaceCheckpoint,
  aspergillusNo10FirstBranchValidationTarget,
  aspergillusNo10MorphometricValidation,
  aspergillusNo10SurfaceTreatment,
  calculateAspergillusMorphometricSpecificGrowthPerHour,
  createAspergillusNo10SurfaceCheckpoint,
  observeAspergillusNo10SurfaceCheckpoint,
  restoreAspergillusNo10SurfaceCheckpoint,
  validateAspergillusNo10SurfaceCheckpoint,
} from './aspergillusNo10Surface'

describe('Aspergillus no. 10 source authority', () => {
  it('binds the exact named fungal content identity and source plate treatments', () => {
    expect(ASPERGILLUS_NO10_TAXON.id).toBe(ASPERGILLUS_NO10_TAXON_ID)
    expect(ASPERGILLUS_NO10_TAXON.microbialGroup).toBe('fungus')
    expect(ASPERGILLUS_NO10_TAXON_REGISTRY.taxa).toHaveLength(1)
    expect(ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L).toEqual([
      10,
      40,
      70,
      120,
      200,
      300,
    ])

    expect(
      ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L.map(
        (glucoseGPerL) =>
          aspergillusNo10SurfaceTreatment(glucoseGPerL)
            .radialExtensionUmPerHour,
      ),
    ).toEqual([346, 556, 614, 580, 430, 381])

    for (const glucoseGPerL of ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L) {
      const target = aspergillusNo10SurfaceTreatment(glucoseGPerL)
      const oneHour = advanceAspergillusNo10SurfaceCheckpoint(
        createAspergillusNo10SurfaceCheckpoint(glucoseGPerL),
        1,
      )
      expect(
        Math.abs(
          oneHour.colonyRadiusUm - target.radialExtensionUmPerHour,
        ),
      ).toBeLessThanOrEqual(
        ASPERGILLUS_NO10_RADIAL_REPRODUCTION_TOLERANCE_UM,
      )
    }

    expect(() => aspergillusNo10SurfaceTreatment(20)).toThrow(
      /supported exact source rows.*not interpolated/,
    )
    expect(() => aspergillusNo10SurfaceTreatment(Number.NaN)).toThrow(
      /unsupported Aspergillus no. 10 source glucose treatment/,
    )
  })

  it('advances the physical central-point front deterministically and saturates at the 9-cm plate boundary', () => {
    const origin = createAspergillusNo10SurfaceCheckpoint(70)
    const tenHours = advanceAspergillusNo10SurfaceCheckpoint(origin, 10)

    expect(origin.biologicalTimeHours).toBe(0)
    expect(origin.colonyRadiusUm).toBe(0)
    expect(tenHours.biologicalTimeHours).toBe(10)
    expect(tenHours.colonyRadiusUm).toBe(6_140)
    expect(tenHours.frontAtDishBoundary).toBe(false)
    expect(tenHours.founderPositionCm).toEqual({ x: 4.5, y: 4.5 })

    const saturated = advanceAspergillusNo10SurfaceCheckpoint(tenHours, 100)
    expect(saturated.colonyRadiusUm).toBe(ASPERGILLUS_NO10_PLATE_RADIUS_UM)
    expect(saturated.frontAtDishBoundary).toBe(true)

    const afterBoundary = advanceAspergillusNo10SurfaceCheckpoint(saturated, 1)
    expect(afterBoundary.colonyRadiusUm).toBe(ASPERGILLUS_NO10_PLATE_RADIUS_UM)
    expect(afterBoundary.biologicalTimeHours).toBe(111)

    expect(() =>
      advanceAspergillusNo10SurfaceCheckpoint(origin, -1),
    ).toThrow(/finite and non-negative/)
  })

  it('validates and restores exact checkpoint identity without repairing drift', () => {
    const checkpoint = advanceAspergillusNo10SurfaceCheckpoint(
      createAspergillusNo10SurfaceCheckpoint(40),
      4,
    )
    const restored = restoreAspergillusNo10SurfaceCheckpoint(checkpoint)

    expect(restored).toEqual(checkpoint)
    expect(restored).not.toBe(checkpoint)
    expect(Object.isFrozen(restored)).toBe(true)
    expect(Object.isFrozen(restored.founderPositionCm)).toBe(true)
    expect(() => validateAspergillusNo10SurfaceCheckpoint(restored)).not.toThrow()

    expect(() =>
      validateAspergillusNo10SurfaceCheckpoint({
        ...checkpoint,
        colonyRadiusUm: checkpoint.colonyRadiusUm + 1,
      }),
    ).toThrow(/radius\/time drift/)

    expect(() =>
      validateAspergillusNo10SurfaceCheckpoint({
        ...checkpoint,
        treatmentId: 'alias',
      }),
    ).toThrow(/treatment identity mismatch/)

    expect(() =>
      validateAspergillusNo10SurfaceCheckpoint({
        ...checkpoint,
        founderPositionCm: { x: 4.4, y: 4.5 } as never,
      }),
    ).toThrow(/exact 9-cm central-point source geometry/)
  })

  it('projects a renderer-independent physical front observation from checkpoint authority', () => {
    const checkpoint = advanceAspergillusNo10SurfaceCheckpoint(
      createAspergillusNo10SurfaceCheckpoint(10),
      5,
    )
    const observation = observeAspergillusNo10SurfaceCheckpoint(checkpoint)

    expect(observation.sourcePackId).toBe(ASPERGILLUS_NO10_SOURCE_PACK_ID)
    expect(observation.taxonId).toBe(ASPERGILLUS_NO10_TAXON_ID)
    expect(observation.glucoseGPerL).toBe(10)
    expect(observation.biologicalTimeHours).toBe(5)
    expect(observation.colonyRadiusUm).toBe(1_730)
    expect(observation.sourceRadialExtensionUmPerHour).toBe(346)
    expect(observation.normalizedColonyRadius).toBeCloseTo(
      1_730 / ASPERGILLUS_NO10_PLATE_RADIUS_UM,
      12,
    )
  })
})

describe('Aspergillus no. 10 source validation observables', () => {
  it('reproduces every source morphometric equation row within the explicit transcription tolerance', () => {
    expect(ASPERGILLUS_NO10_MORPHOMETRIC_GLUCOSE_G_PER_L).toEqual([
      10,
      40,
      70,
      120,
      300,
    ])

    for (const glucoseGPerL of ASPERGILLUS_NO10_MORPHOMETRIC_GLUCOSE_G_PER_L) {
      const validation =
        aspergillusNo10MorphometricValidation(glucoseGPerL)
      expect(validation.reproductionTolerancePerHour).toBe(
        ASPERGILLUS_NO10_MORPHOMETRIC_REPRODUCTION_TOLERANCE_PER_HOUR,
      )
      expect(validation.absoluteReproductionErrorPerHour).toBeLessThanOrEqual(
        ASPERGILLUS_NO10_MORPHOMETRIC_REPRODUCTION_TOLERANCE_PER_HOUR,
      )
      expect(validation.reproducesSourceEquationRow).toBe(true)
      expect(validation.classification).toBe(
        'derived-source-model-validation',
      )
    }

    expect(() => aspergillusNo10MorphometricValidation(200)).toThrow(
      /must not interpolate/,
    )
  })

  it('keeps first-branch rows as measured validation targets, not a mature branch-network law', () => {
    const target = aspergillusNo10FirstBranchValidationTarget(10)
    expect(target).toMatchObject({
      glucoseGPerL: 10,
      inoculationContext: 'lawn-germ-tube',
      specificElongationPerHour: 1.1,
      criticalLengthBeforeFirstBranchUm: 461,
      timeToFirstBranchHours: 6,
      classification: 'measured-validation-target',
    })
    expect(target.limitation).toMatch(/does not authorize branch angle/)

    expect(() => aspergillusNo10FirstBranchValidationTarget(200)).toThrow(
      /must not be interpolated/,
    )
  })

  it('fails closed when morphometric geometry is non-physical', () => {
    expect(() =>
      calculateAspergillusMorphometricSpecificGrowthPerHour({
        radialExtensionUmPerHour: 346,
        averageDistalHyphaLengthUm: 6,
        hyphalDiameterUm: 6,
      }),
    ).toThrow(/must exceed hyphal diameter/)

    expect(() =>
      calculateAspergillusMorphometricSpecificGrowthPerHour({
        radialExtensionUmPerHour: 0,
        averageDistalHyphaLengthUm: 220,
        hyphalDiameterUm: 6.32,
      }),
    ).toThrow(/positive and finite/)
  })
})
