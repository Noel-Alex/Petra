import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
  FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
  projectAspergillusNo10SurfaceFrontForRender,
} from '../src/app/fungalSurfaceRenderProjection'
import {
  ASPERGILLUS_NO10_PLATE_RADIUS_UM,
  ASPERGILLUS_NO10_SOURCE_PACK_ID,
  ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
  ASPERGILLUS_NO10_TAXON_ID,
  advanceAspergillusNo10SurfaceCheckpoint,
  createAspergillusNo10SurfaceCheckpoint,
  observeAspergillusNo10SurfaceCheckpoint,
  type AspergillusNo10SurfaceCheckpoint,
} from '../src/sim/fungi/aspergillusNo10Surface'

const EXPERIMENT_ID = 'fungal-render-projection-parity'

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = output + '.tmp'
  writeFileSync(temporary, JSON.stringify(result, null, 2) + '\n', 'utf8')
  renameSync(temporary, output)
}

function verifyProjection(checkpoint: AspergillusNo10SurfaceCheckpoint) {
  const observation = observeAspergillusNo10SurfaceCheckpoint(checkpoint)
  const projection = projectAspergillusNo10SurfaceFrontForRender(checkpoint)

  expect(projection.schemaVersion).toBe(
    FUNGAL_SURFACE_FRONT_RENDER_PROJECTION_SCHEMA_VERSION,
  )
  expect(projection.authority).toBe('source-validation-front')
  expect(projection.geometryKind).toBe('central-point-radial-front')
  expect(projection.sourcePackId).toBe(observation.sourcePackId)
  expect(projection.taxonId).toBe(observation.taxonId)
  expect(projection.taxonContentVersion).toBe(observation.taxonContentVersion)
  expect(projection.treatmentId).toBe(observation.treatmentId)
  expect(projection.biologicalTimeHours).toBe(observation.biologicalTimeHours)
  expect(projection.fixedSourceTreatment).toEqual({
    glucoseGPerL: observation.glucoseGPerL,
    unit: 'g/L',
    role: 'experimental-condition-identity',
  })
  expect(projection.plate).toEqual({
    radiusUm: observation.plateRadiusUm,
    unit: 'um',
    centerNormalized: { x: 0.5, y: 0.5 },
  })
  expect(projection.front).toEqual({
    radiusUm: observation.colonyRadiusUm,
    normalizedRadius: observation.normalizedColonyRadius,
    atDishBoundary: observation.frontAtDishBoundary,
  })
  expect(projection.unsupportedScientificSemantics).toEqual(
    FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
  )

  expect(Object.isFrozen(projection)).toBe(true)
  expect(Object.isFrozen(projection.fixedSourceTreatment)).toBe(true)
  expect(Object.isFrozen(projection.plate)).toBe(true)
  expect(Object.isFrozen(projection.plate.centerNormalized)).toBe(true)
  expect(Object.isFrozen(projection.front)).toBe(true)
  expect(Object.isFrozen(projection.unsupportedScientificSemantics)).toBe(true)

  for (const unsupportedKey of [
    'density',
    'biomass',
    'resource',
    'resourceField',
    'opacity',
    'hyphalNetwork',
    'hyphalCount',
    'antimicrobialResponse',
    'bacteriaFungusInteraction',
  ]) {
    expect(unsupportedKey in projection).toBe(false)
  }

  return { observation, projection }
}

describe('authoritative fungal-front render projection parity', () => {
  it('preserves the source-validated front exactly and refuses unsupported fungal semantics', () => {
    const zero = verifyProjection(
      createAspergillusNo10SurfaceCheckpoint(70),
    )
    expect(zero.projection.front).toEqual({
      radiusUm: 0,
      normalizedRadius: 0,
      atDishBoundary: false,
    })

    const partial = verifyProjection(
      advanceAspergillusNo10SurfaceCheckpoint(
        createAspergillusNo10SurfaceCheckpoint(40),
        3,
      ),
    )
    expect(partial.projection.front.normalizedRadius).toBeGreaterThan(0)
    expect(partial.projection.front.normalizedRadius).toBeLessThan(1)

    const boundary = verifyProjection(
      advanceAspergillusNo10SurfaceCheckpoint(
        createAspergillusNo10SurfaceCheckpoint(120),
        1_000,
      ),
    )
    expect(boundary.projection.front.radiusUm).toBe(
      ASPERGILLUS_NO10_PLATE_RADIUS_UM,
    )
    expect(boundary.projection.front.normalizedRadius).toBe(1)
    expect(boundary.projection.front.atDishBoundary).toBe(true)

    const radiusDrift = {
      ...createAspergillusNo10SurfaceCheckpoint(70),
      colonyRadiusUm: 1,
    }
    expect(() =>
      projectAspergillusNo10SurfaceFrontForRender(radiusDrift),
    ).toThrow(/radius\/time drift/i)

    const staleTaxonRevision = {
      ...createAspergillusNo10SurfaceCheckpoint(70),
      taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION + ':stale',
    } as unknown as AspergillusNo10SurfaceCheckpoint
    expect(() =>
      projectAspergillusNo10SurfaceFrontForRender(staleTaxonRevision),
    ).toThrow(/biological identity mismatch/i)

    const wrongTreatment = {
      ...createAspergillusNo10SurfaceCheckpoint(70),
      treatmentId: 'wrong-treatment',
    }
    expect(() =>
      projectAspergillusNo10SurfaceFrontForRender(wrongTreatment),
    ).toThrow(/treatment identity mismatch/i)

    writeCompactResult({
      experimentId: EXPERIMENT_ID,
      status: 'pass',
      classification:
        'fungal-render-projection-integrity-not-biological-validation',
      sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
      taxonId: ASPERGILLUS_NO10_TAXON_ID,
      taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
      cases: [
        {
          name: 'zero-front',
          treatmentId: zero.projection.treatmentId,
          biologicalTimeHours: zero.projection.biologicalTimeHours,
          glucoseGPerL: zero.projection.fixedSourceTreatment.glucoseGPerL,
          plateRadiusUm: zero.projection.plate.radiusUm,
          frontRadiusUm: zero.projection.front.radiusUm,
          normalizedFrontRadius: zero.projection.front.normalizedRadius,
          atDishBoundary: zero.projection.front.atDishBoundary,
        },
        {
          name: 'partial-front',
          treatmentId: partial.projection.treatmentId,
          biologicalTimeHours: partial.projection.biologicalTimeHours,
          glucoseGPerL: partial.projection.fixedSourceTreatment.glucoseGPerL,
          plateRadiusUm: partial.projection.plate.radiusUm,
          frontRadiusUm: partial.projection.front.radiusUm,
          normalizedFrontRadius: partial.projection.front.normalizedRadius,
          atDishBoundary: partial.projection.front.atDishBoundary,
        },
        {
          name: 'dish-boundary-saturation',
          treatmentId: boundary.projection.treatmentId,
          biologicalTimeHours: boundary.projection.biologicalTimeHours,
          glucoseGPerL: boundary.projection.fixedSourceTreatment.glucoseGPerL,
          plateRadiusUm: boundary.projection.plate.radiusUm,
          frontRadiusUm: boundary.projection.front.radiusUm,
          normalizedFrontRadius: boundary.projection.front.normalizedRadius,
          atDishBoundary: boundary.projection.front.atDishBoundary,
        },
      ],
      unsupportedScientificSemantics:
        FUNGAL_SURFACE_FRONT_UNSUPPORTED_SCIENTIFIC_SEMANTICS,
      negativeCases: [
        'radius-time-drift',
        'stale-taxon-content-version',
        'treatment-identity-drift',
      ],
      limitations: [
        'This establishes checkpoint-to-render front projection integrity only; it is not biological validation of fungal growth.',
        'The current fungal authority is a source-treatment radial front, not a spatial density, biomass field, mature hyphal network, resource field, antimicrobial-response model, or bacteria-fungus interaction model.',
        'Presentation-only mass or hyphal strokes inside the authoritative front remain non-biological and must not feed back into simulation authority.',
        'Browser/Pixi visual fidelity and performance remain separate acceptance gates.',
      ],
    })
  })
})
