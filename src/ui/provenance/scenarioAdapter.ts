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

export interface ExplicitProvenanceRecord {
  readonly classification?: unknown;
  readonly citation?: unknown;
  readonly citations?: unknown;
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
  readonly status: "complete" | "needs-provenance";
  readonly presentation: ProvenancePresentation | null;
  readonly rawClassification: string | null;
  readonly sourceKeys: readonly string[];
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
 */
export function resolveScenarioProvenance(
  args: ResolveScenarioProvenanceArgs,
): ScenarioProvenanceResolution {
  const problems: string[] = [];
  const rawClassification =
    typeof args.record.classification === "string"
      ? args.record.classification.trim()
      : null;

  if (rawClassification === null || rawClassification.length === 0) {
    return {
      status: "needs-provenance",
      presentation: null,
      rawClassification,
      sourceKeys: citationKeys(args.record, problems),
      problems: [
        "Provenance incomplete: an explicit evidence classification is required.",
        ...problems,
      ],
    };
  }

  const evidenceClass = normalizeEvidenceClass(rawClassification);
  const sourceKeys = citationKeys(args.record, problems);

  if (evidenceClass === null) {
    return {
      status: "needs-provenance",
      presentation: null,
      rawClassification,
      sourceKeys,
      problems: [
        `Provenance incomplete: unsupported explicit evidence classification "${rawClassification}".`,
        ...problems,
      ],
    };
  }

  const sources = resolveSources(sourceKeys, args.scenario.citations, problems);
  const input: ProvenancePresentationInput = {
    id: args.id,
    label: args.label,
    evidenceClass,
    ...(args.valueText === undefined ? {} : { valueText: args.valueText }),
    ...(args.units === undefined ? {} : { units: args.units }),
    ...(args.context === undefined ? {} : { context: args.context }),
    ...(sources.length === 0 ? {} : { sources }),
    ...(args.transformation === undefined
      ? {}
      : { transformation: args.transformation }),
    ...(args.uncertainty === undefined ? {} : { uncertainty: args.uncertainty }),
    ...(args.transferNote === undefined
      ? {}
      : { transferNote: args.transferNote }),
    ...(args.calibrationNote === undefined
      ? {}
      : { calibrationNote: args.calibrationNote }),
    ...(args.limitation === undefined ? {} : { limitation: args.limitation }),
  };

  const presentation = buildProvenancePresentation(input);
  const status =
    presentation.status === "complete" && problems.length === 0
      ? "complete"
      : "needs-provenance";

  return {
    status,
    presentation,
    rawClassification,
    sourceKeys,
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

function citationKeys(
  record: ExplicitProvenanceRecord,
  problems: string[],
): readonly string[] {
  const keys: string[] = [];

  if (record.citation !== undefined) {
    if (typeof record.citation !== "string" || record.citation.trim().length === 0) {
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

    if (typeof citation.title !== "string" || citation.title.trim().length === 0) {
      problems.push(
        `Provenance incomplete: citation "${key}" requires a non-empty title.`,
      );
      continue;
    }

    const locator = citationLocator(citation);
    sources.push({
      id: key,
      label: citation.title.trim(),
      ...(locator === null ? {} : { locator }),
    });
  }

  return sources;
}

function citationLocator(citation: ScenarioCitationRecord): string | null {
  if (typeof citation.doi === "string" && citation.doi.trim().length > 0) {
    return `DOI: ${citation.doi.trim()}`;
  }
  if (typeof citation.url === "string" && citation.url.trim().length > 0) {
    return citation.url.trim();
  }
  return null;
}
