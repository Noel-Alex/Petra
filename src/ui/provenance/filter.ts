import type { EvidenceBadgeKind } from "./model";
import type { ScenarioProvenanceResolution } from "./scenarioAdapter";

export type ProvenanceEvidenceFilter = "all" | EvidenceBadgeKind;

export const PROVENANCE_EVIDENCE_FILTERS: readonly {
  readonly value: ProvenanceEvidenceFilter;
  readonly label: string;
}[] = Object.freeze([
  { value: "all", label: "All evidence" },
  { value: "measured", label: "Measured" },
  { value: "derived", label: "Derived" },
  { value: "transferred", label: "Transferred" },
  { value: "calibrated", label: "Calibrated" },
  { value: "approximation", label: "Model approximation" },
  { value: "engineering", label: "Engineering" },
  { value: "visual-only", label: "Visual only" },
  { value: "experimental", label: "Experimental" },
]);

export interface ProvenanceFilterRequest {
  readonly query: string;
  readonly evidence: ProvenanceEvidenceFilter;
}

export interface ProvenanceFilterResult {
  readonly records: readonly ScenarioProvenanceResolution[];
  readonly matchingCompleteCount: number;
  readonly needsProvenanceCount: number;
  /** Incomplete records kept visible even though the active filter would hide them. */
  readonly pinnedNeedsProvenanceCount: number;
  readonly hiddenCompleteCount: number;
}

/**
 * Stable provenance record IDs identify one scientific presentation record
 * within a rendered/filterable collection. Duplicate IDs are ambiguous and
 * must fail before React reconciliation or discoverability logic can act on
 * the collection.
 */
export function assertUniqueProvenanceRecordIds(
  records: readonly ScenarioProvenanceResolution[],
): void {
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) {
      throw new RangeError(`duplicate provenance record id: ${record.id}`);
    }
    ids.add(record.id);
  }
}

/**
 * Filters only the discoverability layer. Scientific classifications and
 * provenance status are never changed.
 *
 * needs-provenance records always remain visible. This makes a search/filter
 * control unable to accidentally hide the exact records that require review.
 */
export function filterProvenanceRecords(
  records: readonly ScenarioProvenanceResolution[],
  request: ProvenanceFilterRequest,
): ProvenanceFilterResult {
  assertUniqueProvenanceRecordIds(records);
  const query = normalize(request.query);
  const evidence = assertEvidenceFilter(request.evidence);
  const visible: ScenarioProvenanceResolution[] = [];
  let matchingCompleteCount = 0;
  let needsProvenanceCount = 0;
  let pinnedNeedsProvenanceCount = 0;
  let hiddenCompleteCount = 0;

  for (const record of records) {
    const queryMatches =
      query.length === 0 || searchableText(record).includes(query);
    const evidenceMatches =
      evidence === "all" ||
      record.presentation?.badges.some((badge) => badge.kind === evidence) ===
        true;
    const ordinaryMatch = queryMatches && evidenceMatches;

    if (record.status === "needs-provenance") {
      needsProvenanceCount += 1;
      visible.push(record);
      if (!ordinaryMatch) pinnedNeedsProvenanceCount += 1;
      continue;
    }

    if (ordinaryMatch) {
      matchingCompleteCount += 1;
      visible.push(record);
    } else {
      hiddenCompleteCount += 1;
    }
  }

  return {
    records: visible,
    matchingCompleteCount,
    needsProvenanceCount,
    pinnedNeedsProvenanceCount,
    hiddenCompleteCount,
  };
}

function searchableText(record: ScenarioProvenanceResolution): string {
  const parts: string[] = [
    record.id,
    record.label,
    record.rawClassification ?? "",
    ...record.sourceKeys,
    ...record.sources.flatMap((source) => [
      source.id,
      source.label,
      source.locator ?? "",
    ]),
    ...record.problems,
  ];

  const presentation = record.presentation;
  if (presentation !== null) {
    parts.push(
      presentation.evidenceClass,
      presentation.ariaLabel,
      ...presentation.badges.flatMap((badge) => [
        badge.kind,
        badge.label,
        badge.meaning,
      ]),
      ...presentation.details.flatMap((detail) => [
        detail.label,
        detail.value,
      ]),
      ...presentation.disclosures,
    );
  }

  return normalize(parts.join(" "));
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

export function parseProvenanceEvidenceFilter(
  value: string,
): ProvenanceEvidenceFilter {
  const option = PROVENANCE_EVIDENCE_FILTERS.find(
    (candidate) => candidate.value === value,
  );
  if (option === undefined) {
    throw new RangeError(
      `unknown provenance evidence filter: ${String(value)}`,
    );
  }
  return option.value;
}

function assertEvidenceFilter(
  value: ProvenanceEvidenceFilter,
): ProvenanceEvidenceFilter {
  return parseProvenanceEvidenceFilter(value);
}
