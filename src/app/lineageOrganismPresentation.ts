import {
  parseOrganismPresentationIdentity,
  type OrganismPresentationIdentity,
} from "../render/organismPresentationIdentity";
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
  validateRuntimeLineageTaxonMap,
  type AuthoritativeTaxonIdentity,
  type AuthoritativeTaxonRegistry,
  type RuntimeLineageTaxonMap,
} from "../sim/taxonIdentity";

export const ORGANISM_PRESENTATION_TAXON_CATALOG_SCHEMA_VERSION = 1 as const;
export const LINEAGE_ORGANISM_PRESENTATION_PROJECTION_SCHEMA_VERSION = 1 as const;

export interface OrganismPresentationTaxonBinding {
  readonly taxonId: string;
  readonly presentation: OrganismPresentationIdentity;
}

export interface OrganismPresentationTaxonCatalog {
  readonly schemaVersion: typeof ORGANISM_PRESENTATION_TAXON_CATALOG_SCHEMA_VERSION;
  readonly bindings: readonly OrganismPresentationTaxonBinding[];
}

export interface LineageOrganismPresentation {
  readonly lineageId: string;
  readonly taxonId: string;
  /**
   * Null is an intentional fail-closed result: biological identity is known,
   * but no source-backed coarse morphology is registered for that taxon.
   */
  readonly presentation: OrganismPresentationIdentity | null;
}

export interface LineageOrganismPresentationProjection {
  readonly schemaVersion: typeof LINEAGE_ORGANISM_PRESENTATION_PROJECTION_SCHEMA_VERSION;
  readonly lineages: readonly LineageOrganismPresentation[];
}

/**
 * Build a presentation-only catalog keyed by exact simulation-owned taxon id.
 *
 * Taxon biological identity and morphology evidence remain separate contracts.
 * A coarse microbialGroup such as "bacterium" or "fungus" never selects a
 * renderer primitive.
 */
export function createOrganismPresentationTaxonCatalog(args: {
  readonly taxonRegistry: AuthoritativeTaxonRegistry;
  readonly bindings: readonly OrganismPresentationTaxonBinding[];
}): OrganismPresentationTaxonCatalog {
  const taxaById = validatedTaxaById(args.taxonRegistry);
  if (!Array.isArray(args.bindings)) {
    throw new TypeError("organism presentation taxon bindings must be an array");
  }

  const seenTaxonIds = new Set<string>();
  const seenPresentationIds = new Set<string>();
  const bindings: OrganismPresentationTaxonBinding[] = [];

  for (let index = 0; index < args.bindings.length; index += 1) {
    if (!(index in args.bindings)) {
      throw new TypeError("organism presentation taxon bindings must be dense");
    }
    const candidate = requireRecord(
      args.bindings[index],
      `organism presentation taxon binding[${index}]`,
    );
    assertExactKeys(
      candidate,
      new Set(["taxonId", "presentation"]),
      `organism presentation taxon binding[${index}]`,
    );

    const taxonId = canonicalNonEmptyString(
      candidate.taxonId,
      `organism presentation taxon binding[${index}].taxonId`,
    );
    if (seenTaxonIds.has(taxonId)) {
      throw new RangeError(
        `duplicate organism presentation binding for taxon ${taxonId}`,
      );
    }
    const taxon = taxaById.get(taxonId);
    if (taxon === undefined) {
      throw new RangeError(
        `organism presentation binding references unknown taxon ${taxonId}`,
      );
    }

    const presentation = parseOrganismPresentationIdentity(
      structuredClone(candidate.presentation),
    );
    assertPresentationMatchesTaxon(presentation, taxon);

    if (seenPresentationIds.has(presentation.id)) {
      throw new RangeError(
        `organism presentation identity ${presentation.id} is bound more than once`,
      );
    }

    seenTaxonIds.add(taxonId);
    seenPresentationIds.add(presentation.id);
    bindings.push(Object.freeze({ taxonId, presentation }));
  }

  return Object.freeze({
    schemaVersion: ORGANISM_PRESENTATION_TAXON_CATALOG_SCHEMA_VERSION,
    bindings: Object.freeze(bindings),
  });
}

/**
 * Resolve one exact biological taxon to presentation evidence.
 *
 * Missing evidence is not an error and never falls back to microbialGroup,
 * scientific-name heuristics, lineage names, colors, or array position.
 */
export function resolveOrganismPresentationForTaxon(
  catalog: OrganismPresentationTaxonCatalog,
  taxonRegistry: AuthoritativeTaxonRegistry,
  taxonId: string,
): OrganismPresentationIdentity | null {
  canonicalNonEmptyString(taxonId, "organism presentation lookup taxon id");
  validateOrganismPresentationTaxonCatalog(catalog, taxonRegistry);
  const binding = catalog.bindings.find((entry) => entry.taxonId === taxonId);
  return binding?.presentation ?? null;
}

/**
 * Project exact runtime lineage→taxon authority into detached presentation
 * evidence for the same authoritative lineage order.
 *
 * expectedRuntimeLineageIds is required deliberately: a caller must prove the
 * taxon map belongs to the same authoritative state channels it is presenting.
 */
export function projectLineageOrganismPresentations(args: {
  readonly taxonRegistry: AuthoritativeTaxonRegistry;
  readonly lineageTaxonMap: RuntimeLineageTaxonMap;
  readonly presentationCatalog: OrganismPresentationTaxonCatalog;
  readonly expectedRuntimeLineageIds: readonly string[];
}): LineageOrganismPresentationProjection {
  validateRuntimeLineageTaxonMap(
    args.lineageTaxonMap,
    args.taxonRegistry,
    args.expectedRuntimeLineageIds,
  );
  validateOrganismPresentationTaxonCatalog(
    args.presentationCatalog,
    args.taxonRegistry,
  );

  const presentationByTaxon = new Map(
    args.presentationCatalog.bindings.map(
      (binding) => [binding.taxonId, binding.presentation] as const,
    ),
  );

  const lineages = args.lineageTaxonMap.lineageIds.map(
    (lineageId, index): LineageOrganismPresentation =>
      Object.freeze({
        lineageId,
        taxonId: args.lineageTaxonMap.taxonIds[index]!,
        presentation:
          presentationByTaxon.get(args.lineageTaxonMap.taxonIds[index]!) ??
          null,
      }),
  );

  return Object.freeze({
    schemaVersion: LINEAGE_ORGANISM_PRESENTATION_PROJECTION_SCHEMA_VERSION,
    lineages: Object.freeze(lineages),
  });
}

export function validateOrganismPresentationTaxonCatalog(
  catalog: OrganismPresentationTaxonCatalog,
  taxonRegistry: AuthoritativeTaxonRegistry,
): void {
  const catalogRecord = requireRecord(
    catalog,
    "organism presentation taxon catalog",
  );
  assertExactKeys(
    catalogRecord,
    new Set(["schemaVersion", "bindings"]),
    "organism presentation taxon catalog",
  );
  if (
    catalog.schemaVersion !== ORGANISM_PRESENTATION_TAXON_CATALOG_SCHEMA_VERSION
  ) {
    throw new RangeError(
      `unsupported organism presentation taxon catalog schema version: ${catalog.schemaVersion}`,
    );
  }

  const taxaById = validatedTaxaById(taxonRegistry);
  if (!Array.isArray(catalog.bindings)) {
    throw new TypeError("organism presentation taxon catalog bindings must be an array");
  }

  const seenTaxonIds = new Set<string>();
  const seenPresentationIds = new Set<string>();
  for (let index = 0; index < catalog.bindings.length; index += 1) {
    if (!(index in catalog.bindings)) {
      throw new TypeError(
        "organism presentation taxon catalog bindings must be dense",
      );
    }
    const binding = requireRecord(
      catalog.bindings[index],
      `organism presentation taxon catalog binding[${index}]`,
    );
    assertExactKeys(
      binding,
      new Set(["taxonId", "presentation"]),
      `organism presentation taxon catalog binding[${index}]`,
    );
    const taxonId = canonicalNonEmptyString(
      binding.taxonId,
      `organism presentation taxon catalog binding[${index}].taxonId`,
    );
    if (seenTaxonIds.has(taxonId)) {
      throw new RangeError(
        `duplicate organism presentation binding for taxon ${taxonId}`,
      );
    }
    const taxon = taxaById.get(taxonId);
    if (taxon === undefined) {
      throw new RangeError(
        `organism presentation binding references unknown taxon ${taxonId}`,
      );
    }

    const presentation = parseOrganismPresentationIdentity(
      structuredClone(binding.presentation),
    );
    assertPresentationMatchesTaxon(presentation, taxon);
    if (seenPresentationIds.has(presentation.id)) {
      throw new RangeError(
        `organism presentation identity ${presentation.id} is bound more than once`,
      );
    }

    seenTaxonIds.add(taxonId);
    seenPresentationIds.add(presentation.id);
  }
}

export function assertPresentationMatchesTaxon(
  presentation: OrganismPresentationIdentity,
  taxon: AuthoritativeTaxonIdentity,
): void {
  if (presentation.scientificName !== taxon.scientificName) {
    throw new Error(
      "organism presentation scientific name does not match authoritative taxon identity",
    );
  }
  if (presentation.background !== taxon.background) {
    throw new Error(
      "organism presentation background does not match authoritative taxon identity",
    );
  }
  if (presentation.organismKind !== taxon.microbialGroup) {
    throw new Error(
      "organism presentation kind does not match authoritative microbial group",
    );
  }
}

function validatedTaxaById(
  registry: AuthoritativeTaxonRegistry,
): ReadonlyMap<string, AuthoritativeTaxonIdentity> {
  if (
    registry.schemaVersion !== AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION
  ) {
    throw new RangeError(
      `unsupported authoritative taxon registry schema version: ${registry.schemaVersion}`,
    );
  }

  const validated = createAuthoritativeTaxonRegistry(registry.taxa);
  return new Map(validated.taxa.map((taxon) => [taxon.id, taxon] as const));
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(
  record: Record<string, unknown>,
  expected: ReadonlySet<string>,
  name: string,
): void {
  const keys = Object.keys(record);
  if (
    keys.length !== expected.size ||
    keys.some((key) => !expected.has(key))
  ) {
    throw new TypeError(`${name} has an unexpected shape`);
  }
}

function canonicalNonEmptyString(value: unknown, name: string): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new TypeError(`${name} must be a canonical non-empty string`);
  }
  return value;
}
