import { describe, expect, it } from 'vitest'

import {
  ASPERGILLUS_NO10_SOURCE_PACK_ID,
  ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
  ASPERGILLUS_NO10_TAXON_ID,
} from './aspergillusNo10Surface'
import {
  ASPERGILLUS_NO10_DORMANT_RUNTIME_MECHANISM_ID,
  FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
  FUNGAL_RUNTIME_STATE_ENVELOPE_SCHEMA_VERSION,
  cloneFungalRuntimeAuthority,
  createDisabledFungalRuntimeAuthority,
  createDormantAspergillusNo10RuntimeAuthority,
  createDormantFungalRuntimeStateEnvelope,
  fungalRuntimeAuthorityCanonicalIdentity,
  restoreFungalRuntimeStateEnvelope,
  validateFungalRuntimeAuthority,
  validateFungalRuntimeStateEnvelope,
} from './fungalRuntimeAuthority'

describe('dormant fungal runtime authority', () => {
  it('binds only the exact supported Aspergillus source identity/treatment', () => {
    const authority = createDormantAspergillusNo10RuntimeAuthority(70)

    expect(authority).toEqual({
      schemaVersion: FUNGAL_RUNTIME_AUTHORITY_SCHEMA_VERSION,
      mode: 'dormant-source-validation',
      mechanismId: ASPERGILLUS_NO10_DORMANT_RUNTIME_MECHANISM_ID,
      sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
      taxonId: ASPERGILLUS_NO10_TAXON_ID,
      taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
      treatmentId:
        `${ASPERGILLUS_NO10_SOURCE_PACK_ID}:central-point:glucose-70-g-per-l`,
      glucoseGPerL: 70,
      biologicalTimeUnit: 'h',
      colonyRadiusUnit: 'um',
      plateDiameterUnit: 'cm',
      glucoseTreatmentUnit: 'g/L',
      glucoseSemantics: 'fixed-source-treatment-identity',
    })
    expect(() => validateFungalRuntimeAuthority(authority)).not.toThrow()
    expect(() =>
      createDormantAspergillusNo10RuntimeAuthority(71),
    ).toThrow(/unsupported Aspergillus/)
  })

  it('keeps disabled and dormant v1 state explicitly non-executable', () => {
    for (const authority of [
      createDisabledFungalRuntimeAuthority(),
      createDormantAspergillusNo10RuntimeAuthority(40),
    ]) {
      const envelope = createDormantFungalRuntimeStateEnvelope(authority)
      expect(envelope).toEqual({
        schemaVersion: FUNGAL_RUNTIME_STATE_ENVELOPE_SCHEMA_VERSION,
        authority,
        acceptedComposedPosition: null,
        mechanismState: null,
      })
      expect(() =>
        validateFungalRuntimeStateEnvelope(envelope),
      ).not.toThrow()
      expect(restoreFungalRuntimeStateEnvelope(envelope)).toEqual(envelope)
    }
  })

  it('fails closed on stale identities, treatment drift, live-state claims, and unknown fields', () => {
    const valid = createDormantAspergillusNo10RuntimeAuthority(120)

    expect(() =>
      validateFungalRuntimeAuthority({
        ...valid,
        taxonContentVersion: 'stale-content-version',
      } as typeof valid),
    ).toThrow(/identity mismatch/)

    expect(() =>
      validateFungalRuntimeAuthority({
        ...valid,
        treatmentId: 'foreign-treatment',
      }),
    ).toThrow(/treatment identity mismatch/)

    expect(() =>
      validateFungalRuntimeAuthority({
        ...valid,
        colonyRadiusUnit: 'px',
      } as never),
    ).toThrow(/unit\/meaning contract mismatch/)

    expect(() =>
      validateFungalRuntimeAuthority({
        ...valid,
        extra: true,
      } as typeof valid),
    ).toThrow(/keys must be exactly/)

    expect(() =>
      validateFungalRuntimeStateEnvelope({
        schemaVersion: FUNGAL_RUNTIME_STATE_ENVELOPE_SCHEMA_VERSION,
        authority: valid,
        acceptedComposedPosition: {
          fake: 'position',
        },
        mechanismState: null,
      } as never),
    ).toThrow(/cannot claim an accepted composed position/)

    expect(() =>
      validateFungalRuntimeStateEnvelope({
        schemaVersion: FUNGAL_RUNTIME_STATE_ENVELOPE_SCHEMA_VERSION,
        authority: valid,
        acceptedComposedPosition: null,
        mechanismState: {
          fake: 'fungal state',
        },
      } as never),
    ).toThrow(/cannot carry executable mechanism state/)
  })

  it('clones and canonicalizes without widening dormant authority', () => {
    const authority = createDormantAspergillusNo10RuntimeAuthority(300)
    const cloned = cloneFungalRuntimeAuthority(authority)

    expect(cloned).toEqual(authority)
    expect(cloned).not.toBe(authority)
    expect(fungalRuntimeAuthorityCanonicalIdentity(cloned)).toBe(
      fungalRuntimeAuthorityCanonicalIdentity(authority),
    )
    const identity = fungalRuntimeAuthorityCanonicalIdentity(authority)
    expect(JSON.stringify(JSON.parse(identity))).not.toContain('model-resource')
    expect(JSON.stringify(JSON.parse(identity))).not.toContain('model-biomass')
    expect(
      fungalRuntimeAuthorityCanonicalIdentity(
        createDormantAspergillusNo10RuntimeAuthority(120),
      ),
    ).not.toBe(identity)
    expect(
      fungalRuntimeAuthorityCanonicalIdentity(
        createDisabledFungalRuntimeAuthority(),
      ),
    ).not.toBe(identity)
  })
})
