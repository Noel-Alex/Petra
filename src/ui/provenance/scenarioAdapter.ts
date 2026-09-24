import {
  buildProvenancePresentation,
  normalizeEvidenceClass,
  type ProvenancePresentation,
  type ProvenancePresentationInput,
  type ProvenanceSource,
} from "./model";

export interface ScenarioCitationRecord {
  readonly title?: unknown;
  readonly doi?: unknown;
  readonly url?: unknown;
}

export interface ScenarioProvenanceContext {
  readonly citations?: Readonly<Record<string, ScenarioCitationRecord>>;
  readonly transferAssumptions?: readonly unknown[];
}

export interface ExplicitPresentationProvenanceRecord {
  readonly classification?: unknown;
  readonly citation?: unknown;
  readonly citations?: unknown;
  readonly context?: unknown;
  readonly transformation?: unknown;
  readonly uncertainty?: unknown;
  readonly transferNote?: unknown;
  readonly calibrationNote?: unknown;
  readonly limitation?: unknown;
}

export interface ExplicitProvenanceRecord
  extends ExplicitPresentationProvenanceRecord {
  /**
   * Preferred normalized data shape. When present, this nested record is the
   * sole presentation-provenance authority; domain-specific top-level
   * classifications remain untouched.
   */
  readonly provenance?: unknown;
}

export interface ResolveScenarioProvenanceArgs {
  readonly id: string;
  readonly label: string;
  readonly record: ExplicitProvenanceRecord;
  readonly scenario: ScenarioProvenanceContext;
  readonly valueText?: string;
  readonly units?: string;
  readonly context?: string;
  readonly transformation?: string;
  readonly uncertainty?: string;
  readonly transferNote?: string;
  readonly calibrationNote?: string;
  readonly limitation?: string;
}

export interface ScenarioProvenanceResolution {
  readonly id: string;
  readonly label: string;
  readonly status: "complete" | "needs-provenance";
  readonly presentation: ProvenancePresentation | null;
  readonly rawClassification: string | null;
  readonly sourceKeys: readonly string[];
  readonly sources: readonly ProvenanceSource[];
  readonly problems: readonly string[];
}

export interface ScenarioAssumptionsResolution {
  readonly assumptions: readonly string[];
  readonly problems: readonly string[];
}

/**
 * Resolves only evidence classes and source keys explicitly supplied by the
 * authoritative record. Citation presence, DOI presence, paper count, field
 * names, or evidence tier never imply an evidence class.
 *
 * A normalized nested `record.provenance` takes precedence over legacy
 * top-level presentation fields so a domain-specific `classification` can
 * coexist without being reinterpreted by the UI.
 */
export function resolveScenarioProvenance(
  args: ResolveScenarioProvenanceArgs,
): ScenarioProvenanceResolution {
  assertStableIdentity("provenance record id", args.id);
  assertStableIdentity("provenance record label", args.label);

  const problems: string[] = [];
  const record = presentationRecord(args.record, problems);
  const sourceKeys = citationKeys(record, problems);
  const sources = resolveSources(sourceKeys, args.scenario.citations, problems);
  const rawClassification =
    typeof record.classification === "string"
      ? record.classification.trim()
      : null;

  if (rawClassification === null || rawClassification.length === 0) {
    return {
      id: args.id,
      label: args.label,
      status: "needs-provenance",
      presentation: null,
      rawClassification,
      sourceKeys,
      sources,
      problems: [
        "Provenance incomplete: an explicit evidence classification is required.",
        ...problems,
      ],
    };
  }

  const evidenceClass = normalizeEvidenceClass(rawClassification);

  if (evidenceClass === null) {
    return {
      id: args.id,
      label: args.label,
      status: "needs-provenance",
      presentation: null,
      rawClassification,
      sourceKeys,
      sources,
      problems: [
        `Provenance incomplete: unsupported explicit evidence classification "${rawClassification}".`,
        ...problems,
      ],
    };
  }

  const context = metadataText("context", record.context, args.context, problems);
  const transformation = metadataText(
    "transformation",
    record.transformation,
    args.transformation,
    problems,
  );
  const uncertainty = metadataText(
    "uncertainty",
    record.uncertainty,
    args.uncertainty,
    problems,
  );
  const transferNote = metadataText(
    "transferNote",
    record.transferNote,
    args.transferNote,
    problems,
  );
  const calibrationNote = metadataText(
    "calibrationNote",
    record.calibrationNote,
    args.calibrationNote,
    problems,
  );
  const limitation = metadataText(
    "limitation",
    record.limitation,
    args.limitation,
    problems,
  );

  const input: ProvenancePresentationInput = {
    id: args.id,
    label: args.label,
    evidenceClass,
    ...(args.valueText === undefined ? {} : { valueText: args.valueText }),
    ...(args.units === undefined ? {} : { units: args.units }),
    ...(context === undefined ? {} : { context }),
    ...(sources.length === 0 ? {} : { sources }),
    ...(transformation === undefined ? {} : { transformation }),
    ...(uncertainty === undefined ? {} : { uncertainty }),
    ...(transferNote === undefined ? {} : { transferNote }),
    ...(calibrationNote === undefined ? {} : { calibrationNote }),
    ...(limitation === undefined ? {} : { limitation }),
  };

  const presentation = buildProvenancePresentation(input);
  const status =
    presentation.status === "complete" && problems.length === 0
      ? "complete"
      : "needs-provenance";

  return {
    id: args.id,
    label: args.label,
    status,
    presentation,
    rawClassification,
    sourceKeys,
    sources,
    problems,
  };
}

/**
 * Scenario-level transfer assumptions are displayed as their own authoritative
 * disclosures. They are not silently promoted into field-specific transfer
 * notes because that would invent a linkage the data layer did not declare.
 */
export function resolveScenarioTransferAssumptions(
  scenario: ScenarioProvenanceContext,
): ScenarioAssumptionsResolution {
  if (scenario.transferAssumptions === undefined) {
    return { assumptions: [], problems: [] };
  }

  const assumptions: string[] = [];
  const problems: string[] = [];

  for (const [index, value] of scenario.transferAssumptions.entries()) {
    if (typeof value !== "string" || value.trim().length === 0) {
      problems.push(
        `Scenario transfer assumption at index ${index} must be a non-empty string.`,
      );
      continue;
    }
    assumptions.push(value);
  }

  return { assumptions, problems };
}

function presentationRecord(
  record: ExplicitProvenanceRecord,
  problems: string[],
): ExplicitPresentationProvenanceRecord {
  if (record.provenance === undefined) {
    return record;
  }

  if (!isRecord(record.provenance)) {
    problems.push("Provenance record must be an object.");
    return {};
  }

  return record.provenance;
}

function metadataText(
  field: keyof Pick<
    ExplicitPresentationProvenanceRecord,
    | "context"
    | "transformation"
    | "uncertainty"
    | "transferNote"
    | "calibrationNote"
    | "limitation"
  >,
  authoritativeValue: unknown,
  legacyFallback: string | undefined,
  problems: string[],
): string | undefined {
  if (authoritativeValue === undefined) {
    return legacyFallback;
  }

  if (
    typeof authoritativeValue !== "string" ||
    authoritativeValue.trim().length === 0
  ) {
    problems.push(
      `Provenance ${field} must be a non-empty string when supplied.`,
    );
    return undefined;
  }

  return authoritativeValue.trim();
}

function citationKeys(
  record: ExplicitPresentationProvenanceRecord,
  problems: string[],
): readonly string[] {
  const keys: string[] = [];

  if (record.citation !== undefined) {
    if (
      typeof record.citation !== "string" ||
      record.citation.trim().length === 0
    ) {
      problems.push("Provenance citation must be a non-empty citation key.");
    } else {
      keys.push(record.citation.trim());
    }
  }

  if (record.citations !== undefined) {
    if (!Array.isArray(record.citations)) {
      problems.push("Provenance citations must be an array of citation keys.");
    } else {
      for (const [index, value] of record.citations.entries()) {
        if (typeof value !== "string" || value.trim().length === 0) {
          problems.push(
            `Provenance citations[${index}] must be a non-empty citation key.`,
          );
          continue;
        }
        keys.push(value.trim());
      }
    }
  }

  return [...new Set(keys)];
}

function resolveSources(
  keys: readonly string[],
  citations: Readonly<Record<string, ScenarioCitationRecord>> | undefined,
  problems: string[],
): readonly ProvenanceSource[] {
  const sources: ProvenanceSource[] = [];

  for (const key of keys) {
    const citation = citations?.[key];
    if (citation === undefined) {
      problems.push(
        `Provenance incomplete: citation key "${key}" is not present in the active scenario citation map.`,
      );
      continue;
    }

    if (
      typeof citation.title !== "string" ||
      citation.title.trim().length === 0
    ) {
      problems.push(
        `Provenance incomplete: citation "${key}" requires a non-empty title.`,
      );
      continue;
    }

    const locator = citationLocator(key, citation, problems);
    sources.push({
      id: key,
      label: citation.title.trim(),
      ...(locator === null ? {} : { locator }),
    });
  }

  return sources;
}

function citationLocator(
  key: string,
  citation: ScenarioCitationRecord,
  problems: string[],
): string | null {
  if (citation.doi !== undefined) {
    if (
      typeof citation.doi !== "string" ||
      citation.doi.trim().length === 0
    ) {
      problems.push(
        `Provenance incomplete: citation "${key}" has an invalid DOI locator.`,
      );
    } else {
      return `DOI: ${citation.doi.trim()}`;
    }
  }

  if (citation.url !== undefined) {
    if (
      typeof citation.url !== "string" ||
      citation.url.trim().length === 0
    ) {
      problems.push(
        `Provenance incomplete: citation "${key}" has an invalid URL locator.`,
      );
    } else {
      return citation.url.trim();
    }
  }

  return null;
}

function assertStableIdentity(name: string, value: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${name} must be a trimmed non-empty string`);
  }
}

function isRecord(value: unknown): value is ExplicitPresentationProvenanceRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
