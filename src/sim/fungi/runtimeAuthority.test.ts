import { describe, expect, it } from 'vitest'

import {
  ASPERGILLUS_NO10_SOURCE_PACK_ID,
  ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
  ASPERGILLUS_NO10_TAXON_ID,
} from './aspergillusNo10Surface'
import {
  ASPERGILLUS_NO10_SURFACE_RUNTIME_MECHANISM_ID,
  FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
  assertFungalRuntimeAuthority,
  cloneFungalRuntimeAuthorityState,
  createAspergillusNo10SurfaceRuntimeAuthority,
  createFungalRuntimeAuthorityState,
  fungalRuntimeAuthorityIdentity,
  observeFungalRuntimeAuthorityState,
  validateFungalRuntimeAuthorityState,
} from './runtimeAuthority'

describe('fungal runtime authority phase A', () => {
  it('binds one exact source treatment into deterministic replay identity', () => {
    const authority = createAspergillusNo10SurfaceRuntimeAuthority(40)

    expect(authority).toEqual({
      schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
      mechanismId: ASPERGILLUS_NO10_SURFACE_RUNTIME_MECHANISM_ID,
      sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
      taxonId: ASPERGILLUS_NO10_TAXON_ID,
      taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
      treatmentId:
        `${ASPERGILLUS_NO10_SOURCE_PACK_ID}:central-point:glucose-40-g-per-l`,
      glucoseGPerL: 40,
    })
    expect(fungalRuntimeAuthorityIdentity(authority)).toBe(
      fungalRuntimeAuthorityIdentity(
        createAspergillusNo10SurfaceRuntimeAuthority(40),
      ),
    )
    expect(fungalRuntimeAuthorityIdentity(authority)).not.toBe(
      fungalRuntimeAuthorityIdentity(
        createAspergillusNo10SurfaceRuntimeAuthority(70),
      ),
    )
    expect(fungalRuntimeAuthorityIdentity(null)).toBeNull()
  })

  it('creates, validates, clones, and observes the mechanism-owned physical front without bacterial field semantics', () => {
    const authority = createAspergillusNo10SurfaceRuntimeAuthority(120)
    const state = createFungalRuntimeAuthorityState(authority)
    const clone = cloneFungalRuntimeAuthorityState(state, authority)
    const observed = observeFungalRuntimeAuthorityState(state, authority)

    expect(clone).toEqual(state)
    expect(clone).not.toBe(state)
    expect(clone.checkpoint).not.toBe(state.checkpoint)
    expect(clone.checkpoint.founderPositionCm).not.toBe(
      state.checkpoint.founderPositionCm,
    )

    expect(observed.authorityIdentity).toBe(
      fungalRuntimeAuthorityIdentity(authority),
    )
    expect(observed.observation).toMatchObject({
      sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
      taxonId: ASPERGILLUS_NO10_TAXON_ID,
      taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
      glucoseGPerL: 120,
      biologicalTimeHours: 0,
      colonyRadiusUm: 0,
    })

    expect(Object.keys(state).sort()).toEqual([
      'authorityIdentity',
      'checkpoint',
      'schemaVersion',
    ])
    expect('resource' in state).toBe(false)
    expect('biomass' in state).toBe(false)
    expect('lineageBiomass' in state).toBe(false)
    expect('resource' in observed.observation).toBe(false)
    expect('biomass' in observed.observation).toBe(false)
  })

  it('fails closed on foreign biology, treatment drift, unknown fields, or checkpoint radius/time drift', () => {
    const authority = createAspergillusNo10SurfaceRuntimeAuthority(10)

    expect(() =>
      assertFungalRuntimeAuthority({
        ...authority,
        sourcePackId: 'foreign-source-pack',
      }),
    ).toThrow(/biological identity mismatch/)

    expect(() =>
      assertFungalRuntimeAuthority({
        ...authority,
        treatmentId: 'invented-treatment',
      }),
    ).toThrow(/treatment identity mismatch/)

    expect(() =>
      assertFungalRuntimeAuthority({
        ...authority,
        presentationColor: '#ffffff',
      }),
    ).toThrow(/unsupported field/)

    const state = createFungalRuntimeAuthorityState(authority)
    const drifted = structuredClone(state) as {
      schemaVersion: number
      authorityIdentity: string
      checkpoint: typeof state.checkpoint
    }
    ;(drifted.checkpoint as { colonyRadiusUm: number }).colonyRadiusUm = 1

    expect(() =>
      validateFungalRuntimeAuthorityState(drifted, authority),
    ).toThrow(/radius\/time drift/)
  })

  it('refuses to reuse a checkpoint under a different exact source treatment identity', () => {
    const authority10 = createAspergillusNo10SurfaceRuntimeAuthority(10)
    const authority40 = createAspergillusNo10SurfaceRuntimeAuthority(40)
    const state10 = createFungalRuntimeAuthorityState(authority10)

    expect(() =>
      validateFungalRuntimeAuthorityState(state10, authority40),
    ).toThrow(/identity mismatch/)
  })
})
