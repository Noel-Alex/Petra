export const BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION = 1 as const;

export const EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE =
  "explicit-genotype-table-v1" as const;

export type BaselineNonDrugLossEvidenceClass =
  | "engineering"
  | "transferred"
  | "calibrated";

export interface BaselineNonDrugLossProvenance {
  readonly classification: BaselineNonDrugLossEvidenceClass;
  readonly sourceKeys: readonly string[];
  readonly context: string;
  readonly limitation: string;
}

export interface BaselineNonDrugLossEntry {
  readonly genotypeId: string;
  readonly deathHazardPerHour: number;
  readonly provenance: Readonly<BaselineNonDrugLossProvenance>;
}

export interface BaselineNonDrugLossPolicy {
  readonly schemaVersion: typeof BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION;
  readonly id: string;
  readonly rule: typeof EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE;
  readonly entries: readonly BaselineNonDrugLossEntry[];
}

/**
 * Canonical static authority for the non-drug first-order loss assigned to a
 * lineage genotype when that lineage becomes active.
 *
 * This policy deliberately does not infer values from relative fitness, MIC,
 * drug exposure, parent lineage state, or genotype naming. Missing genotype
 * authority is a hard refusal so composed mutation activation cannot silently
 * inherit or invent a background-loss parameter.
 */
export function baselineNonDrugLossPolicyIdentity(
  policy: BaselineNonDrugLossPolicy,
): string {
  validateBaselineNonDrugLossPolicy(policy);

  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    rule: policy.rule,
    entries: [...policy.entries]
      .sort((left, right) =>
        left.genotypeId < right.genotypeId
          ? -1
          : left.genotypeId > right.genotypeId
            ? 1
            : 0,
      )
      .map((entry) => ({
        genotypeId: entry.genotypeId,
        deathHazardPerHour: entry.deathHazardPerHour,
        provenance: {
          classification: entry.provenance.classification,
          sourceKeys: [...entry.provenance.sourceKeys].sort(),
          context: entry.provenance.context,
          limitation: entry.provenance.limitation,
        },
      })),
  });
}

export function resolveBaselineNonDrugDeathHazardPerHour(
  policy: BaselineNonDrugLossPolicy,
  genotypeId: string,
): number {
  validateBaselineNonDrugLossPolicy(policy);
  canonicalIdentity("baseline non-drug loss genotype id", genotypeId);

  const entry = policy.entries.find(
    (candidate) => candidate.genotypeId === genotypeId,
  );
  if (entry === undefined) {
    throw new Error(
      `baseline non-drug loss policy has no authority for genotype ${genotypeId}`,
    );
  }
  return entry.deathHazardPerHour;
}

export function validateBaselineNonDrugLossPolicy(
  policy: BaselineNonDrugLossPolicy,
): void {
  if (
    policy.schemaVersion !== BASELINE_NON_DRUG_LOSS_POLICY_SCHEMA_VERSION
  ) {
    throw new Error("unsupported baseline non-drug loss policy version");
  }
  canonicalIdentity("baseline non-drug loss policy id", policy.id);
  if (policy.rule !== EXPLICIT_GENOTYPE_BASELINE_LOSS_RULE) {
    throw new Error("unsupported baseline non-drug loss policy rule");
  }
  if (!Array.isArray(policy.entries) || policy.entries.length === 0) {
    throw new Error(
      "baseline non-drug loss policy requires at least one genotype entry",
    );
  }

  const genotypeIds = new Set<string>();
  for (let index = 0; index < policy.entries.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(policy.entries, index)) {
      throw new Error("baseline non-drug loss policy entries must be dense");
    }

    const entry = policy.entries[index]!;
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(
        `baseline non-drug loss entry ${index} must be an object`,
      );
    }
    canonicalIdentity(
      `baseline non-drug loss genotype id at index ${index}`,
      entry.genotypeId,
    );
    if (genotypeIds.has(entry.genotypeId)) {
      throw new Error(
        `baseline non-drug loss genotype ids must be unique: ${entry.genotypeId}`,
      );
    }
    genotypeIds.add(entry.genotypeId);

    finiteNonNegative(
      `baseline non-drug deathHazardPerHour(${entry.genotypeId})`,
      entry.deathHazardPerHour,
    );
    validateProvenance(entry.provenance, entry.genotypeId);
  }
}

function validateProvenance(
  provenance: Readonly<BaselineNonDrugLossProvenance>,
  genotypeId: string,
): void {
  if (
    provenance === null ||
    typeof provenance !== "object" ||
    Array.isArray(provenance)
  ) {
    throw new Error(
      `baseline non-drug loss provenance for ${genotypeId} must be an object`,
    );
  }
  if (
    provenance.classification !== "engineering" &&
    provenance.classification !== "transferred" &&
    provenance.classification !== "calibrated"
  ) {
    throw new Error(
      `baseline non-drug loss provenance for ${genotypeId} has unsupported classification`,
    );
  }

  validateCanonicalStringArray(
    `baseline non-drug loss source keys for ${genotypeId}`,
    provenance.sourceKeys,
  );
  if (new Set(provenance.sourceKeys).size !== provenance.sourceKeys.length) {
    throw new Error(
      `baseline non-drug loss source keys for ${genotypeId} must be unique`,
    );
  }
  if (
    provenance.classification !== "engineering" &&
    provenance.sourceKeys.length === 0
  ) {
    throw new Error(
      `non-engineering baseline non-drug loss for ${genotypeId} requires source keys`,
    );
  }

  canonicalText(
    `baseline non-drug loss context for ${genotypeId}`,
    provenance.context,
  );
  canonicalText(
    `baseline non-drug loss limitation for ${genotypeId}`,
    provenance.limitation,
  );
}

function validateCanonicalStringArray(
  name: string,
  values: readonly string[],
): void {
  if (!Array.isArray(values)) {
    throw new Error(name + " must be an array");
  }
  for (let index = 0; index < values.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(values, index)) {
      throw new Error(name + " must be dense");
    }
    canonicalIdentity(name + " at index " + index, values[index]!);
  }
}

function canonicalIdentity(name: string, value: unknown): asserts value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(name + " must be a canonical non-empty string");
  }
}

function canonicalText(name: string, value: unknown): asserts value is string {
  canonicalIdentity(name, value);
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(name + " must be finite and non-negative");
  }
}
