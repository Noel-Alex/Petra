export const ORGANISM_PRESENTATION_IDENTITY_SCHEMA_VERSION = 1 as const;

export type PresentationOrganismKind = "bacterium";
export type CoarseOrganismMorphology = "rod";
export type OrganismPresentationEvidenceClass = "transferred";
export type OrganismPresentationScope = "representative-cell";

export interface OrganismPresentationProvenance {
  readonly classification: OrganismPresentationEvidenceClass;
  readonly sourceKey: string;
  readonly doi: string;
  readonly context: string;
  readonly transferNote: string;
  readonly limitation: string;
}

export interface OrganismPresentationIdentity {
  readonly schemaVersion: typeof ORGANISM_PRESENTATION_IDENTITY_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly scientificName: string;
  readonly background: string;
  readonly organismKind: PresentationOrganismKind;
  readonly morphology: CoarseOrganismMorphology;
  readonly scope: OrganismPresentationScope;
  readonly provenance: OrganismPresentationProvenance;
}

const ROOT_KEYS = new Set([
  "schemaVersion",
  "id",
  "version",
  "scientificName",
  "background",
  "organismKind",
  "morphology",
  "scope",
  "provenance",
]);

const PROVENANCE_KEYS = new Set([
  "classification",
  "sourceKey",
  "doi",
  "context",
  "transferNote",
  "limitation",
]);

/**
 * Promotes source-backed organism presentation metadata into a strict render
 * contract. This identity is presentation evidence only: it is not simulation,
 * checkpoint, replay, population-count, or physical-geometry authority.
 *
 * Schema v1 is intentionally narrow. It authorizes only the currently
 * evidenced E. coli-style representative rod silhouette. New morphology kinds
 * require a reviewed schema/evidence extension rather than runtime inference.
 */
export function parseOrganismPresentationIdentity(
  value: unknown,
): OrganismPresentationIdentity {
  const record = requireRecord("organismPresentationIdentity", value);
  assertOnlyKnownKeys("organismPresentationIdentity", record, ROOT_KEYS);

  if (record.schemaVersion !== ORGANISM_PRESENTATION_IDENTITY_SCHEMA_VERSION) {
    throw new Error(
      `unsupported organism presentation identity schema version: ${String(record.schemaVersion)}`,
    );
  }

  const provenance = requireRecord(
    "organismPresentationIdentity.provenance",
    record.provenance,
  );
  assertOnlyKnownKeys(
    "organismPresentationIdentity.provenance",
    provenance,
    PROVENANCE_KEYS,
  );

  if (record.organismKind !== "bacterium") {
    throw new Error("organismPresentationIdentity.organismKind is unsupported");
  }
  if (record.morphology !== "rod") {
    throw new Error("organismPresentationIdentity.morphology is unsupported");
  }
  if (record.scope !== "representative-cell") {
    throw new Error("organismPresentationIdentity.scope is unsupported");
  }
  if (provenance.classification !== "transferred") {
    throw new Error(
      "organismPresentationIdentity.provenance.classification must be transferred",
    );
  }

  const parsed: OrganismPresentationIdentity = {
    schemaVersion: ORGANISM_PRESENTATION_IDENTITY_SCHEMA_VERSION,
    id: requireCanonicalText("organismPresentationIdentity.id", record.id),
    version: requireCanonicalText(
      "organismPresentationIdentity.version",
      record.version,
    ),
    scientificName: requireCanonicalText(
      "organismPresentationIdentity.scientificName",
      record.scientificName,
    ),
    background: requireCanonicalText(
      "organismPresentationIdentity.background",
      record.background,
    ),
    organismKind: "bacterium",
    morphology: "rod",
    scope: "representative-cell",
    provenance: {
      classification: "transferred",
      sourceKey: requireCanonicalText(
        "organismPresentationIdentity.provenance.sourceKey",
        provenance.sourceKey,
      ),
      doi: requireDoi(
        "organismPresentationIdentity.provenance.doi",
        provenance.doi,
      ),
      context: requireCanonicalText(
        "organismPresentationIdentity.provenance.context",
        provenance.context,
      ),
      transferNote: requireCanonicalText(
        "organismPresentationIdentity.provenance.transferNote",
        provenance.transferNote,
      ),
      limitation: requireCanonicalText(
        "organismPresentationIdentity.provenance.limitation",
        provenance.limitation,
      ),
    },
  };

  return Object.freeze({
    ...parsed,
    provenance: Object.freeze({ ...parsed.provenance }),
  });
}

/**
 * Presentation-domain identity only. Do not include this key in simulation
 * configuration fingerprints or checkpoint/replay identity.
 */
export function organismPresentationIdentityKey(
  value: OrganismPresentationIdentity,
): string {
  const parsed = parseOrganismPresentationIdentity(value);
  return `${parsed.id}@${parsed.version}`;
}

function requireRecord(
  name: string,
  value: unknown,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyKnownKeys(
  name: string,
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unsupported field: ${key}`);
    }
  }
}

function requireCanonicalText(name: string, value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be trimmed`);
  }
  return value;
}

function requireDoi(name: string, value: unknown): string {
  const doi = requireCanonicalText(name, value);
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) {
    throw new Error(`${name} must be a canonical DOI`);
  }
  return doi;
}
