export const AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION = 1 as const
export const RUNTIME_LINEAGE_TAXON_MAP_SCHEMA_VERSION = 1 as const

export const AUTHORITATIVE_MICROBIAL_GROUPS = [
  'bacterium',
  'fungus',
] as const

export type AuthoritativeMicrobialGroup =
  (typeof AUTHORITATIVE_MICROBIAL_GROUPS)[number]

export interface AuthoritativeTaxonIdentity {
  readonly schemaVersion: typeof AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION
  /**
   * Stable biological/content identity. This is not a renderer token.
   */
  readonly id: string
  readonly scientificName: string
  readonly background: string
  /**
   * Coarse biological compatibility category only. It does not authorize a
   * renderer morphology: bacteria may be rods/cocci/etc, and fungi may be
   * yeast-form/filamentous/etc only when separate presentation evidence says so.
   */
  readonly microbialGroup: AuthoritativeMicrobialGroup
  readonly provenance: Readonly<{
    readonly sourceKeys: readonly string[]
    readonly context: string
    readonly limitation?: string
  }>
}

export interface AuthoritativeTaxonRegistry {
  readonly schemaVersion: typeof AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION
  readonly taxa: readonly AuthoritativeTaxonIdentity[]
}

export interface RuntimeLineageTaxonMap {
  readonly schemaVersion: typeof RUNTIME_LINEAGE_TAXON_MAP_SCHEMA_VERSION
  /**
   * Exact runtime lineage order. This must align with authoritative composed
   * lineage channels when integrated into checkpoint state.
   */
  readonly lineageIds: readonly string[]
  readonly taxonIds: readonly string[]
}

function canonicalText(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be canonical with no surrounding whitespace`)
  }
}

function denseStringArray(name: string, values: unknown): asserts values is readonly string[] {
  if (!Array.isArray(values)) {
    throw new Error(`${name} must be an array`)
  }
  for (let index = 0; index < values.length; index += 1) {
    if (!(index in values)) {
      throw new Error(`${name} must be dense`)
    }
    canonicalText(`${name}[${index}]`, values[index])
  }
}

function cloneTaxon(
  taxon: AuthoritativeTaxonIdentity,
): AuthoritativeTaxonIdentity {
  const provenance = Object.freeze({
    sourceKeys: Object.freeze([...taxon.provenance.sourceKeys]),
    context: taxon.provenance.context,
    ...(taxon.provenance.limitation === undefined
      ? {}
      : { limitation: taxon.provenance.limitation }),
  })
  return Object.freeze({
    schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
    id: taxon.id,
    scientificName: taxon.scientificName,
    background: taxon.background,
    microbialGroup: taxon.microbialGroup,
    provenance,
  })
}

export function validateAuthoritativeTaxonIdentity(
  taxon: AuthoritativeTaxonIdentity,
): void {
  if (
    taxon.schemaVersion !== AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION
  ) {
    throw new Error(
      `unsupported taxon identity schema version: ${taxon.schemaVersion}`,
    )
  }
  canonicalText('taxon id', taxon.id)
  canonicalText('taxon scientificName', taxon.scientificName)
  canonicalText('taxon background', taxon.background)

  if (
    !(AUTHORITATIVE_MICROBIAL_GROUPS as readonly string[]).includes(
      taxon.microbialGroup,
    )
  ) {
    throw new Error(
      `unsupported authoritative microbial group: ${String(taxon.microbialGroup)}`,
    )
  }

  if (
    taxon.provenance === null ||
    typeof taxon.provenance !== 'object'
  ) {
    throw new Error('taxon provenance must be an object')
  }
  denseStringArray('taxon provenance sourceKeys', taxon.provenance.sourceKeys)
  if (taxon.provenance.sourceKeys.length === 0) {
    throw new Error('taxon provenance sourceKeys must not be empty')
  }
  if (
    new Set(taxon.provenance.sourceKeys).size !==
    taxon.provenance.sourceKeys.length
  ) {
    throw new Error('taxon provenance sourceKeys must be unique')
  }
  canonicalText('taxon provenance context', taxon.provenance.context)
  if (taxon.provenance.limitation !== undefined) {
    canonicalText('taxon provenance limitation', taxon.provenance.limitation)
  }
}

export function createAuthoritativeTaxonRegistry(
  taxa: readonly AuthoritativeTaxonIdentity[],
): AuthoritativeTaxonRegistry {
  if (!Array.isArray(taxa)) {
    throw new Error('authoritative taxa must be an array')
  }
  const ids = new Set<string>()
  const identities = new Set<string>()
  const cloned: AuthoritativeTaxonIdentity[] = []

  for (let index = 0; index < taxa.length; index += 1) {
    if (!(index in taxa)) {
      throw new Error('authoritative taxa must be a dense array')
    }
    const taxon = taxa[index]!
    validateAuthoritativeTaxonIdentity(taxon)

    if (ids.has(taxon.id)) {
      throw new Error(`duplicate authoritative taxon id: ${taxon.id}`)
    }
    ids.add(taxon.id)

    const exactIdentity = JSON.stringify([
      taxon.scientificName,
      taxon.background,
    ])
    if (identities.has(exactIdentity)) {
      throw new Error(
        `duplicate authoritative taxon biological identity: ${taxon.scientificName} / ${taxon.background}`,
      )
    }
    identities.add(exactIdentity)
    cloned.push(cloneTaxon(taxon))
  }

  return Object.freeze({
    schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
    taxa: Object.freeze(cloned),
  })
}

function taxonIds(
  registry: AuthoritativeTaxonRegistry,
): ReadonlySet<string> {
  if (
    registry.schemaVersion !== AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION
  ) {
    throw new Error(
      `unsupported taxon registry schema version: ${registry.schemaVersion}`,
    )
  }
  const ids = new Set<string>()
  const biologicalIdentities = new Set<string>()
  for (let index = 0; index < registry.taxa.length; index += 1) {
    if (!(index in registry.taxa)) {
      throw new Error('taxon registry taxa must be dense')
    }
    const taxon = registry.taxa[index]!
    validateAuthoritativeTaxonIdentity(taxon)
    if (ids.has(taxon.id)) {
      throw new Error(`duplicate authoritative taxon id: ${taxon.id}`)
    }
    ids.add(taxon.id)

    const exactIdentity = JSON.stringify([
      taxon.scientificName,
      taxon.background,
    ])
    if (biologicalIdentities.has(exactIdentity)) {
      throw new Error(
        `duplicate authoritative taxon biological identity: ${taxon.scientificName} / ${taxon.background}`,
      )
    }
    biologicalIdentities.add(exactIdentity)
  }
  return ids
}

export function validateRuntimeLineageTaxonMap(
  mapping: RuntimeLineageTaxonMap,
  registry: AuthoritativeTaxonRegistry,
  expectedRuntimeLineageIds?: readonly string[],
): void {
  if (
    mapping.schemaVersion !== RUNTIME_LINEAGE_TAXON_MAP_SCHEMA_VERSION
  ) {
    throw new Error(
      `unsupported runtime lineage taxon map version: ${mapping.schemaVersion}`,
    )
  }
  denseStringArray('runtime lineage ids', mapping.lineageIds)
  denseStringArray('runtime lineage taxon ids', mapping.taxonIds)

  if (mapping.lineageIds.length !== mapping.taxonIds.length) {
    throw new Error(
      'runtime lineage ids and taxon ids must have identical lengths',
    )
  }
  if (new Set(mapping.lineageIds).size !== mapping.lineageIds.length) {
    throw new Error('runtime lineage ids must be unique')
  }

  const knownTaxonIds = taxonIds(registry)
  for (let index = 0; index < mapping.taxonIds.length; index += 1) {
    const taxonId = mapping.taxonIds[index]!
    if (!knownTaxonIds.has(taxonId)) {
      throw new Error(
        `runtime lineage ${mapping.lineageIds[index]} references unknown taxon ${taxonId}`,
      )
    }
  }

  if (expectedRuntimeLineageIds !== undefined) {
    denseStringArray(
      'expected runtime lineage ids',
      expectedRuntimeLineageIds,
    )
    if (expectedRuntimeLineageIds.length !== mapping.lineageIds.length) {
      throw new Error(
        'runtime lineage taxon map does not cover every expected lineage',
      )
    }
    for (let index = 0; index < expectedRuntimeLineageIds.length; index += 1) {
      if (mapping.lineageIds[index] !== expectedRuntimeLineageIds[index]) {
        throw new Error(
          `runtime lineage taxon order mismatch at index ${index}`,
        )
      }
    }
  }
}

export function createRuntimeLineageTaxonMap(args: {
  readonly lineageIds: readonly string[]
  readonly taxonIds: readonly string[]
  readonly registry: AuthoritativeTaxonRegistry
}): RuntimeLineageTaxonMap {
  const mapping: RuntimeLineageTaxonMap = {
    schemaVersion: RUNTIME_LINEAGE_TAXON_MAP_SCHEMA_VERSION,
    lineageIds: args.lineageIds,
    taxonIds: args.taxonIds,
  }
  validateRuntimeLineageTaxonMap(mapping, args.registry, args.lineageIds)
  return Object.freeze({
    schemaVersion: RUNTIME_LINEAGE_TAXON_MAP_SCHEMA_VERSION,
    lineageIds: Object.freeze([...args.lineageIds]),
    taxonIds: Object.freeze([...args.taxonIds]),
  })
}

export function extendRuntimeLineageTaxonMap(args: {
  readonly current: RuntimeLineageTaxonMap
  readonly registry: AuthoritativeTaxonRegistry
  readonly appended: readonly Readonly<{
    readonly lineageId: string
    readonly taxonId: string
  }>[]
}): RuntimeLineageTaxonMap {
  validateRuntimeLineageTaxonMap(args.current, args.registry)

  if (!Array.isArray(args.appended)) {
    throw new Error('appended lineage taxon assignments must be an array')
  }

  const lineageIds = [...args.current.lineageIds]
  const taxonIds = [...args.current.taxonIds]
  const seenLineages = new Set(lineageIds)
  const knownTaxa = taxonIdsForLookup(args.registry)

  for (let index = 0; index < args.appended.length; index += 1) {
    if (!(index in args.appended)) {
      throw new Error('appended lineage taxon assignments must be dense')
    }
    const entry = args.appended[index]!
    canonicalText(`appended lineage id at index ${index}`, entry.lineageId)
    canonicalText(`appended taxon id at index ${index}`, entry.taxonId)
    if (seenLineages.has(entry.lineageId)) {
      throw new Error(
        `runtime lineage taxon extension duplicates lineage id: ${entry.lineageId}`,
      )
    }
    if (!knownTaxa.has(entry.taxonId)) {
      throw new Error(
        `runtime lineage taxon extension references unknown taxon: ${entry.taxonId}`,
      )
    }
    seenLineages.add(entry.lineageId)
    lineageIds.push(entry.lineageId)
    taxonIds.push(entry.taxonId)
  }

  return createRuntimeLineageTaxonMap({
    lineageIds,
    taxonIds,
    registry: args.registry,
  })
}

function taxonIdsForLookup(
  registry: AuthoritativeTaxonRegistry,
): ReadonlySet<string> {
  return taxonIds(registry)
}

export function taxonIdForRuntimeLineage(
  mapping: RuntimeLineageTaxonMap,
  registry: AuthoritativeTaxonRegistry,
  lineageId: string,
): string {
  canonicalText('runtime lineage lookup id', lineageId)
  validateRuntimeLineageTaxonMap(mapping, registry)
  const index = mapping.lineageIds.indexOf(lineageId)
  if (index < 0) {
    throw new Error(`unknown runtime lineage id: ${lineageId}`)
  }
  return mapping.taxonIds[index]!
}

export function assertRuntimeLineageTaxonPrefixPreserved(
  previous: RuntimeLineageTaxonMap,
  next: RuntimeLineageTaxonMap,
  registry: AuthoritativeTaxonRegistry,
): void {
  validateRuntimeLineageTaxonMap(previous, registry)
  validateRuntimeLineageTaxonMap(next, registry)

  if (next.lineageIds.length < previous.lineageIds.length) {
    throw new Error('runtime lineage taxon map cannot shrink')
  }
  for (let index = 0; index < previous.lineageIds.length; index += 1) {
    if (
      previous.lineageIds[index] !== next.lineageIds[index] ||
      previous.taxonIds[index] !== next.taxonIds[index]
    ) {
      throw new Error(
        `runtime lineage taxon prefix changed at index ${index}`,
      )
    }
  }
}
