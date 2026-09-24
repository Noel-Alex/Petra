export const SCIENCE_MODE_ADMISSION_SCHEMA_VERSION = 1 as const;

export type ScenarioScienceMaturity =
  | "experimental"
  | "validated-educational"
  | "reference";

export type ScenarioScienceAvailability =
  | "refused"
  | "experimental"
  | "educational-only"
  | "reference";

export type ScenarioAdmissionReasonCode =
  | "missing-admission-manifest"
  | "malformed-admission-manifest"
  | "scenario-identity-drift"
  | "missing-primary-literature"
  | "missing-decisive-parameter-evidence"
  | "missing-transfer-assumptions"
  | "missing-validation-target"
  | "missing-limitation"
  | "missing-required-field"
  | "reference-binding-unmet"
  | "engineering-execution-profile"
  | "experimental-by-declaration";

export interface ScenarioAdmissionReason {
  readonly code: ScenarioAdmissionReasonCode;
  readonly severity: "blocker" | "reference-blocker" | "disclosure";
  readonly path: string | null;
  readonly message: string;
}

export interface ScenarioScienceAdmission {
  readonly scenarioId: string | null;
  readonly scenarioVersion: string | null;
  readonly title: string | null;
  readonly policyVersion: typeof SCIENCE_MODE_ADMISSION_SCHEMA_VERSION;
  readonly maturity: ScenarioScienceMaturity;
  readonly availability: ScenarioScienceAvailability;
  readonly referenceEligible: boolean;
  readonly reasons: readonly ScenarioAdmissionReason[];
}

interface AdmissionManifest {
  readonly schemaVersion: typeof SCIENCE_MODE_ADMISSION_SCHEMA_VERSION;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly requestedMaturity: ScenarioScienceMaturity;
  readonly primaryEvidenceCitationKeys: readonly string[];
  readonly decisiveParameterPaths: readonly string[];
  readonly requiredNonEmptyPaths: readonly string[];
  readonly limitationPaths: readonly string[];
  readonly referenceBindings: readonly ReferenceBindingRequirement[];
  readonly engineeringExecutionProfilePath: string | null;
}

interface ReferenceBindingRequirement {
  readonly path: string;
  readonly expected: string;
  readonly label: string;
}

type UnknownRecord = Record<string, unknown>;

/**
 * Evaluates whether a parsed scenario is actually admissible as science.
 *
 * Parsing is deliberately not admission. Primary-literature keys, decisive
 * parameter records, disclosures and reference-only bindings are all declared
 * by the scenario itself and then verified against the same scenario payload.
 * This avoids inferring scientific maturity from a DOI, filename or UI label.
 */
export function evaluateScenarioScienceAdmission(
  scenario: unknown,
): ScenarioScienceAdmission {
  const root = asRecord(scenario);
  const identity = scenarioIdentity(root);
  const manifest = parseAdmissionManifest(root?.scienceModeAdmission);

  if (manifest === null) {
    return {
      ...identity,
      policyVersion: SCIENCE_MODE_ADMISSION_SCHEMA_VERSION,
      maturity: "experimental",
      availability: "refused",
      referenceEligible: false,
      reasons: [
        {
          code:
            root?.scienceModeAdmission === undefined
              ? "missing-admission-manifest"
              : "malformed-admission-manifest",
          severity: "blocker",
          path: "scienceModeAdmission",
          message:
            "Scenario is not admitted to Science Mode: a valid versioned scienceModeAdmission manifest is required.",
        },
      ],
    };
  }

  const reasons: ScenarioAdmissionReason[] = [];

  if (
    identity.scenarioId !== manifest.scenarioId ||
    identity.scenarioVersion !== manifest.scenarioVersion
  ) {
    reasons.push({
      code: "scenario-identity-drift",
      severity: "blocker",
      path: "scienceModeAdmission",
      message:
        "Science-Mode admission evidence is version-bound and does not match the scenario id/version.",
    });
  }

  validatePrimaryEvidence(root, manifest, reasons);
  validateDecisiveParameters(root, manifest, reasons);
  validateTransfers(root, reasons);
  validateValidationTargets(root, reasons);
  validateRequiredFields(root, manifest, reasons);
  validateLimitations(root, manifest, reasons);
  validateReferenceBindings(root, manifest, reasons);
  validateEngineeringProfile(root, manifest, reasons);

  if (manifest.requestedMaturity === "experimental") {
    reasons.push({
      code: "experimental-by-declaration",
      severity: "disclosure",
      path: "scienceModeAdmission.requestedMaturity",
      message:
        "Scenario declares itself experimental and is not presented as grounded/reference Science Mode.",
    });
  }

  const hasBlocker = reasons.some((reason) => reason.severity === "blocker");
  const hasReferenceBlocker = reasons.some(
    (reason) => reason.severity === "reference-blocker",
  );

  if (hasBlocker) {
    return {
      ...identity,
      policyVersion: SCIENCE_MODE_ADMISSION_SCHEMA_VERSION,
      maturity: "experimental",
      availability: "refused",
      referenceEligible: false,
      reasons,
    };
  }

  if (manifest.requestedMaturity === "experimental") {
    return {
      ...identity,
      policyVersion: SCIENCE_MODE_ADMISSION_SCHEMA_VERSION,
      maturity: "experimental",
      availability: "experimental",
      referenceEligible: false,
      reasons,
    };
  }

  if (manifest.requestedMaturity === "reference" && !hasReferenceBlocker) {
    return {
      ...identity,
      policyVersion: SCIENCE_MODE_ADMISSION_SCHEMA_VERSION,
      maturity: "reference",
      availability: "reference",
      referenceEligible: true,
      reasons,
    };
  }

  return {
    ...identity,
    policyVersion: SCIENCE_MODE_ADMISSION_SCHEMA_VERSION,
    maturity: "validated-educational",
    availability: "educational-only",
    referenceEligible: false,
    reasons,
  };
}

function validatePrimaryEvidence(
  root: UnknownRecord | null,
  manifest: AdmissionManifest,
  reasons: ScenarioAdmissionReason[],
): void {
  const citations = asRecord(root?.citations);
  if (manifest.primaryEvidenceCitationKeys.length === 0) {
    reasons.push({
      code: "missing-primary-literature",
      severity: "blocker",
      path: "scienceModeAdmission.primaryEvidenceCitationKeys",
      message:
        "Science-Mode admission requires at least one explicitly declared primary-literature citation key.",
    });
    return;
  }

  for (const key of manifest.primaryEvidenceCitationKeys) {
    const citation = asRecord(citations?.[key]);
    const hasTitle = nonEmptyString(citation?.title);
    const hasLocator =
      nonEmptyString(citation?.doi) || nonEmptyString(citation?.url);
    if (citation === null || !hasTitle || !hasLocator) {
      reasons.push({
        code: "missing-primary-literature",
        severity: "blocker",
        path: `citations.${key}`,
        message:
          `Declared primary-literature citation "${key}" must resolve to a title and DOI/URL in this scenario.`,
      });
    }
  }
}

function validateDecisiveParameters(
  root: UnknownRecord | null,
  manifest: AdmissionManifest,
  reasons: ScenarioAdmissionReason[],
): void {
  if (manifest.decisiveParameterPaths.length === 0) {
    reasons.push({
      code: "missing-decisive-parameter-evidence",
      severity: "blocker",
      path: "scienceModeAdmission.decisiveParameterPaths",
      message:
        "Science-Mode admission requires explicit decisive parameter/mechanism evidence paths.",
    });
    return;
  }

  for (const path of manifest.decisiveParameterPaths) {
    const value = resolvePath(root, path);
    if (!hasExplicitEvidence(value)) {
      reasons.push({
        code: "missing-decisive-parameter-evidence",
        severity: "blocker",
        path,
        message:
          `Decisive parameter/mechanism record "${path}" lacks explicit provenance or calibration evidence.`,
      });
    }
  }
}

function validateTransfers(
  root: UnknownRecord | null,
  reasons: ScenarioAdmissionReason[],
): void {
  const assumptions = root?.transferAssumptions;
  if (
    !Array.isArray(assumptions) ||
    assumptions.length === 0 ||
    assumptions.some((value) => !nonEmptyString(value))
  ) {
    reasons.push({
      code: "missing-transfer-assumptions",
      severity: "blocker",
      path: "transferAssumptions",
      message:
        "Science-Mode admission requires explicit non-empty cross-study transfer assumptions.",
    });
  }
}

function validateValidationTargets(
  root: UnknownRecord | null,
  reasons: ScenarioAdmissionReason[],
): void {
  if (!hasValidationTarget(root?.validationTargets)) {
    reasons.push({
      code: "missing-validation-target",
      severity: "blocker",
      path: "validationTargets",
      message:
        "Science-Mode admission requires at least one explicit validation target.",
    });
  }
}

function validateRequiredFields(
  root: UnknownRecord | null,
  manifest: AdmissionManifest,
  reasons: ScenarioAdmissionReason[],
): void {
  for (const path of manifest.requiredNonEmptyPaths) {
    const value = resolvePath(root, path);
    if (!hasNonEmptyValue(value)) {
      reasons.push({
        code: "missing-required-field",
        severity: "blocker",
        path,
        message:
          `Science-Mode admission requires a non-empty value/unit/context at "${path}".`,
      });
    }
  }
}

function validateLimitations(
  root: UnknownRecord | null,
  manifest: AdmissionManifest,
  reasons: ScenarioAdmissionReason[],
): void {
  if (manifest.limitationPaths.length === 0) {
    reasons.push({
      code: "missing-limitation",
      severity: "blocker",
      path: "scienceModeAdmission.limitationPaths",
      message:
        "Science-Mode admission requires explicit visible limitation paths.",
    });
    return;
  }

  for (const path of manifest.limitationPaths) {
    if (!nonEmptyString(resolvePath(root, path))) {
      reasons.push({
        code: "missing-limitation",
        severity: "blocker",
        path,
        message: `Declared Science-Mode limitation "${path}" is missing or empty.`,
      });
    }
  }
}

function validateReferenceBindings(
  root: UnknownRecord | null,
  manifest: AdmissionManifest,
  reasons: ScenarioAdmissionReason[],
): void {
  for (const requirement of manifest.referenceBindings) {
    const actual = resolvePath(root, requirement.path);
    if (actual !== requirement.expected) {
      reasons.push({
        code: "reference-binding-unmet",
        severity: "reference-blocker",
        path: requirement.path,
        message:
          `Reference Science Mode requires ${requirement.label}; expected "${requirement.expected}" but found ${formatValue(actual)}.`,
      });
    }
  }
}

function validateEngineeringProfile(
  root: UnknownRecord | null,
  manifest: AdmissionManifest,
  reasons: ScenarioAdmissionReason[],
): void {
  if (manifest.engineeringExecutionProfilePath === null) return;

  const profile = asRecord(
    resolvePath(root, manifest.engineeringExecutionProfilePath),
  );
  if (profile?.classification === "engineering") {
    reasons.push({
      code: "engineering-execution-profile",
      severity: "reference-blocker",
      path: manifest.engineeringExecutionProfilePath,
      message:
        "Engineering execution values may support a validated educational simulation, but they cannot satisfy a physical/reference Science-Mode claim.",
    });
  }
}

function hasExplicitEvidence(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0 && value.every((item) => hasExplicitEvidence(item));
  }

  const record = asRecord(value);
  if (record === null) return false;

  const provenance = asRecord(record.provenance) ?? record;
  const classification = provenance.classification;
  if (!nonEmptyString(classification)) return false;

  const citationKeys = [
    provenance.citation,
    ...(Array.isArray(provenance.citations) ? provenance.citations : []),
  ];
  const hasCitation = citationKeys.some((key) => nonEmptyString(key));
  const hasCalibration = nonEmptyString(provenance.calibrationNote);

  if (classification === "engineering" || classification === "calibrated") {
    return hasCalibration;
  }

  return hasCitation;
}

function hasValidationTarget(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some((item) => hasNonEmptyValue(item));
  }
  const record = asRecord(value);
  if (record === null) return false;
  return Object.values(record).some((item) => hasValidationTarget(item));
}

function hasNonEmptyValue(value: unknown): boolean {
  if (nonEmptyString(value)) return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  const record = asRecord(value);
  return record !== null && Object.keys(record).length > 0;
}

function parseAdmissionManifest(value: unknown): AdmissionManifest | null {
  const record = asRecord(value);
  if (
    record === null ||
    record.schemaVersion !== SCIENCE_MODE_ADMISSION_SCHEMA_VERSION ||
    !nonEmptyString(record.scenarioId) ||
    !nonEmptyString(record.scenarioVersion) ||
    !isMaturity(record.requestedMaturity)
  ) {
    return null;
  }

  const primaryEvidenceCitationKeys = stringArray(
    record.primaryEvidenceCitationKeys,
  );
  const decisiveParameterPaths = stringArray(record.decisiveParameterPaths);
  const requiredNonEmptyPaths = stringArray(record.requiredNonEmptyPaths);
  const limitationPaths = stringArray(record.limitationPaths);
  if (
    primaryEvidenceCitationKeys === null ||
    decisiveParameterPaths === null ||
    requiredNonEmptyPaths === null ||
    limitationPaths === null ||
    !Array.isArray(record.referenceBindings)
  ) {
    return null;
  }

  const referenceBindings: ReferenceBindingRequirement[] = [];
  for (const item of record.referenceBindings) {
    const binding = asRecord(item);
    if (
      binding === null ||
      !nonEmptyString(binding.path) ||
      !nonEmptyString(binding.expected) ||
      !nonEmptyString(binding.label)
    ) {
      return null;
    }
    referenceBindings.push({
      path: binding.path,
      expected: binding.expected,
      label: binding.label,
    });
  }

  const profilePath = record.engineeringExecutionProfilePath;
  if (profilePath !== null && !nonEmptyString(profilePath)) return null;

  return {
    schemaVersion: SCIENCE_MODE_ADMISSION_SCHEMA_VERSION,
    scenarioId: record.scenarioId,
    scenarioVersion: record.scenarioVersion,
    requestedMaturity: record.requestedMaturity,
    primaryEvidenceCitationKeys,
    decisiveParameterPaths,
    requiredNonEmptyPaths,
    limitationPaths,
    referenceBindings,
    engineeringExecutionProfilePath: profilePath,
  };
}

function scenarioIdentity(root: UnknownRecord | null): Pick<
  ScenarioScienceAdmission,
  "scenarioId" | "scenarioVersion" | "title"
> {
  return {
    scenarioId: nonEmptyString(root?.id) ? root.id : null,
    scenarioVersion: nonEmptyString(root?.version) ? root.version : null,
    title: nonEmptyString(root?.title) ? root.title : null,
  };
}

function resolvePath(root: UnknownRecord | null, path: string): unknown {
  let current: unknown = root;
  for (const segment of path.split(".")) {
    const record = asRecord(current);
    if (record === null) return undefined;
    current = record[segment];
  }
  return current;
}

function stringArray(value: unknown): readonly string[] | null {
  if (
    !Array.isArray(value) ||
    value.some((item) => !nonEmptyString(item))
  ) {
    return null;
  }
  return value;
}

function isMaturity(value: unknown): value is ScenarioScienceMaturity {
  return (
    value === "experimental" ||
    value === "validated-educational" ||
    value === "reference"
  );
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function asRecord(value: unknown): UnknownRecord | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function formatValue(value: unknown): string {
  if (value === undefined) return "missing";
  if (typeof value === "string") return `"${value}"`;
  if (value === null) return "null";
  return JSON.stringify(value) ?? String(value);
}
