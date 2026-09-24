export const SCENARIO_VALIDATION_STATUS_SCHEMA_VERSION = 1 as const;

export type ScenarioValidationDimension =
  | "numerical"
  | "component-science"
  | "composed-scenario"
  | "browser-product"
  | "demonstration";

export type ScenarioValidationEvidenceKind =
  | "source-test"
  | "scientific-comparison"
  | "local-experiment"
  | "browser-rehearsal"
  | "manual-review"
  | "demonstration-evidence";

export type ScenarioValidationEvidenceStatus =
  | "passed"
  | "partial"
  | "failed"
  | "blocked"
  | "not-run";

export interface ScenarioValidationEvidenceRecord {
  readonly id: string;
  readonly dimension: ScenarioValidationDimension;
  readonly evidenceKind: ScenarioValidationEvidenceKind;
  readonly status: ScenarioValidationEvidenceStatus;
  readonly summary: string;
  /**
   * Stable repo path, experiment id, compact-result path, or other explicit
   * caller-supplied evidence locator. Presentation code does not resolve or
   * infer evidence from this string.
   */
  readonly locator?: string;
  readonly blocker?: string;
}

export interface ScenarioValidationStatus {
  readonly schemaVersion: typeof SCENARIO_VALIDATION_STATUS_SCHEMA_VERSION;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly records: readonly ScenarioValidationEvidenceRecord[];
}

export interface ScenarioValidationLane {
  readonly dimension: ScenarioValidationDimension;
  readonly label: string;
  readonly records: readonly ScenarioValidationEvidenceRecord[];
}

export interface ScenarioValidationPresentation {
  readonly schemaVersion: typeof SCENARIO_VALIDATION_STATUS_SCHEMA_VERSION;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly lanes: readonly ScenarioValidationLane[];
}

const DIMENSIONS: readonly {
  readonly dimension: ScenarioValidationDimension;
  readonly label: string;
}[] = [
  { dimension: "numerical", label: "Numerical" },
  { dimension: "component-science", label: "Component science" },
  { dimension: "composed-scenario", label: "Composed scenario" },
  { dimension: "browser-product", label: "Browser & product" },
  { dimension: "demonstration", label: "Demonstration" },
];

export function buildScenarioValidationPresentation(
  status: ScenarioValidationStatus,
): ScenarioValidationPresentation {
  if (status.schemaVersion !== SCENARIO_VALIDATION_STATUS_SCHEMA_VERSION) {
    throw new Error(
      `unsupported scenario validation status schema: ${status.schemaVersion}`,
    );
  }
  assertCanonicalText("scenarioId", status.scenarioId);
  assertCanonicalText("scenarioVersion", status.scenarioVersion);

  const seenIds = new Set<string>();
  const records = status.records.map((record, index) => {
    assertCanonicalText(`validation record id at index ${index}`, record.id);
    if (seenIds.has(record.id)) {
      throw new Error(`duplicate validation evidence id: ${record.id}`);
    }
    seenIds.add(record.id);
    assertCanonicalText(
      `validation summary for ${record.id}`,
      record.summary,
    );

    if (
      record.status === "passed" ||
      record.status === "partial" ||
      record.status === "failed"
    ) {
      if (record.locator === undefined) {
        throw new Error(
          `validation evidence ${record.id} with status ${record.status} requires an explicit locator`,
        );
      }
      assertCanonicalText(
        `validation locator for ${record.id}`,
        record.locator,
      );
    } else if (record.locator !== undefined) {
      assertCanonicalText(
        `validation locator for ${record.id}`,
        record.locator,
      );
    }

    if (record.status === "blocked") {
      if (record.blocker === undefined) {
        throw new Error(
          `blocked validation evidence ${record.id} requires an explicit blocker`,
        );
      }
      assertCanonicalText(
        `validation blocker for ${record.id}`,
        record.blocker,
      );
    } else if (record.blocker !== undefined) {
      assertCanonicalText(
        `validation blocker for ${record.id}`,
        record.blocker,
      );
    }

    return { ...record };
  });

  return {
    schemaVersion: SCENARIO_VALIDATION_STATUS_SCHEMA_VERSION,
    scenarioId: status.scenarioId,
    scenarioVersion: status.scenarioVersion,
    lanes: DIMENSIONS.map(({ dimension, label }) => ({
      dimension,
      label,
      records: records
        .filter((record) => record.dimension === dimension)
        .map((record) => ({ ...record })),
    })),
  };
}

export function validationEvidenceStatusLabel(
  status: ScenarioValidationEvidenceStatus,
): string {
  if (status === "passed") return "Evidence passed";
  if (status === "partial") return "Partial evidence";
  if (status === "failed") return "Evidence failed";
  if (status === "blocked") return "Blocked";
  return "Not run";
}

function assertCanonicalText(label: string, value: string): void {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${label} must be a canonical non-empty string`);
  }
}
