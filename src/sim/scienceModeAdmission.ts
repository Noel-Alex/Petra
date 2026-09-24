export const SCIENCE_MODE_ADMISSION_SCHEMA_VERSION = 1 as const;

export type ScienceModeMaturity =
  | "experimental"
  | "validated-educational"
  | "reference";

export type ScienceModeAdmissionReasonCode =
  | "invalid-scenario"
  | "missing-warning"
  | "missing-validation-target"
  | "missing-provenance"
  | "unsupported-evidence-class"
  | "missing-primary-source"
  | "unresolved-citation"
  | "missing-transfer-assumption"
  | "missing-transfer-note"
  | "missing-limitation"
  | "unbound-required-value"
  | "engineering-execution-profile";

export interface ScienceModeAdmissionReason {
  readonly code: ScienceModeAdmissionReasonCode;
  readonly path: string;
  readonly message: string;
}

export interface ScienceModeAdmissionEvidence {
  readonly decisiveRecordCount: number;
  readonly primarySourceCount: number;
  readonly validationTargetCount: number;
  readonly transferAssumptionCount: number;
  readonly evidenceClasses: Readonly<Record<string, number>>;
}

export interface ScienceModeAdmission {
  readonly schemaVersion: typeof SCIENCE_MODE_ADMISSION_SCHEMA_VERSION;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly maturity: ScienceModeMaturity;
  readonly admitted: boolean;
  readonly referenceEligible: boolean;
  readonly summary: string;
  readonly reasons: readonly ScienceModeAdmissionReason[];
  readonly evidence: ScienceModeAdmissionEvidence;
}

const SUPPORTED_EVIDENCE_CLASSES = new Set([
  "measured",
  "derived",
  "transferred",
  "calibrated",
  "mechanistic_approximation",
  "engineering",
  "hypothesis_experimental",
  "transferred_mechanistic_approximation",
]);

const SOURCE_REQUIRED_CLASSES = new Set([
  "measured",
  "derived",
  "transferred",
  "calibrated",
  "mechanistic_approximation",
  "transferred_mechanistic_approximation",
]);

const LIMITATION_REQUIRED_CLASSES = new Set([
  "transferred",
  "calibrated",
  "mechanistic_approximation",
  "engineering",
  "hypothesis_experimental",
  "transferred_mechanistic_approximation",
]);

const REFERENCE_DOWNGRADE_CLASSES = new Set([
  "transferred",
  "mechanistic_approximation",
  "engineering",
  "hypothesis_experimental",
  "transferred_mechanistic_approximation",
]);

/**
 * Fail-closed, framework-neutral admission gate for grounded Science Mode.
 *
 * This evaluator consumes only explicit scenario evidence. It never infers that
 * a parseable preset, an engineering execution profile, or a citation count is
 * sufficient validation. Experimental scenarios remain discoverable, but only
 * admitted results may be presented as grounded Science Mode.
 */
export function evaluateScienceModeAdmission(
  scenario: unknown,
): ScienceModeAdmission {
  const reasons: ScienceModeAdmissionReason[] = [];
  const evidenceClasses = new Map<string, number>();
  const referenceDowngrades = new Set<string>();
  const resolvedPrimarySources = new Set<string>();
  let decisiveRecordCount = 0;

  const root = isRecord(scenario) ? scenario : null;
  const scenarioId = canonicalText(root?.id) ?? "invalid-scenario";
  const scenarioVersion = canonicalText(root?.version) ?? "invalid-version";

  if (root === null) {
    addReason(
      reasons,
      "invalid-scenario",
      "$",
      "Science Mode admission requires a scenario object.",
    );
  }
  if (canonicalText(root?.id) === null) {
    addReason(
      reasons,
      "invalid-scenario",
      "id",
      "Scenario id must be a trimmed non-empty string.",
    );
  }
  if (canonicalText(root?.version) === null) {
    addReason(
      reasons,
      "invalid-scenario",
      "version",
      "Scenario version must be a trimmed non-empty string.",
    );
  }

  const warning = canonicalText(root?.warning);
  if (warning === null) {
    addReason(
      reasons,
      "missing-warning",
      "warning",
      "Grounded Science Mode requires an explicit scenario warning/usage scope.",
    );
  }

  const citations = isRecord(root?.citations) ? root.citations : {};
  const transferAssumptions = readStringArray(root?.transferAssumptions);
  const validationTargetCount = countValidationTargets(root?.validationTargets);
  if (validationTargetCount === 0) {
    addReason(
      reasons,
      "missing-validation-target",
      "validationTargets",
      "Grounded Science Mode requires at least one explicit validation target.",
    );
  }

  let sawTransferredEvidence = false;

  const inspectRecord = (
    path: string,
    value: unknown,
    fallbackClassification?: unknown,
  ) => {
    decisiveRecordCount += 1;
    if (!isRecord(value)) {
      addReason(
        reasons,
        "missing-provenance",
        path,
        `Decisive scientific record ${path} is missing or malformed.`,
      );
      return;
    }

    const nested = value.provenance;
    const provenance = isRecord(nested)
      ? nested
      : nested === undefined && fallbackClassification !== undefined
        ? { ...value, classification: fallbackClassification }
        : nested === undefined
          ? value
          : null;

    if (provenance === null) {
      addReason(
        reasons,
        "missing-provenance",
        `${path}.provenance`,
        `Decisive scientific record ${path} requires explicit provenance metadata.`,
      );
      return;
    }

    const classification = canonicalText(provenance.classification);
    if (classification === null) {
      addReason(
        reasons,
        "missing-provenance",
        `${path}.provenance.classification`,
        `Decisive scientific record ${path} requires an explicit evidence classification.`,
      );
      return;
    }
    if (!SUPPORTED_EVIDENCE_CLASSES.has(classification)) {
      addReason(
        reasons,
        "unsupported-evidence-class",
        `${path}.provenance.classification`,
        `Unsupported Science Mode evidence classification "${classification}" at ${path}.`,
      );
      return;
    }

    evidenceClasses.set(
      classification,
      (evidenceClasses.get(classification) ?? 0) + 1,
    );

    if (REFERENCE_DOWNGRADE_CLASSES.has(classification)) {
      referenceDowngrades.add(classification);
    }
    if (
      classification === "transferred" ||
      classification === "transferred_mechanistic_approximation"
    ) {
      sawTransferredEvidence = true;
      if (canonicalText(provenance.transferNote) === null) {
        addReason(
          reasons,
          "missing-transfer-note",
          `${path}.provenance.transferNote`,
          `Transferred evidence at ${path} requires an explicit transfer note.`,
        );
      }
    }
    if (
      LIMITATION_REQUIRED_CLASSES.has(classification) &&
      canonicalText(provenance.limitation) === null
    ) {
      addReason(
        reasons,
        "missing-limitation",
        `${path}.provenance.limitation`,
        `Evidence class "${classification}" at ${path} requires a visible limitation.`,
      );
    }

    const sourceKeys = citationKeys(provenance);
    if (SOURCE_REQUIRED_CLASSES.has(classification) && sourceKeys.length === 0) {
      addReason(
        reasons,
        "missing-primary-source",
        `${path}.provenance`,
        `Evidence class "${classification}" at ${path} requires a cited primary source.`,
      );
    }
    for (const key of sourceKeys) {
      if (!hasPrimaryLocator(citations[key])) {
        addReason(
          reasons,
          "unresolved-citation",
          `${path}.provenance`,
          `Citation key "${key}" at ${path} does not resolve to a titled DOI/URL source.`,
        );
      } else {
        resolvedPrimarySources.add(key);
      }
    }
  };

  const environment = isRecord(root?.environment) ? root.environment : null;
  const resourceContext = environment?.resourceContext;
  inspectRecord("environment.resourceContext", resourceContext);
  if (
    isRecord(resourceContext) &&
    canonicalText(resourceContext.bindingStatus) === "unbound"
  ) {
    addReason(
      reasons,
      "unbound-required-value",
      "environment.resourceContext.bindingStatus",
      "The limiting-resource context is explicitly UNBOUND, so physical growth/resource claims are not admitted to grounded Science Mode.",
    );
  }

  const drug = isRecord(root?.drug) ? root.drug : null;
  const referencePd = drug?.referencePharmacodynamics;
  decisiveRecordCount += 1;
  if (!isRecord(referencePd)) {
    addReason(
      reasons,
      "missing-provenance",
      "drug.referencePharmacodynamics",
      "The reference pharmacodynamic mechanism is missing or malformed.",
    );
  } else {
    const key = canonicalText(referencePd.citation);
    if (key === null) {
      addReason(
        reasons,
        "missing-primary-source",
        "drug.referencePharmacodynamics.citation",
        "Reference pharmacodynamics requires an explicit primary-source citation.",
      );
    } else if (!hasPrimaryLocator(citations[key])) {
      addReason(
        reasons,
        "unresolved-citation",
        "drug.referencePharmacodynamics.citation",
        `Citation key "${key}" for reference pharmacodynamics does not resolve to a titled DOI/URL source.`,
      );
    } else {
      resolvedPrimarySources.add(key);
    }
  }

  inspectRecord(
    "drug.resourceDrugCompositionPolicy",
    drug?.resourceDrugCompositionPolicy,
    drug?.classification,
  );

  inspectRecordArray("genotypes", root?.genotypes, inspectRecord);
  inspectRecordArray(
    "mutationTransitions",
    root?.mutationTransitions,
    inspectRecord,
  );

  inspectRecord("executionProfile", root?.executionProfile);
  if (
    isRecord(root?.executionProfile) &&
    (canonicalText(root.executionProfile.classification) === "engineering" ||
      (isRecord(root.executionProfile.provenance) &&
        canonicalText(root.executionProfile.provenance.classification) ===
          "engineering"))
  ) {
    addReason(
      reasons,
      "engineering-execution-profile",
      "executionProfile.classification",
      "An engineering/model-unit execution profile can run the simulator but cannot satisfy a physical Science Mode calibration claim.",
    );
  }

  inspectRecord("composedParameterSet", root?.composedParameterSet);

  for (const key of collectCitationKeys(root?.validationTargets)) {
    if (!hasPrimaryLocator(citations[key])) {
      addReason(
        reasons,
        "unresolved-citation",
        "validationTargets",
        `Validation-target citation key "${key}" does not resolve to a titled DOI/URL source.`,
      );
    } else {
      resolvedPrimarySources.add(key);
    }
  }

  if (sawTransferredEvidence && transferAssumptions.length === 0) {
    addReason(
      reasons,
      "missing-transfer-assumption",
      "transferAssumptions",
      "Transferred evidence requires at least one scenario-level cross-study transfer disclosure.",
    );
  }

  const maturity: ScienceModeMaturity =
    reasons.length > 0
      ? "experimental"
      : referenceDowngrades.size > 0 || transferAssumptions.length > 0
        ? "validated-educational"
        : "reference";
  const admitted = maturity !== "experimental";
  const referenceEligible = maturity === "reference";

  return {
    schemaVersion: SCIENCE_MODE_ADMISSION_SCHEMA_VERSION,
    scenarioId,
    scenarioVersion,
    maturity,
    admitted,
    referenceEligible,
    summary: admissionSummary(maturity, reasons),
    reasons,
    evidence: {
      decisiveRecordCount,
      primarySourceCount: resolvedPrimarySources.size,
      validationTargetCount,
      transferAssumptionCount: transferAssumptions.length,
      evidenceClasses: Object.fromEntries(
        [...evidenceClasses.entries()].sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    },
  };
}

function inspectRecordArray(
  path: string,
  value: unknown,
  inspect: (path: string, value: unknown) => void,
): void {
  if (!Array.isArray(value) || value.length === 0) {
    inspect(`${path}[0]`, undefined);
    return;
  }
  value.forEach((record, index) => inspect(`${path}[${index}]`, record));
}

function admissionSummary(
  maturity: ScienceModeMaturity,
  reasons: readonly ScienceModeAdmissionReason[],
): string {
  if (maturity === "reference") {
    return "Admitted as reference Science Mode under the scenario's explicit provenance and validation contract.";
  }
  if (maturity === "validated-educational") {
    return "Admitted for grounded educational Science Mode with explicit transfer/model limitations; not a reference calibration.";
  }
  if (reasons.length === 0) {
    return "Experimental scenario; grounded Science Mode admission has not been established.";
  }
  const remaining = reasons.length - 1;
  const first = reasons[0]!.message;
  return remaining === 0
    ? `Not admitted to grounded Science Mode: ${first}`
    : `Not admitted to grounded Science Mode: ${first} (+${remaining} more blocker${remaining === 1 ? "" : "s"}).`;
}

function addReason(
  reasons: ScienceModeAdmissionReason[],
  code: ScienceModeAdmissionReasonCode,
  path: string,
  message: string,
): void {
  if (reasons.some((reason) => reason.code === code && reason.path === path)) {
    return;
  }
  reasons.push({ code, path, message });
}

function citationKeys(record: Readonly<Record<string, unknown>>): readonly string[] {
  const keys: string[] = [];
  const singular = canonicalText(record.citation);
  if (singular !== null) keys.push(singular);
  if (Array.isArray(record.citations)) {
    for (const value of record.citations) {
      const key = canonicalText(value);
      if (key !== null) keys.push(key);
    }
  }
  return [...new Set(keys)];
}

function collectCitationKeys(value: unknown): readonly string[] {
  const keys = new Set<string>();
  const visit = (current: unknown) => {
    if (Array.isArray(current)) {
      current.forEach(visit);
      return;
    }
    if (!isRecord(current)) return;
    const singular = canonicalText(current.citation);
    if (singular !== null) keys.add(singular);
    if (Array.isArray(current.citations)) {
      for (const citation of current.citations) {
        const key = canonicalText(citation);
        if (key !== null) keys.add(key);
      }
    }
    Object.values(current).forEach(visit);
  };
  visit(value);
  return [...keys];
}

function countValidationTargets(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce<number>((count, item) => {
      if (isRecord(item)) return count + (Object.keys(item).length === 0 ? 0 : 1);
      return count + countValidationTargets(item);
    }, 0);
  }
  if (isRecord(value)) {
    return Object.values(value).reduce<number>(
      (count, item) => count + countValidationTargets(item),
      0,
    );
  }
  if (typeof value === "string") return value.trim().length === 0 ? 0 : 1;
  if (typeof value === "number") return Number.isFinite(value) ? 1 : 0;
  if (typeof value === "boolean") return 1;
  return 0;
}

function hasPrimaryLocator(value: unknown): boolean {
  if (!isRecord(value) || canonicalText(value.title) === null) return false;
  if (canonicalText(value.doi) !== null) return true;
  const url = canonicalText(value.url);
  return url !== null && /^https?:\/\//u.test(url);
}

function readStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const text = canonicalText(item);
    return text === null ? [] : [text];
  });
}

function canonicalText(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    return null;
  }
  return value;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
