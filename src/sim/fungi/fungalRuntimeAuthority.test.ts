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
  type DormantAspergillusNo10RuntimeAuthority,
} from './fungalRuntimeAuthority'

/**
 * A dormant authority that deviates from the live production type only by a
 * widened `taxonContentVersion`. That is the shape a checkpoint written against
 * a superseded content revision actually has on the wire; the narrowed
 * production literal type cannot express it, so stale-load tests must.
 */
type StaleContentVersionDormantAuthority = Omit<
  DormantAspergillusNo10RuntimeAuthority,
  'taxonContentVersion'
> & { readonly taxonContentVersion: string }

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

    // A stale checkpoint carries the same source-pack identity at a superseded
    // content revision (`..._v1` -> `..._v0`), so it is well-formed apart from
    // that one field and the identity check must still refuse it.
    const staleContentRevision: StaleContentVersionDormantAuthority = {
      ...valid,
      taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION.replace(
        /_v1$/,
        '_v0',
      ),
    }
    expect(staleContentRevision.taxonContentVersion).not.toBe(
      ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
    )

    expect(() =>
      validateFungalRuntimeAuthority(
        staleContentRevision as DormantAspergillusNo10RuntimeAuthority,
      ),
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
    expect(
      fungalRuntimeAuthorityCanonicalIdentity(
        createDisabledFungalRuntimeAuthority(),
      ),
    ).not.toBe(fungalRuntimeAuthorityCanonicalIdentity(authority))
  })
})
