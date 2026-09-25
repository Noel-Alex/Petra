export const CONTENT_PACK_MANIFEST_SCHEMA_VERSION = 1 as const;

export const CONTENT_PACK_MATURITIES = [
  "experimental",
  "validated-educational",
  "reference",
] as const;

export type ContentPackMaturity = (typeof CONTENT_PACK_MATURITIES)[number];

export interface ContentPackRecordReference {
  readonly id: string;
  readonly version: string;
}

export interface BiologicalContentPackReferences {
  readonly organisms: readonly ContentPackRecordReference[];
  readonly antimicrobials: readonly ContentPackRecordReference[];
  readonly genotypeGraphs: readonly ContentPackRecordReference[];
  readonly environments: readonly ContentPackRecordReference[];
  readonly phageHostPairs: readonly ContentPackRecordReference[];
  readonly scenarios: readonly ContentPackRecordReference[];
  readonly mechanisms: readonly ContentPackRecordReference[];
  readonly presentationRecords: readonly ContentPackRecordReference[];
  readonly citationKeys: readonly string[];
}

export interface BiologicalContentPackManifest {
  readonly schemaVersion: typeof CONTENT_PACK_MANIFEST_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  /**
   * Declared content maturity only. This is not Science Mode admission and does
   * not establish that any organism × intervention × environment combination is
   * supported.
   */
  readonly maturity: ContentPackMaturity;
  readonly limitations: readonly string[];
  readonly references: BiologicalContentPackReferences;
}

const MANIFEST_KEYS = [
  "schemaVersion",
  "id",
  "version",
  "maturity",
  "limitations",
  "references",
] as const;

const REFERENCE_KEYS = [
  "organisms",
  "antimicrobials",
  "genotypeGraphs",
  "environments",
  "phageHostPairs",
  "scenarios",
  "mechanisms",
  "presentationRecords",
  "citationKeys",
] as const;

const RECORD_REFERENCE_KEYS = ["id", "version"] as const;

const CANONICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CANONICAL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

/**
 * Parse one inert biological content-pack manifest.
 *
 * The manifest is only an exact registry of versioned references and provenance
 * locators. It does not contain executable mechanisms, scientific parameter
 * literals, compatibility fallbacks, or product admission policy. Unknown keys
 * therefore fail closed instead of becoming an accidental executable/data
 * extension surface.
 */
export function parseBiologicalContentPackManifest(
  value: unknown,
): BiologicalContentPackManifest {
  const root = requireRecord(value, "content pack manifest");
  assertExactKeys(root, MANIFEST_KEYS, "content pack manifest");

  if (root.schemaVersion !== CONTENT_PACK_MANIFEST_SCHEMA_VERSION) {
    throw new Error(
      `content pack manifest schemaVersion must equal ${CONTENT_PACK_MANIFEST_SCHEMA_VERSION}`,
    );
  }

  const id = canonicalIdentifier("content pack manifest id", root.id);
  const version = canonicalVersion("content pack manifest version", root.version);

  if (
    typeof root.maturity !== "string" ||
    !CONTENT_PACK_MATURITIES.includes(root.maturity as ContentPackMaturity)
  ) {
    throw new Error(
      "content pack manifest maturity must be experimental, validated-educational, or reference",
    );
  }

  const limitations = canonicalTextArray(
    "content pack manifest limitations",
    root.limitations,
    { requireNonEmpty: true },
  );

  const referencesRecord = requireRecord(
    root.references,
    "content pack manifest references",
  );
  assertExactKeys(
    referencesRecord,
    REFERENCE_KEYS,
    "content pack manifest references",
  );

  const references: BiologicalContentPackReferences = {
    organisms: parseReferenceArray(
      "content pack manifest references.organisms",
      referencesRecord.organisms,
    ),
    antimicrobials: parseReferenceArray(
      "content pack manifest references.antimicrobials",
      referencesRecord.antimicrobials,
    ),
    genotypeGraphs: parseReferenceArray(
      "content pack manifest references.genotypeGraphs",
      referencesRecord.genotypeGraphs,
    ),
    environments: parseReferenceArray(
      "content pack manifest references.environments",
      referencesRecord.environments,
    ),
    phageHostPairs: parseReferenceArray(
      "content pack manifest references.phageHostPairs",
      referencesRecord.phageHostPairs,
    ),
    scenarios: parseReferenceArray(
      "content pack manifest references.scenarios",
      referencesRecord.scenarios,
    ),
    mechanisms: parseReferenceArray(
      "content pack manifest references.mechanisms",
      referencesRecord.mechanisms,
    ),
    presentationRecords: parseReferenceArray(
      "content pack manifest references.presentationRecords",
      referencesRecord.presentationRecords,
    ),
    citationKeys: canonicalIdentifierArray(
      "content pack manifest references.citationKeys",
      referencesRecord.citationKeys,
      { requireNonEmpty: true },
    ),
  };

  return {
    schemaVersion: CONTENT_PACK_MANIFEST_SCHEMA_VERSION,
    id,
    version,
    maturity: root.maturity as ContentPackMaturity,
    limitations,
    references,
  };
}

/**
 * Stable identity for one exact inert pack declaration.
 *
 * Reference arrays are sets for manifest identity, so their input order is not
 * authoritative. IDs and versions remain case-sensitive and are never trimmed
 * or otherwise canonicalized from invalid aliases.
 */
export function biologicalContentPackManifestIdentity(value: unknown): string {
  const manifest = parseBiologicalContentPackManifest(value);

  const sortedReferences = (
    references: readonly ContentPackRecordReference[],
  ): readonly ContentPackRecordReference[] =>
    [...references].sort((left, right) => {
      if (left.id < right.id) return -1;
      if (left.id > right.id) return 1;
      if (left.version < right.version) return -1;
      if (left.version > right.version) return 1;
      return 0;
    });

  return JSON.stringify({
    schemaVersion: CONTENT_PACK_MANIFEST_SCHEMA_VERSION,
    id: manifest.id,
    version: manifest.version,
    maturity: manifest.maturity,
    limitations: [...manifest.limitations].sort(),
    references: {
      organisms: sortedReferences(manifest.references.organisms),
      antimicrobials: sortedReferences(manifest.references.antimicrobials),
      genotypeGraphs: sortedReferences(manifest.references.genotypeGraphs),
      environments: sortedReferences(manifest.references.environments),
      phageHostPairs: sortedReferences(manifest.references.phageHostPairs),
      scenarios: sortedReferences(manifest.references.scenarios),
      mechanisms: sortedReferences(manifest.references.mechanisms),
      presentationRecords: sortedReferences(
        manifest.references.presentationRecords,
      ),
      citationKeys: [...manifest.references.citationKeys].sort(),
    },
  });
}

function parseReferenceArray(
  path: string,
  value: unknown,
): readonly ContentPackRecordReference[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }

  const seen = new Map<string, string>();
  const parsed: ContentPackRecordReference[] = [];

  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new Error(`${path} must be a dense array`);
    }
    const itemPath = `${path}[${index}]`;
    const record = requireRecord(value[index], itemPath);
    assertExactKeys(record, RECORD_REFERENCE_KEYS, itemPath);

    const id = canonicalIdentifier(`${itemPath}.id`, record.id);
    const version = canonicalVersion(`${itemPath}.version`, record.version);
    const previousVersion = seen.get(id);
    if (previousVersion !== undefined) {
      const detail =
        previousVersion === version
          ? `duplicate reference ${JSON.stringify(id)}@${JSON.stringify(version)}`
          : `reference ${JSON.stringify(id)} selects both ${JSON.stringify(previousVersion)} and ${JSON.stringify(version)}`;
      throw new Error(`${path} contains ${detail}`);
    }
    seen.set(id, version);
    parsed.push({ id, version });
  }

  return parsed;
}

function canonicalIdentifierArray(
  path: string,
  value: unknown,
  options: { readonly requireNonEmpty: boolean },
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  if (options.requireNonEmpty && value.length === 0) {
    throw new Error(`${path} must not be empty`);
  }

  const seen = new Set<string>();
  const parsed: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new Error(`${path} must be a dense array`);
    }
    const item = canonicalIdentifier(`${path}[${index}]`, value[index]);
    if (seen.has(item)) {
      throw new Error(`${path} contains duplicate identifier ${JSON.stringify(item)}`);
    }
    seen.add(item);
    parsed.push(item);
  }
  return parsed;
}

function canonicalTextArray(
  path: string,
  value: unknown,
  options: { readonly requireNonEmpty: boolean },
): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array`);
  }
  if (options.requireNonEmpty && value.length === 0) {
    throw new Error(`${path} must not be empty`);
  }

  const seen = new Set<string>();
  const parsed: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new Error(`${path} must be a dense array`);
    }
    const item = canonicalText(`${path}[${index}]`, value[index]);
    if (seen.has(item)) {
      throw new Error(`${path} contains duplicate text ${JSON.stringify(item)}`);
    }
    seen.add(item);
    parsed.push(item);
  }
  return parsed;
}

function canonicalIdentifier(path: string, value: unknown): string {
  const text = canonicalText(path, value);
  if (!CANONICAL_ID.test(text)) {
    throw new Error(
      `${path} must use canonical identifier characters [A-Za-z0-9._:-]`,
    );
  }
  return text;
}

function canonicalVersion(path: string, value: unknown): string {
  const text = canonicalText(path, value);
  if (!CANONICAL_VERSION.test(text)) {
    throw new Error(
      `${path} must use canonical version characters [A-Za-z0-9._+-]`,
    );
  }
  return text;
}

function canonicalText(path: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${path} must be non-empty canonical text with no surrounding whitespace`);
  }
  return value;
}

function requireRecord(
  value: unknown,
  path: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function assertExactKeys(
  record: Readonly<Record<string, unknown>>,
  expected: readonly string[],
  path: string,
): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(record)) {
    if (!expectedSet.has(key)) {
      throw new Error(`${path} contains unsupported field ${JSON.stringify(key)}`);
    }
  }
  for (const key of expected) {
    if (!(key in record)) {
      throw new Error(`${path} is missing required field ${JSON.stringify(key)}`);
    }
  }
}
