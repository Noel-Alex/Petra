export type EvidenceClass =
  | "measured"
  | "derived"
  | "transferred"
  | "calibrated"
  | "mechanistic-approximation"
  | "engineering"
  | "visual-only"
  | "hypothesis-experimental"
  | "transferred-mechanistic-approximation";

export type EvidenceBadgeKind =
  | "measured"
  | "derived"
  | "transferred"
  | "calibrated"
  | "approximation"
  | "engineering"
  | "visual-only"
  | "experimental";

export type EvidenceIconToken =
  | "ruler"
  | "equation"
  | "bridge"
  | "tune"
  | "model"
  | "wrench"
  | "eye"
  | "flask";

export type EvidencePatternToken =
  | "solid"
  | "double-line"
  | "diagonal"
  | "dot-grid"
  | "crosshatch"
  | "dash"
  | "outline"
  | "warning-stripe";

export interface ProvenanceSource {
  readonly id: string;
  readonly label: string;
  readonly locator?: string;
  /**
   * Optional actionable external source resolved from explicit authoritative
   * citation metadata. Presentation must never infer this from label/title.
   */
  readonly href?: string;
}

export interface ProvenancePresentationInput {
  readonly id: string;
  readonly label: string;
  readonly evidenceClass: EvidenceClass;
  readonly valueText?: string;
  readonly units?: string;
  readonly context?: string;
  readonly sources?: readonly ProvenanceSource[];
  readonly transformation?: string;
  readonly uncertainty?: string;
  readonly transferNote?: string;
  readonly calibrationNote?: string;
  readonly limitation?: string;
}

export interface EvidenceBadge {
  readonly kind: EvidenceBadgeKind;
  readonly label: string;
  readonly iconToken: EvidenceIconToken;
  readonly patternToken: EvidencePatternToken;
  readonly meaning: string;
}

export interface ProvenanceDetailRow {
  readonly label: string;
  readonly value: string;
  readonly href?: string;
}

export interface ProvenancePresentation {
  readonly id: string;
  readonly label: string;
  readonly evidenceClass: EvidenceClass;
  readonly badges: readonly EvidenceBadge[];
  readonly details: readonly ProvenanceDetailRow[];
  readonly disclosures: readonly string[];
  readonly status: "complete" | "needs-provenance";
  readonly ariaLabel: string;
}

export function buildProvenancePresentation(
  input: ProvenancePresentationInput,
): ProvenancePresentation {
  assertNonEmpty("id", input.id);
  assertNonEmpty("label", input.label);

  const badges = badgesForClass(input.evidenceClass);
  const details = buildDetails(input);
  const disclosures = buildDisclosures(input);
  const missing = missingRequirements(input);

  return {
    id: input.id,
    label: input.label,
    evidenceClass: input.evidenceClass,
    badges,
    details,
    disclosures: [...disclosures, ...missing],
    status: missing.length === 0 ? "complete" : "needs-provenance",
    ariaLabel: `${input.label}. Evidence: ${badges.map((badge) => badge.label).join(", ")}.`,
  };
}

/**
 * Normalizes only explicit provenance-class strings.
 *
 * It intentionally does not infer a scientific evidence class from confidence
 * tiers such as "A", paper count, DOI presence, or UI color.
 */
export function normalizeEvidenceClass(value: string): EvidenceClass | null {
  const normalized = value.trim().toLowerCase().replaceAll("_", "-");

  if (
    normalized === "measured" ||
    normalized === "derived" ||
    normalized === "transferred" ||
    normalized === "calibrated" ||
    normalized === "engineering" ||
    normalized === "visual-only" ||
    normalized === "hypothesis-experimental"
  ) {
    return normalized;
  }

  if (normalized === "approximation" || normalized === "mechanistic-approximation") {
    return "mechanistic-approximation";
  }

  if (normalized === "transferred-mechanistic-approximation") {
    return "transferred-mechanistic-approximation";
  }

  if (normalized === "experimental" || normalized === "hypothesis/experimental") {
    return "hypothesis-experimental";
  }

  return null;
}

const BADGES: Readonly<Record<EvidenceBadgeKind, EvidenceBadge>> = {
  measured: {
    kind: "measured",
    label: "Measured",
    iconToken: "ruler",
    patternToken: "solid",
    meaning: "Directly sourced from an experimental measurement in the stated context.",
  },
  derived: {
    kind: "derived",
    label: "Derived",
    iconToken: "equation",
    patternToken: "double-line",
    meaning: "Computed from sourced values using a documented transformation or equation.",
  },
  transferred: {
    kind: "transferred",
    label: "Transferred",
    iconToken: "bridge",
    patternToken: "diagonal",
    meaning: "Sourced from a different strain, assay, medium, or experimental system and explicitly caveated.",
  },
  calibrated: {
    kind: "calibrated",
    label: "Calibrated",
    iconToken: "tune",
    patternToken: "dot-grid",
    meaning: "Chosen or fitted for a stated scenario target rather than directly measured in this exact system.",
  },
  approximation: {
    kind: "approximation",
    label: "Model approximation",
    iconToken: "model",
    patternToken: "crosshatch",
    meaning: "A literature-grounded mechanistic form whose exact scenario behavior depends on modeling assumptions.",
  },
  engineering: {
    kind: "engineering",
    label: "Engineering",
    iconToken: "wrench",
    patternToken: "dash",
    meaning: "A numerical, display, or software parameter; not a measured biological constant.",
  },
  "visual-only": {
    kind: "visual-only",
    label: "Visual only",
    iconToken: "eye",
    patternToken: "outline",
    meaning: "Presentation-only metadata with no authority over simulation outcomes.",
  },
  experimental: {
    kind: "experimental",
    label: "Experimental",
    iconToken: "flask",
    patternToken: "warning-stripe",
    meaning: "A hypothesis or sandbox behavior that must not be presented as established biology.",
  },
};

function badgesForClass(evidenceClass: EvidenceClass): readonly EvidenceBadge[] {
  if (evidenceClass === "transferred-mechanistic-approximation") {
    return [BADGES.transferred, BADGES.approximation];
  }

  const kind: EvidenceBadgeKind =
    evidenceClass === "mechanistic-approximation"
      ? "approximation"
      : evidenceClass === "hypothesis-experimental"
        ? "experimental"
        : evidenceClass;

  return [BADGES[kind]];
}

function buildDetails(
  input: ProvenancePresentationInput,
): readonly ProvenanceDetailRow[] {
  const details: ProvenanceDetailRow[] = [];

  if (input.valueText !== undefined) details.push({ label: "Value", value: input.valueText });
  if (input.units !== undefined) details.push({ label: "Units", value: input.units });
  if (input.context !== undefined) details.push({ label: "Context", value: input.context });
  if (input.transformation !== undefined) {
    details.push({ label: "Transformation", value: input.transformation });
  }
  if (input.uncertainty !== undefined) {
    details.push({ label: "Uncertainty", value: input.uncertainty });
  }
  if (input.sources !== undefined) {
    for (const source of input.sources) {
      assertNonEmpty("source.id", source.id);
      assertNonEmpty("source.label", source.label);
      details.push({
        label: "Source",
        value:
          source.locator === undefined
            ? source.label
            : `${source.label} · ${source.locator}`,
        ...(source.href === undefined ? {} : { href: source.href }),
      });
    }
  }

  return details;
}

function buildDisclosures(
  input: ProvenancePresentationInput,
): readonly string[] {
  const disclosures: string[] = [];

  if (input.evidenceClass === "engineering") {
    disclosures.push("Engineering parameter: do not present this value as a real bacterial constant.");
  }
  if (input.evidenceClass === "visual-only") {
    disclosures.push("Visual-only: this value cannot change simulation outcomes.");
  }
  if (input.evidenceClass === "hypothesis-experimental") {
    disclosures.push("Experimental/sandbox evidence: do not present this as established biology.");
  }
  if (
    input.evidenceClass === "transferred" ||
    input.evidenceClass === "transferred-mechanistic-approximation"
  ) {
    disclosures.push("Transferred evidence: the source context is not identical to the active scenario.");
  }
  if (
    input.evidenceClass === "mechanistic-approximation" ||
    input.evidenceClass === "transferred-mechanistic-approximation"
  ) {
    disclosures.push("Model approximation: mechanism form and scenario calibration are distinct claims.");
  }

  if (input.transferNote !== undefined) disclosures.push(input.transferNote);
  if (input.calibrationNote !== undefined) disclosures.push(input.calibrationNote);
  if (input.limitation !== undefined) disclosures.push(input.limitation);

  return disclosures;
}

function missingRequirements(
  input: ProvenancePresentationInput,
): readonly string[] {
  const missing: string[] = [];
  const hasSources = input.sources !== undefined && input.sources.length > 0;

  if (requiresSource(input.evidenceClass) && !hasSources) {
    missing.push("Provenance incomplete: a source is required for this evidence class.");
  }

  if (
    (input.evidenceClass === "transferred" ||
      input.evidenceClass === "transferred-mechanistic-approximation") &&
    input.transferNote === undefined
  ) {
    missing.push("Provenance incomplete: transferred evidence requires an explicit transfer note.");
  }

  if (input.evidenceClass === "calibrated" && input.calibrationNote === undefined) {
    missing.push("Provenance incomplete: calibrated evidence requires a calibration note.");
  }

  if (
    (input.evidenceClass === "mechanistic-approximation" ||
      input.evidenceClass === "transferred-mechanistic-approximation") &&
    input.limitation === undefined
  ) {
    missing.push("Provenance incomplete: model approximations require a visible limitation.");
  }

  if (input.evidenceClass === "derived" && input.transformation === undefined) {
    missing.push("Provenance incomplete: derived evidence requires a documented transformation.");
  }

  return missing;
}

function requiresSource(evidenceClass: EvidenceClass): boolean {
  return (
    evidenceClass === "measured" ||
    evidenceClass === "derived" ||
    evidenceClass === "transferred" ||
    evidenceClass === "mechanistic-approximation" ||
    evidenceClass === "transferred-mechanistic-approximation"
  );
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim().length === 0) {
    throw new TypeError(`${name} must be non-empty`);
  }
}
