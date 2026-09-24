import rawT4Mg1655Evidence from "../../../data/phage/t4_mg1655_nabergoj_2018.json";

export interface PhageLifeHistorySource {
  readonly key: string;
  readonly label: string;
  readonly doi: string;
}

export interface PhageLifeHistoryContext {
  readonly culture: string;
  readonly medium: string;
  readonly mediumCompositionGPerL: Readonly<{
    tryptone: number;
    sodiumChloride: number;
    yeastExtract: number;
  }>;
  readonly pH: number;
  readonly temperatureC: number;
}

export interface MeasuredPhageLifeHistoryRow {
  readonly growthRatePerHour: number;
  readonly adsorptionConstantMlPerMin: number;
  readonly adsorptionConstantSdMlPerMin: number;
  readonly latentPeriodMinutes: number;
  readonly latentPeriodSdMinutes: number;
  readonly burstSizePfuPerCell: number;
  readonly burstSizeSdPfuPerCell: number;
}

export interface PhageLifeHistoryEvidence {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly source: PhageLifeHistorySource;
  readonly phage: Readonly<{
    name: string;
    collectionId: string;
  }>;
  readonly host: Readonly<{
    species: string;
    background: string;
    collectionId: string;
  }>;
  readonly context: PhageLifeHistoryContext;
  readonly measuredDomain: Readonly<{
    growthRatePerHourMin: number;
    growthRatePerHourMax: number;
  }>;
  readonly units: Readonly<{
    growthRate: "h^-1";
    adsorptionConstant: "mL min^-1";
    latentPeriod: "min";
    burstSize: "PFU cell^-1";
  }>;
  readonly provenance: Readonly<{
    classification: "measured";
    limitation: string;
  }>;
  readonly rows: readonly MeasuredPhageLifeHistoryRow[];
}

export interface PhageLifeHistoryValues {
  readonly adsorptionConstantMlPerMin: number;
  readonly latentPeriodMinutes: number;
  readonly burstSizePfuPerCell: number;
}

export interface PhageLifeHistoryUncertainty {
  readonly adsorptionConstantSdMlPerMin: number;
  readonly latentPeriodSdMinutes: number;
  readonly burstSizeSdPfuPerCell: number;
}

interface ResolutionBase {
  readonly requestedGrowthRatePerHour: number;
  readonly source: PhageLifeHistorySource;
  readonly context: PhageLifeHistoryContext;
  readonly measuredDomain: PhageLifeHistoryEvidence["measuredDomain"];
}

export type PhageLifeHistoryResolution =
  | (ResolutionBase & {
      readonly status: "exact";
      readonly evidenceClass: "measured";
      readonly values: PhageLifeHistoryValues;
      readonly uncertainty: PhageLifeHistoryUncertainty;
      readonly sourceRows: readonly [MeasuredPhageLifeHistoryRow];
    })
  | (ResolutionBase & {
      readonly status: "interpolated";
      readonly evidenceClass: "derived";
      readonly transformation: "linear-interpolation";
      readonly values: PhageLifeHistoryValues;
      readonly uncertainty: null;
      readonly sourceRows: readonly [
        MeasuredPhageLifeHistoryRow,
        MeasuredPhageLifeHistoryRow,
      ];
    })
  | (ResolutionBase & {
      readonly status: "out-of-domain";
      readonly evidenceClass: null;
      readonly sourceRows: readonly [];
    });

export const T4_MG1655_LIFE_HISTORY = parseLifeHistoryEvidence(
  rawT4Mg1655Evidence as unknown,
);

/**
 * Resolve measured T4/MG1655 life-history evidence without extrapolation.
 *
 * Exact source rows remain measured. Values between adjacent measured rows use
 * deterministic linear interpolation and are explicitly labelled derived.
 * Petra does not invent an interpolated SD: derived results retain both
 * measured bracket rows so callers can present their source uncertainties.
 */
export function resolvePhageLifeHistory(
  evidence: PhageLifeHistoryEvidence,
  growthRatePerHour: number,
): PhageLifeHistoryResolution {
  finiteNonNegative("growthRatePerHour", growthRatePerHour);

  const base: ResolutionBase = {
    requestedGrowthRatePerHour: growthRatePerHour,
    source: evidence.source,
    context: evidence.context,
    measuredDomain: evidence.measuredDomain,
  };

  if (
    growthRatePerHour < evidence.measuredDomain.growthRatePerHourMin ||
    growthRatePerHour > evidence.measuredDomain.growthRatePerHourMax
  ) {
    return {
      ...base,
      status: "out-of-domain",
      evidenceClass: null,
      sourceRows: [],
    };
  }

  const exact = evidence.rows.find(
    (row) => row.growthRatePerHour === growthRatePerHour,
  );
  if (exact !== undefined) {
    return {
      ...base,
      status: "exact",
      evidenceClass: "measured",
      values: valuesFromRow(exact),
      uncertainty: uncertaintyFromRow(exact),
      sourceRows: [exact],
    };
  }

  for (let index = 1; index < evidence.rows.length; index += 1) {
    const lower = evidence.rows[index - 1];
    const upper = evidence.rows[index];
    if (lower === undefined || upper === undefined) continue;
    if (
      growthRatePerHour <= lower.growthRatePerHour ||
      growthRatePerHour >= upper.growthRatePerHour
    ) {
      continue;
    }

    const fraction =
      (growthRatePerHour - lower.growthRatePerHour) /
      (upper.growthRatePerHour - lower.growthRatePerHour);

    return {
      ...base,
      status: "interpolated",
      evidenceClass: "derived",
      transformation: "linear-interpolation",
      values: {
        adsorptionConstantMlPerMin: interpolate(
          lower.adsorptionConstantMlPerMin,
          upper.adsorptionConstantMlPerMin,
          fraction,
        ),
        latentPeriodMinutes: interpolate(
          lower.latentPeriodMinutes,
          upper.latentPeriodMinutes,
          fraction,
        ),
        burstSizePfuPerCell: interpolate(
          lower.burstSizePfuPerCell,
          upper.burstSizePfuPerCell,
          fraction,
        ),
      },
      uncertainty: null,
      sourceRows: [lower, upper],
    };
  }

  throw new Error(
    "life-history evidence domain and measured rows are inconsistent",
  );
}

function valuesFromRow(
  row: MeasuredPhageLifeHistoryRow,
): PhageLifeHistoryValues {
  return {
    adsorptionConstantMlPerMin: row.adsorptionConstantMlPerMin,
    latentPeriodMinutes: row.latentPeriodMinutes,
    burstSizePfuPerCell: row.burstSizePfuPerCell,
  };
}

function uncertaintyFromRow(
  row: MeasuredPhageLifeHistoryRow,
): PhageLifeHistoryUncertainty {
  return {
    adsorptionConstantSdMlPerMin: row.adsorptionConstantSdMlPerMin,
    latentPeriodSdMinutes: row.latentPeriodSdMinutes,
    burstSizeSdPfuPerCell: row.burstSizeSdPfuPerCell,
  };
}

function interpolate(lower: number, upper: number, fraction: number): number {
  return lower + (upper - lower) * fraction;
}

function parseLifeHistoryEvidence(raw: unknown): PhageLifeHistoryEvidence {
  if (!isRecord(raw)) throw new TypeError("phage life-history evidence must be an object");

  const rows = raw.rows;
  if (!Array.isArray(rows) || rows.length < 2) {
    throw new TypeError("phage life-history evidence requires at least two rows");
  }

  if (raw.schemaVersion !== 1) {
    throw new TypeError("unsupported phage life-history schema version");
  }

  const source = requireRecord(raw.source, "source");
  requireNonEmptyString(source.key, "source.key");
  requireNonEmptyString(source.label, "source.label");
  requireNonEmptyString(source.doi, "source.doi");

  const phage = requireRecord(raw.phage, "phage");
  requireNonEmptyString(phage.name, "phage.name");
  requireNonEmptyString(phage.collectionId, "phage.collectionId");

  const host = requireRecord(raw.host, "host");
  requireNonEmptyString(host.species, "host.species");
  requireNonEmptyString(host.background, "host.background");
  requireNonEmptyString(host.collectionId, "host.collectionId");

  const context = requireRecord(raw.context, "context");
  requireNonEmptyString(context.culture, "context.culture");
  requireNonEmptyString(context.medium, "context.medium");
  finitePositive("context.pH", context.pH);
  finitePositive("context.temperatureC", context.temperatureC);
  const composition = requireRecord(
    context.mediumCompositionGPerL,
    "context.mediumCompositionGPerL",
  );
  finitePositive("context.mediumCompositionGPerL.tryptone", composition.tryptone);
  finitePositive(
    "context.mediumCompositionGPerL.sodiumChloride",
    composition.sodiumChloride,
  );
  finitePositive(
    "context.mediumCompositionGPerL.yeastExtract",
    composition.yeastExtract,
  );

  const domain = requireRecord(raw.measuredDomain, "measuredDomain");
  const domainMin = finiteNonNegative(
    "measuredDomain.growthRatePerHourMin",
    domain.growthRatePerHourMin,
  );
  const domainMax = finiteNonNegative(
    "measuredDomain.growthRatePerHourMax",
    domain.growthRatePerHourMax,
  );
  if (domainMin >= domainMax) {
    throw new RangeError("measured growth-rate domain must be increasing");
  }

  const units = requireRecord(raw.units, "units");
  if (
    units.growthRate !== "h^-1" ||
    units.adsorptionConstant !== "mL min^-1" ||
    units.latentPeriod !== "min" ||
    units.burstSize !== "PFU cell^-1"
  ) {
    throw new TypeError("unexpected T4/MG1655 life-history units");
  }

  const provenance = requireRecord(raw.provenance, "provenance");
  if (provenance.classification !== "measured") {
    throw new TypeError("source life-history table must be classified measured");
  }
  requireNonEmptyString(provenance.limitation, "provenance.limitation");
  requireNonEmptyString(raw.id, "id");

  let previousGrowthRate = -Infinity;
  for (let index = 0; index < rows.length; index += 1) {
    const row = requireRecord(rows[index], `rows[${index}]`);
    const growthRate = finiteNonNegative(
      `rows[${index}].growthRatePerHour`,
      row.growthRatePerHour,
    );
    if (growthRate <= previousGrowthRate) {
      throw new RangeError("life-history rows must be strictly increasing");
    }
    previousGrowthRate = growthRate;

    finiteNonNegative(
      `rows[${index}].adsorptionConstantMlPerMin`,
      row.adsorptionConstantMlPerMin,
    );
    finiteNonNegative(
      `rows[${index}].adsorptionConstantSdMlPerMin`,
      row.adsorptionConstantSdMlPerMin,
    );
    finiteNonNegative(
      `rows[${index}].latentPeriodMinutes`,
      row.latentPeriodMinutes,
    );
    finiteNonNegative(
      `rows[${index}].latentPeriodSdMinutes`,
      row.latentPeriodSdMinutes,
    );
    finiteNonNegative(
      `rows[${index}].burstSizePfuPerCell`,
      row.burstSizePfuPerCell,
    );
    finiteNonNegative(
      `rows[${index}].burstSizeSdPfuPerCell`,
      row.burstSizeSdPfuPerCell,
    );
  }

  const first = requireRecord(rows[0], "rows[0]");
  const last = requireRecord(rows[rows.length - 1], "rows[last]");
  if (
    first.growthRatePerHour !== domainMin ||
    last.growthRatePerHour !== domainMax
  ) {
    throw new RangeError("measured domain must match first and last source rows");
  }

  return raw as unknown as PhageLifeHistoryEvidence;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new TypeError(`${name} must be an object`);
  return value;
}

function requireNonEmptyString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value;
}

function finiteNonNegative(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`);
  }
  return value;
}

function finitePositive(name: string, value: unknown): number {
  const number = finiteNonNegative(name, value);
  if (number === 0) throw new RangeError(`${name} must be positive`);
  return number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
