import rawFlagshipIdentity from "../../data/presentation/ecoli_k12_mg1655_v1.json";

export const ORGANISM_PRESENTATION_IDENTITY_SCHEMA_VERSION = 1 as const;
export const ORGANISM_PRESENTATION_IDENTITY_KIND =
  "petra-organism-presentation-identity" as const;

export const ORGANISM_PRESENTATION_KINDS = ["bacterium"] as const;
export type OrganismPresentationKind =
  (typeof ORGANISM_PRESENTATION_KINDS)[number];

export const ORGANISM_PRESENTATION_MORPHOLOGIES = ["rod"] as const;
export type OrganismPresentationMorphology =
  (typeof ORGANISM_PRESENTATION_MORPHOLOGIES)[number];

export const PRESENTATION_EVIDENCE_CLASSIFICATIONS = [
  "measured",
  "transferred",
] as const;
export type PresentationEvidenceClassification =
  (typeof PRESENTATION_EVIDENCE_CLASSIFICATIONS)[number];

export interface OrganismPresentationSource {
  readonly key: string;
  readonly doi: string;
  readonly context: string;
}

export interface OrganismPresentationProvenance {
  readonly classification: PresentationEvidenceClassification;
  readonly sources: readonly OrganismPresentationSource[];
  readonly context: string;
  readonly transferNote: string;
  readonly limitation: string;
}

/**
 * Presentation evidence for a coarse representative organism silhouette.
 *
 * This record is not simulation/checkpoint/replay authority. It never carries
 * physical cell dimensions, population counts, biological rates, or dynamics.
 */
export interface OrganismPresentationIdentity {
  readonly kind: typeof ORGANISM_PRESENTATION_IDENTITY_KIND;
  readonly schemaVersion: typeof ORGANISM_PRESENTATION_IDENTITY_SCHEMA_VERSION;
  readonly id: string;
  readonly scientificName: string;
  readonly background: string;
  readonly organismKind: OrganismPresentationKind;
  readonly morphology: OrganismPresentationMorphology;
  readonly provenance: OrganismPresentationProvenance;
}

const TOP_LEVEL_KEYS = new Set([
  "kind",
  "schemaVersion",
  "id",
  "scientificName",
  "background",
  "organismKind",
  "morphology",
  "provenance",
]);

const PROVENANCE_KEYS = new Set([
  "classification",
  "sources",
  "context",
  "transferNote",
  "limitation",
]);

const SOURCE_KEYS = new Set(["key", "doi", "context"]);

/**
 * Promote untrusted presentation-evidence data into Petra's strict renderer
 * contract. The parser validates explicit metadata only; it never infers
 * morphology from a taxon string, lineage name, color, density, or simulation
 * state.
 */
export function parseOrganismPresentationIdentity(
  value: unknown,
): OrganismPresentationIdentity {
  const record = requireRecord(value, "organism presentation identity");
  assertExactKeys(record, TOP_LEVEL_KEYS, "organism presentation identity");

  if (record.kind !== ORGANISM_PRESENTATION_IDENTITY_KIND) {
    throw new TypeError("unsupported organism presentation identity kind");
  }
  if (
    record.schemaVersion !== ORGANISM_PRESENTATION_IDENTITY_SCHEMA_VERSION
  ) {
    throw new TypeError(
      "unsupported organism presentation identity schema version",
    );
  }

  const id = canonicalNonEmptyString(record.id, "identity id");
  const scientificName = canonicalNonEmptyString(
    record.scientificName,
    "scientificName",
  );
  const background = canonicalNonEmptyString(record.background, "background");

  if (
    typeof record.organismKind !== "string" ||
    !(ORGANISM_PRESENTATION_KINDS as readonly string[]).includes(
      record.organismKind,
    )
  ) {
    throw new TypeError("unsupported organism presentation kind");
  }
  if (
    typeof record.morphology !== "string" ||
    !(ORGANISM_PRESENTATION_MORPHOLOGIES as readonly string[]).includes(
      record.morphology,
    )
  ) {
    throw new TypeError("unsupported organism presentation morphology");
  }

  const rawProvenance = requireRecord(record.provenance, "provenance");
  assertExactKeys(rawProvenance, PROVENANCE_KEYS, "provenance");

  if (
    typeof rawProvenance.classification !== "string" ||
    !(
      PRESENTATION_EVIDENCE_CLASSIFICATIONS as readonly string[]
    ).includes(rawProvenance.classification)
  ) {
    throw new TypeError("unsupported presentation evidence classification");
  }

  if (!Array.isArray(rawProvenance.sources) || rawProvenance.sources.length === 0) {
    throw new TypeError("presentation provenance requires at least one source");
  }

  const sourceKeys = new Set<string>();
  const sourceDois = new Set<string>();
  const sources: OrganismPresentationSource[] = [];
  for (let index = 0; index < rawProvenance.sources.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(rawProvenance.sources, index)) {
      throw new TypeError(
        `presentation provenance sources must be dense; missing index ${index}`,
      );
    }
    const source = requireRecord(
      rawProvenance.sources[index],
      `sources[${index}]`,
    );
    assertExactKeys(source, SOURCE_KEYS, `sources[${index}]`);
    const key = canonicalNonEmptyString(source.key, `sources[${index}].key`);
    const doi = canonicalDoi(source.doi, `sources[${index}].doi`);
    const context = canonicalNonEmptyString(
      source.context,
      `sources[${index}].context`,
    );

    if (sourceKeys.has(key)) {
      throw new RangeError("presentation provenance source keys must be unique");
    }
    if (sourceDois.has(doi)) {
      throw new RangeError("presentation provenance source DOIs must be unique");
    }
    sourceKeys.add(key);
    sourceDois.add(doi);
    sources.push(Object.freeze({ key, doi, context }));
  }

  const provenance: OrganismPresentationProvenance = Object.freeze({
    classification:
      rawProvenance.classification as PresentationEvidenceClassification,
    sources: Object.freeze(sources),
    context: canonicalNonEmptyString(
      rawProvenance.context,
      "provenance.context",
    ),
    transferNote: canonicalNonEmptyString(
      rawProvenance.transferNote,
      "provenance.transferNote",
    ),
    limitation: canonicalNonEmptyString(
      rawProvenance.limitation,
      "provenance.limitation",
    ),
  });

  return Object.freeze({
    kind: ORGANISM_PRESENTATION_IDENTITY_KIND,
    schemaVersion: ORGANISM_PRESENTATION_IDENTITY_SCHEMA_VERSION,
    id,
    scientificName,
    background,
    organismKind: record.organismKind as OrganismPresentationKind,
    morphology: record.morphology as OrganismPresentationMorphology,
    provenance,
  });
}

export const FLAGSHIP_ECOLI_ORGANISM_PRESENTATION =
  parseOrganismPresentationIdentity(rawFlagshipIdentity as unknown);

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

function canonicalDoi(value: unknown, name: string): string {
  const doi = canonicalNonEmptyString(value, name);
  if (!/^10\.\d{4,9}\/\S+$/i.test(doi)) {
    throw new TypeError(`${name} must be a canonical DOI`);
  }
  return doi;
}
