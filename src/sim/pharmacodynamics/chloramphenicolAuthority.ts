import {
  GREULICH_CHLORAMPHENICOL_MODEL_ID,
  type GreulichChloramphenicolFit,
} from "./chloramphenicol";

export const CHLORAMPHENICOL_AUTHORITY_SCHEMA_VERSION = 1 as const;

export interface ChloramphenicolFitRecord {
  readonly id: string;
  readonly carbonSource: "glycerol" | "glucose";
  readonly lambda0StarPerHour: number;
  readonly lambda0StarStandardDeviationPerHour: number;
  readonly ic50StarMicromolar: number;
  readonly ic50StarStandardDeviationMicromolar: number;
  readonly measuredDrugFreeGrowthRatesPerHour: readonly number[];
}

export interface ChloramphenicolAuthority {
  readonly schemaVersion: typeof CHLORAMPHENICOL_AUTHORITY_SCHEMA_VERSION;
  readonly recordKind: "antimicrobial-pharmacodynamics-authority";
  readonly id: string;
  readonly version: string;
  readonly drug: {
    readonly id: "chloramphenicol";
    readonly concentrationUnit: "uM";
  };
  readonly organism: {
    readonly taxon: "Escherichia coli";
    readonly strain: "K-12 MG1655";
  };
  readonly model: {
    readonly id: typeof GREULICH_CHLORAMPHENICOL_MODEL_ID;
    readonly effectKind: "growth-inhibition";
    readonly equationReference: "Greulich et al. 2015 equation 7";
    readonly fits: readonly ChloramphenicolFitRecord[];
  };
  readonly provenance: {
    readonly classification: "derived";
    readonly sourceKey: string;
    readonly doi: string;
    readonly context: string;
    readonly limitation: string;
  };
  readonly limitations: readonly string[];
}

const ROOT_KEYS = [
  "schemaVersion",
  "recordKind",
  "id",
  "version",
  "drug",
  "organism",
  "model",
  "provenance",
  "limitations",
] as const;
const DRUG_KEYS = ["id", "concentrationUnit"] as const;
const ORGANISM_KEYS = ["taxon", "strain"] as const;
const MODEL_KEYS = ["id", "effectKind", "equationReference", "fits"] as const;
const FIT_KEYS = [
  "id",
  "carbonSource",
  "lambda0StarPerHour",
  "lambda0StarStandardDeviationPerHour",
  "ic50StarMicromolar",
  "ic50StarStandardDeviationMicromolar",
  "measuredDrugFreeGrowthRatesPerHour",
] as const;
const PROVENANCE_KEYS = [
  "classification",
  "sourceKey",
  "doi",
  "context",
  "limitation",
] as const;
const CANONICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;
const CANONICAL_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+-]*$/;

function requireRecord(
  value: unknown,
  path: string,
): Readonly<Record<string, unknown>> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
  return value as Readonly<Record<string, unknown>>;
}

function assertExactKeys(
  record: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  path: string,
): void {
  const expected = new Set(keys);
  for (const key of Object.keys(record)) {
    if (!expected.has(key)) {
      throw new Error(`${path} contains unsupported field ${JSON.stringify(key)}`);
    }
  }
  for (const key of keys) {
    if (!(key in record)) {
      throw new Error(`${path} is missing required field ${JSON.stringify(key)}`);
    }
  }
}

function canonicalText(path: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${path} must be non-empty canonical text`);
  }
  return value;
}

function canonicalIdentifier(path: string, value: unknown): string {
  const text = canonicalText(path, value);
  if (!CANONICAL_ID.test(text)) {
    throw new Error(`${path} contains unsupported identifier characters`);
  }
  return text;
}

function canonicalVersion(path: string, value: unknown): string {
  const text = canonicalText(path, value);
  if (!CANONICAL_VERSION.test(text)) {
    throw new Error(`${path} contains unsupported version characters`);
  }
  return text;
}

function finitePositive(path: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${path} must be finite and > 0`);
  }
  return value;
}

function finiteNonNegative(path: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${path} must be finite and >= 0`);
  }
  return value;
}

function parseGrowthRates(path: string, value: unknown): readonly number[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  const parsed = value.map((item, index) =>
    finitePositive(`${path}[${index}]`, item),
  );
  for (let index = 1; index < parsed.length; index += 1) {
    if (parsed[index]! <= parsed[index - 1]!) {
      throw new Error(`${path} must be strictly increasing and unique`);
    }
  }
  return parsed;
}

function parseFit(value: unknown, index: number): ChloramphenicolFitRecord {
  const path = `chloramphenicol authority model.fits[${index}]`;
  const fit = requireRecord(value, path);
  assertExactKeys(fit, FIT_KEYS, path);

  const carbonSource = canonicalText(`${path}.carbonSource`, fit.carbonSource);
  if (carbonSource !== "glycerol" && carbonSource !== "glucose") {
    throw new Error(`${path}.carbonSource must be glycerol or glucose`);
  }

  return {
    id: canonicalIdentifier(`${path}.id`, fit.id),
    carbonSource,
    lambda0StarPerHour: finitePositive(
      `${path}.lambda0StarPerHour`,
      fit.lambda0StarPerHour,
    ),
    lambda0StarStandardDeviationPerHour: finiteNonNegative(
      `${path}.lambda0StarStandardDeviationPerHour`,
      fit.lambda0StarStandardDeviationPerHour,
    ),
    ic50StarMicromolar: finitePositive(
      `${path}.ic50StarMicromolar`,
      fit.ic50StarMicromolar,
    ),
    ic50StarStandardDeviationMicromolar: finiteNonNegative(
      `${path}.ic50StarStandardDeviationMicromolar`,
      fit.ic50StarStandardDeviationMicromolar,
    ),
    measuredDrugFreeGrowthRatesPerHour: parseGrowthRates(
      `${path}.measuredDrugFreeGrowthRatesPerHour`,
      fit.measuredDrugFreeGrowthRatesPerHour,
    ),
  };
}

function parseTextArray(path: string, value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${path} must be a non-empty array`);
  }
  const seen = new Set<string>();
  return value.map((item, index) => {
    const text = canonicalText(`${path}[${index}]`, item);
    if (seen.has(text)) {
      throw new Error(`${path} contains duplicate text`);
    }
    seen.add(text);
    return text;
  });
}

export function parseChloramphenicolAuthority(
  value: unknown,
): ChloramphenicolAuthority {
  const root = requireRecord(value, "chloramphenicol authority");
  assertExactKeys(root, ROOT_KEYS, "chloramphenicol authority");

  if (root.schemaVersion !== CHLORAMPHENICOL_AUTHORITY_SCHEMA_VERSION) {
    throw new Error(
      `chloramphenicol authority schemaVersion must equal ${CHLORAMPHENICOL_AUTHORITY_SCHEMA_VERSION}`,
    );
  }
  if (root.recordKind !== "antimicrobial-pharmacodynamics-authority") {
    throw new Error(
      "chloramphenicol authority recordKind must be antimicrobial-pharmacodynamics-authority",
    );
  }

  const drug = requireRecord(root.drug, "chloramphenicol authority drug");
  assertExactKeys(drug, DRUG_KEYS, "chloramphenicol authority drug");
  if (drug.id !== "chloramphenicol") {
    throw new Error("chloramphenicol authority drug.id must be chloramphenicol");
  }
  if (drug.concentrationUnit !== "uM") {
    throw new Error(
      "chloramphenicol authority concentrationUnit must be uM",
    );
  }

  const organism = requireRecord(
    root.organism,
    "chloramphenicol authority organism",
  );
  assertExactKeys(
    organism,
    ORGANISM_KEYS,
    "chloramphenicol authority organism",
  );
  if (organism.taxon !== "Escherichia coli" || organism.strain !== "K-12 MG1655") {
    throw new Error(
      "chloramphenicol authority organism must be Escherichia coli K-12 MG1655",
    );
  }

  const model = requireRecord(root.model, "chloramphenicol authority model");
  assertExactKeys(model, MODEL_KEYS, "chloramphenicol authority model");
  if (model.id !== GREULICH_CHLORAMPHENICOL_MODEL_ID) {
    throw new Error(
      `chloramphenicol authority model.id must be ${GREULICH_CHLORAMPHENICOL_MODEL_ID}`,
    );
  }
  if (model.effectKind !== "growth-inhibition") {
    throw new Error(
      "chloramphenicol authority effectKind must be growth-inhibition",
    );
  }
  if (model.equationReference !== "Greulich et al. 2015 equation 7") {
    throw new Error(
      "chloramphenicol authority equationReference is unsupported",
    );
  }
  if (!Array.isArray(model.fits) || model.fits.length === 0) {
    throw new Error("chloramphenicol authority model.fits must be non-empty");
  }
  const fits = model.fits.map(parseFit);
  const fitIds = new Set<string>();
  const carbonSources = new Set<string>();
  for (const fit of fits) {
    if (fitIds.has(fit.id)) {
      throw new Error("chloramphenicol authority fit IDs must be unique");
    }
    fitIds.add(fit.id);
    if (carbonSources.has(fit.carbonSource)) {
      throw new Error(
        "chloramphenicol authority may define only one fit per carbon source",
      );
    }
    carbonSources.add(fit.carbonSource);
  }

  const provenance = requireRecord(
    root.provenance,
    "chloramphenicol authority provenance",
  );
  assertExactKeys(
    provenance,
    PROVENANCE_KEYS,
    "chloramphenicol authority provenance",
  );
  if (provenance.classification !== "derived") {
    throw new Error(
      "chloramphenicol authority provenance.classification must be derived",
    );
  }

  return {
    schemaVersion: CHLORAMPHENICOL_AUTHORITY_SCHEMA_VERSION,
    recordKind: "antimicrobial-pharmacodynamics-authority",
    id: canonicalIdentifier("chloramphenicol authority id", root.id),
    version: canonicalVersion("chloramphenicol authority version", root.version),
    drug: {
      id: "chloramphenicol",
      concentrationUnit: "uM",
    },
    organism: {
      taxon: "Escherichia coli",
      strain: "K-12 MG1655",
    },
    model: {
      id: GREULICH_CHLORAMPHENICOL_MODEL_ID,
      effectKind: "growth-inhibition",
      equationReference: "Greulich et al. 2015 equation 7",
      fits,
    },
    provenance: {
      classification: "derived",
      sourceKey: canonicalIdentifier(
        "chloramphenicol authority provenance.sourceKey",
        provenance.sourceKey,
      ),
      doi: canonicalText(
        "chloramphenicol authority provenance.doi",
        provenance.doi,
      ),
      context: canonicalText(
        "chloramphenicol authority provenance.context",
        provenance.context,
      ),
      limitation: canonicalText(
        "chloramphenicol authority provenance.limitation",
        provenance.limitation,
      ),
    },
    limitations: parseTextArray(
      "chloramphenicol authority limitations",
      root.limitations,
    ),
  };
}

export function resolveGreulichChloramphenicolFit(
  authority: ChloramphenicolAuthority,
  fitId: string,
): GreulichChloramphenicolFit {
  const canonicalFitId = canonicalIdentifier("chloramphenicol fit id", fitId);
  const record = authority.model.fits.find((fit) => fit.id === canonicalFitId);
  if (!record) {
    throw new Error(
      `chloramphenicol authority does not contain fit ${JSON.stringify(canonicalFitId)}`,
    );
  }

  const minimum = record.measuredDrugFreeGrowthRatesPerHour[0];
  const maximum =
    record.measuredDrugFreeGrowthRatesPerHour[
      record.measuredDrugFreeGrowthRatesPerHour.length - 1
    ];
  if (minimum === undefined || maximum === undefined) {
    throw new Error("chloramphenicol fit growth-rate range is empty");
  }

  return {
    id: record.id,
    lambda0StarPerHour: record.lambda0StarPerHour,
    ic50StarMicromolar: record.ic50StarMicromolar,
    validatedDrugFreeGrowthRateRangePerHour: {
      minimum,
      maximum,
    },
  };
}
