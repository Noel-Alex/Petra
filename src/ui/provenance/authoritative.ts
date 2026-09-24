import {
  buildProvenancePresentation,
  normalizeEvidenceClass,
  type ProvenancePresentation,
  type ProvenancePresentationInput,
  type ProvenanceSource,
} from "./model";

export interface AuthoritativeProvenanceSource {
  readonly id: string;
  readonly label: string;
  readonly locator?: string;
}

/**
 * Narrow record shape consumed from scenario/runtime provenance.
 *
 * evidenceTier is accepted for legacy compatibility but is intentionally never
 * used to infer evidenceClass. The authority layer must supply an explicit
 * scientific evidence class before the UI may present one.
 */
export interface AuthoritativeProvenanceRecord {
  readonly id: string;
  readonly label: string;
  readonly evidenceClass?: string | null;
  readonly evidenceTier?: string | null;
  readonly value?: string | number | boolean;
  readonly units?: string;
  readonly context?: string;
  readonly sources?: readonly AuthoritativeProvenanceSource[];
  readonly transformation?: string;
  readonly uncertainty?: string;
  readonly transferNote?: string;
  readonly calibrationNote?: string;
  readonly limitation?: string;
}

export type AdaptedProvenanceRecord =
  | {
      readonly kind: "presentation";
      readonly id: string;
      readonly label: string;
      readonly presentation: ProvenancePresentation;
    }
  | {
      readonly kind: "needs-classification";
      readonly id: string;
      readonly label: string;
      readonly rawEvidenceClass: string | null;
      readonly evidenceTier: string | null;
      readonly message: string;
    };

/**
 * Maps explicit authority-layer provenance into Petra's presentation contract.
 *
 * Missing/unknown evidence classes remain visibly unresolved. A DOI, evidence
 * tier, source count, or note can never silently promote a record to a
 * scientific evidence class.
 */
export function adaptAuthoritativeProvenance(
  record: AuthoritativeProvenanceRecord,
): AdaptedProvenanceRecord {
  assertNonEmpty("record.id", record.id);
  assertNonEmpty("record.label", record.label);

  const explicitClass =
    record.evidenceClass === undefined || record.evidenceClass === null
      ? null
      : normalizeEvidenceClass(record.evidenceClass);

  if (explicitClass === null) {
    return {
      kind: "needs-classification",
      id: record.id,
      label: record.label,
      rawEvidenceClass: record.evidenceClass ?? null,
      evidenceTier: record.evidenceTier ?? null,
      message:
        record.evidenceClass === undefined || record.evidenceClass === null
          ? "Provenance incomplete: the authority layer did not provide an explicit evidence class."
          : `Provenance incomplete: unsupported evidence class "${record.evidenceClass}".`,
    };
  }

  const input: ProvenancePresentationInput = {
    id: record.id,
    label: record.label,
    evidenceClass: explicitClass,
    ...optional("valueText", formatValue(record.value)),
    ...optional("units", record.units),
    ...optional("context", record.context),
    ...optional("sources", mapSources(record.sources)),
    ...optional("transformation", record.transformation),
    ...optional("uncertainty", record.uncertainty),
    ...optional("transferNote", record.transferNote),
    ...optional("calibrationNote", record.calibrationNote),
    ...optional("limitation", record.limitation),
  };

  return {
    kind: "presentation",
    id: record.id,
    label: record.label,
    presentation: buildProvenancePresentation(input),
  };
}

export function adaptAuthoritativeProvenanceList(
  records: readonly AuthoritativeProvenanceRecord[],
): readonly AdaptedProvenanceRecord[] {
  const ids = new Set<string>();

  return records.map((record) => {
    if (ids.has(record.id)) {
      throw new RangeError(`duplicate provenance record id: ${record.id}`);
    }
    ids.add(record.id);
    return adaptAuthoritativeProvenance(record);
  });
}

function mapSources(
  sources: readonly AuthoritativeProvenanceSource[] | undefined,
): readonly ProvenanceSource[] | undefined {
  if (sources === undefined) return undefined;

  return sources.map((source) => ({
    id: source.id,
    label: source.label,
    ...optional("locator", source.locator),
  }));
}

function formatValue(
  value: AuthoritativeProvenanceRecord["value"],
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new RangeError("provenance value must be finite when numeric");
  }
  return String(value);
}

function optional<K extends string, V>(
  key: K,
  value: V | undefined,
): {} | { readonly [P in K]: V } {
  if (value === undefined) return {};
  return { [key]: value } as { readonly [P in K]: V };
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}
