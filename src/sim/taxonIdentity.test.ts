import { describe, expect, it } from 'vitest'
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  RUNTIME_LINEAGE_TAXON_MAP_SCHEMA_VERSION,
  assertRuntimeLineageTaxonPrefixPreserved,
  createAuthoritativeTaxonRegistry,
  createRuntimeLineageTaxonMap,
  extendRuntimeLineageTaxonMap,
  taxonIdForRuntimeLineage,
  type AuthoritativeTaxonIdentity,
} from './taxonIdentity'

const ecoli: AuthoritativeTaxonIdentity = {
  schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  id: 'ecoli-k12-mg1655',
  scientificName: 'Escherichia coli',
  background: 'K-12 MG1655',
  microbialGroup: 'bacterium',
  provenance: {
    sourceKeys: ['fixture:ecoli-taxonomy'],
    context: 'Test fixture mirroring a named E. coli background.',
  },
}

const fungus: AuthoritativeTaxonIdentity = {
  schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  id: 'fungus-fixture',
  scientificName: 'Example fungus',
  background: 'fixture isolate',
  microbialGroup: 'fungus',
  provenance: {
    sourceKeys: ['fixture:fungus-taxonomy'],
    context: 'Test-only named fungal identity.',
    limitation: 'Not a Petra science pack.',
  },
}

describe('authoritative taxon identity', () => {
  it('creates a detached provenance-bearing biological registry', () => {
    const mutableSourceKeys = ['fixture:ecoli-taxonomy']
    const registry = createAuthoritativeTaxonRegistry([
      {
        ...ecoli,
        provenance: {
          ...ecoli.provenance,
          sourceKeys: mutableSourceKeys,
        },
      },
      fungus,
    ])

    expect(registry.schemaVersion).toBe(
      AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
    )
    expect(registry.taxa.map((taxon) => taxon.id)).toEqual([
      'ecoli-k12-mg1655',
      'fungus-fixture',
    ])

    mutableSourceKeys[0] = 'mutated'
    expect(registry.taxa[0]!.provenance.sourceKeys).toEqual([
      'fixture:ecoli-taxonomy',
    ])
  })

  it('refuses aliases, duplicate identities, missing provenance, and unsupported groups', () => {
    expect(() =>
      createAuthoritativeTaxonRegistry([
        {
          ...ecoli,
          id: ' ecoli-k12-mg1655 ',
        },
      ]),
    ).toThrow(/canonical/)

    expect(() =>
      createAuthoritativeTaxonRegistry([
        ecoli,
        { ...ecoli, id: 'ecoli-duplicate' },
      ]),
    ).toThrow(/duplicate authoritative taxon biological identity/)

    expect(() =>
      createAuthoritativeTaxonRegistry([
        {
          ...ecoli,
          provenance: { ...ecoli.provenance, sourceKeys: [] },
        },
      ]),
    ).toThrow(/sourceKeys must not be empty/)

    expect(() =>
      createAuthoritativeTaxonRegistry([
        {
          ...ecoli,
          microbialGroup: 'virus' as never,
        },
      ]),
    ).toThrow(/unsupported authoritative microbial group/)
  })
})

describe('runtime lineage taxon map', () => {
  const registry = createAuthoritativeTaxonRegistry([ecoli, fungus])

  it('binds exact ordered runtime lineages to known taxa', () => {
    const mapping = createRuntimeLineageTaxonMap({
      lineageIds: ['L1', 'L2'],
      taxonIds: ['ecoli-k12-mg1655', 'fungus-fixture'],
      registry,
    })

    expect(mapping.schemaVersion).toBe(
      RUNTIME_LINEAGE_TAXON_MAP_SCHEMA_VERSION,
    )
    expect(taxonIdForRuntimeLineage(mapping, registry, 'L1')).toBe(
      'ecoli-k12-mg1655',
    )
    expect(taxonIdForRuntimeLineage(mapping, registry, 'L2')).toBe(
      'fungus-fixture',
    )
  })

  it('fails closed on unknown taxa, duplicate lineage ids, or expected-order drift', () => {
    expect(() =>
      createRuntimeLineageTaxonMap({
        lineageIds: ['L1'],
        taxonIds: ['unknown'],
        registry,
      }),
    ).toThrow(/unknown taxon/)

    expect(() =>
      createRuntimeLineageTaxonMap({
        lineageIds: ['L1', 'L1'],
        taxonIds: ['ecoli-k12-mg1655', 'ecoli-k12-mg1655'],
        registry,
      }),
    ).toThrow(/lineage ids must be unique/)

    const mapping = createRuntimeLineageTaxonMap({
      lineageIds: ['L1', 'L2'],
      taxonIds: ['ecoli-k12-mg1655', 'fungus-fixture'],
      registry,
    })
    const swapped = {
      ...mapping,
      lineageIds: ['L2', 'L1'],
    }
    expect(() =>
      assertRuntimeLineageTaxonPrefixPreserved(mapping, swapped, registry),
    ).toThrow(/prefix changed/)
  })

  it('extends dynamic lineage identity append-only without inferring a taxon', () => {
    const founder = createRuntimeLineageTaxonMap({
      lineageIds: ['L1'],
      taxonIds: ['ecoli-k12-mg1655'],
      registry,
    })

    const next = extendRuntimeLineageTaxonMap({
      current: founder,
      registry,
      appended: [
        { lineageId: 'L2', taxonId: 'ecoli-k12-mg1655' },
        { lineageId: 'L3', taxonId: 'fungus-fixture' },
      ],
    })

    expect(next.lineageIds).toEqual(['L1', 'L2', 'L3'])
    expect(next.taxonIds).toEqual([
      'ecoli-k12-mg1655',
      'ecoli-k12-mg1655',
      'fungus-fixture',
    ])
    expect(() =>
      assertRuntimeLineageTaxonPrefixPreserved(founder, next, registry),
    ).not.toThrow()

    expect(() =>
      extendRuntimeLineageTaxonMap({
        current: founder,
        registry,
        appended: [{ lineageId: 'L2', taxonId: 'unknown' }],
      }),
    ).toThrow(/unknown taxon/)

    expect(() =>
      extendRuntimeLineageTaxonMap({
        current: founder,
        registry,
        appended: [{ lineageId: 'L1', taxonId: 'fungus-fixture' }],
      }),
    ).toThrow(/duplicates lineage id/)
  })

  it('detects any mutation of existing lineage-to-taxon assignments', () => {
    const previous = createRuntimeLineageTaxonMap({
      lineageIds: ['L1', 'L2'],
      taxonIds: ['ecoli-k12-mg1655', 'fungus-fixture'],
      registry,
    })
    const changed = createRuntimeLineageTaxonMap({
      lineageIds: ['L1', 'L2', 'L3'],
      taxonIds: [
        'fungus-fixture',
        'fungus-fixture',
        'ecoli-k12-mg1655',
      ],
      registry,
    })

    expect(() =>
      assertRuntimeLineageTaxonPrefixPreserved(previous, changed, registry),
    ).toThrow(/prefix changed at index 0/)
  })
})
