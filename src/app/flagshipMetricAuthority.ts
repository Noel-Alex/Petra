import authorityData from "../../data/analysis/flagship_metric_authority_v1.json";
import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import {
  METRIC_SAMPLING_POLICY_VERSION,
  validateMetricSamplingPolicy,
  type MetricSamplingPolicy,
} from "../sim/metrics";
import type { RunIdentity } from "../sim/protocol";
import { LiveAnalysisHistory } from "./liveAnalysisHistory";

export const FLAGSHIP_METRIC_AUTHORITY_SCHEMA_VERSION = 1 as const;

export type FlagshipResistanceCohortDefinition =
  "ciprofloxacin-mic-strictly-greater-than-founder";

export interface FlagshipMetricAuthority {
  readonly schemaVersion: typeof FLAGSHIP_METRIC_AUTHORITY_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly parameterSetId: string;
  readonly parameterSetVersion: string;
  readonly resistantCohort: {
    readonly id: string;
    readonly definition: FlagshipResistanceCohortDefinition;
    readonly founderGenotypeId: string;
    readonly founderMicMgPerL: number;
    readonly memberGenotypeIds: readonly string[];
    readonly micUnit: "mg/L";
    readonly claimScope: "within-scenario-relative-mic";
    readonly clinicalBreakpointAuthority: false;
    readonly provenance: {
      readonly classification: "derived";
      readonly sourceKeys: readonly string[];
      readonly transformation: string;
      readonly limitation: string;
    };
  };
  readonly samplingPolicy: MetricSamplingPolicy;
  readonly samplingProvenance: {
    readonly classification: "engineering";
    readonly rationale: string;
    readonly limitation: string;
  };
}

type UnknownRecord = Record<string, unknown>;

const AUTHORITY_KEYS = new Set([
  "schemaVersion",
  "id",
  "version",
  "scenarioId",
  "scenarioVersion",
  "parameterSetId",
  "parameterSetVersion",
  "resistantCohort",
  "samplingPolicy",
]);
const COHORT_KEYS = new Set([
  "id",
  "definition",
  "founderGenotypeId",
  "memberGenotypeIds",
  "micUnit",
  "claimScope",
  "clinicalBreakpointAuthority",
  "provenance",
]);
const COHORT_PROVENANCE_KEYS = new Set([
  "classification",
  "sourceKeys",
  "transformation",
  "limitation",
]);
const SAMPLING_KEYS = new Set([
  "version",
  "everyTicks",
  "offsetTicks",
  "provenance",
]);
const SAMPLING_PROVENANCE_KEYS = new Set([
  "classification",
  "rationale",
  "limitation",
]);

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value as UnknownRecord;
}

function assertOnlyKnownKeys(
  name: string,
  record: UnknownRecord,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unknown field ${JSON.stringify(key)}`);
    }
  }
}

function requireCanonicalText(name: string, value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value
  ) {
    throw new Error(`${name} must be canonical non-empty text`);
  }
  return value;
}

function requirePositiveFinite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be finite and positive`);
  }
  return value;
}

function requireStringArray(name: string, value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`);
  }
  const result = value.map((entry, index) => {
    if (!(index in value)) {
      throw new Error(`${name} must be a dense array`);
    }
    return requireCanonicalText(`${name}[${index}]`, entry);
  });
  if (new Set(result).size !== result.length) {
    throw new Error(`${name} must contain unique values`);
  }
  return Object.freeze(result);
}

function sameOrderedStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value))
  );
}

interface ScenarioGenotypeMic {
  readonly id: string;
  readonly micMgPerL: number;
  readonly sourceKey: string;
}

function parseScenarioGenotypeMics(
  scenario: UnknownRecord,
): readonly ScenarioGenotypeMic[] {
  if (!Array.isArray(scenario.genotypes) || scenario.genotypes.length === 0) {
    throw new Error("flagship scenario genotypes must be a non-empty array");
  }
  const genotypeValues = scenario.genotypes;

  const seen = new Set<string>();
  return Object.freeze(
    genotypeValues.map((value, index) => {
      if (!(index in genotypeValues)) {
        throw new Error("flagship scenario genotypes must be a dense array");
      }
      const genotype = requireRecord(`scenario.genotypes[${index}]`, value);
      const id = requireCanonicalText(
        `scenario.genotypes[${index}].id`,
        genotype.id,
      );
      if (seen.has(id)) {
        throw new Error(`duplicate flagship genotype id: ${id}`);
      }
      seen.add(id);
      return Object.freeze({
        id,
        micMgPerL: requirePositiveFinite(
          `scenario.genotypes[${index}].mic_mg_L`,
          genotype.mic_mg_L,
        ),
        sourceKey: requireCanonicalText(
          `scenario.genotypes[${index}].citation`,
          genotype.citation,
        ),
      });
    }),
  );
}

function parseConfiguredFounderGenotypeIds(
  scenario: UnknownRecord,
): readonly string[] {
  const parameterSet = requireRecord(
    "scenario.composedParameterSet",
    scenario.composedParameterSet,
  );
  if (
    !Array.isArray(parameterSet.lineages) ||
    parameterSet.lineages.length === 0
  ) {
    throw new Error(
      "flagship composed parameter set lineages must be a non-empty array",
    );
  }
  const lineageValues = parameterSet.lineages;

  const founderIds = lineageValues.map((value, index) => {
    if (!(index in lineageValues)) {
      throw new Error(
        "flagship composed parameter set lineages must be a dense array",
      );
    }
    const lineage = requireRecord(
      `scenario.composedParameterSet.lineages[${index}]`,
      value,
    );
    return requireCanonicalText(
      `scenario.composedParameterSet.lineages[${index}].genotypeId`,
      lineage.genotypeId,
    );
  });
  return Object.freeze([...new Set(founderIds)]);
}

/**
 * Parse the repository-owned flagship analysis contract against the exact
 * scenario that supplies its genotype MIC authority.
 *
 * "Resistant" here is deliberately a within-scenario relative-MIC cohort:
 * membership is exact iff MIC > the configured founder MIC. No clinical
 * breakpoint, genotype-label heuristic, renderer state, or "all mutants"
 * shortcut is admitted.
 */
export function parseFlagshipMetricAuthority(
  value: unknown,
  scenarioValue: unknown,
): FlagshipMetricAuthority {
  const record = requireRecord("flagship metric authority", value);
  assertOnlyKnownKeys("flagship metric authority", record, AUTHORITY_KEYS);

  if (record.schemaVersion !== FLAGSHIP_METRIC_AUTHORITY_SCHEMA_VERSION) {
    throw new Error("unsupported flagship metric-authority schema version");
  }

  const scenario = requireRecord("flagship scenario", scenarioValue);
  const scenarioId = requireCanonicalText("scenario.id", scenario.id);
  const scenarioVersion = requireCanonicalText(
    "scenario.version",
    scenario.version,
  );
  const parameterSet = requireRecord(
    "scenario.composedParameterSet",
    scenario.composedParameterSet,
  );
  const parameterSetId = requireCanonicalText(
    "scenario.composedParameterSet.id",
    parameterSet.id,
  );
  const parameterSetVersion = requireCanonicalText(
    "scenario.composedParameterSet.version",
    parameterSet.version,
  );

  const declaredScenarioId = requireCanonicalText(
    "flagship metric authority scenarioId",
    record.scenarioId,
  );
  const declaredScenarioVersion = requireCanonicalText(
    "flagship metric authority scenarioVersion",
    record.scenarioVersion,
  );
  const declaredParameterSetId = requireCanonicalText(
    "flagship metric authority parameterSetId",
    record.parameterSetId,
  );
  const declaredParameterSetVersion = requireCanonicalText(
    "flagship metric authority parameterSetVersion",
    record.parameterSetVersion,
  );

  if (
    declaredScenarioId !== scenarioId ||
    declaredScenarioVersion !== scenarioVersion
  ) {
    throw new Error(
      "flagship metric authority must match the exact scenario id/version",
    );
  }
  if (
    declaredParameterSetId !== parameterSetId ||
    declaredParameterSetVersion !== parameterSetVersion
  ) {
    throw new Error(
      "flagship metric authority must match the exact composed parameter-set id/version",
    );
  }

  const cohort = requireRecord(
    "flagship metric authority resistantCohort",
    record.resistantCohort,
  );
  assertOnlyKnownKeys(
    "flagship metric authority resistantCohort",
    cohort,
    COHORT_KEYS,
  );
  if (
    cohort.definition !== "ciprofloxacin-mic-strictly-greater-than-founder"
  ) {
    throw new Error("unsupported flagship resistant-cohort definition");
  }
  if (cohort.micUnit !== "mg/L") {
    throw new Error("flagship resistant cohort MIC unit must be mg/L");
  }
  if (cohort.claimScope !== "within-scenario-relative-mic") {
    throw new Error(
      "flagship resistant cohort must remain within-scenario relative MIC",
    );
  }
  if (cohort.clinicalBreakpointAuthority !== false) {
    throw new Error(
      "flagship resistant cohort must not claim clinical breakpoint authority",
    );
  }

  const founderGenotypeId = requireCanonicalText(
    "flagship resistant cohort founderGenotypeId",
    cohort.founderGenotypeId,
  );
  const configuredFounderIds = parseConfiguredFounderGenotypeIds(scenario);
  if (
    configuredFounderIds.length !== 1 ||
    configuredFounderIds[0] !== founderGenotypeId
  ) {
    throw new Error(
      "flagship resistant cohort founder must match the exact configured founder genotype",
    );
  }

  const genotypes = parseScenarioGenotypeMics(scenario);
  const founder = genotypes.find(
    (genotype) => genotype.id === founderGenotypeId,
  );
  if (founder === undefined) {
    throw new Error(
      "flagship resistant cohort founder is missing from genotype MIC authority",
    );
  }

  const memberGenotypeIds = requireStringArray(
    "flagship resistant cohort memberGenotypeIds",
    cohort.memberGenotypeIds,
  );
  const expectedMembers = genotypes
    .filter(
      (genotype) =>
        genotype.id !== founderGenotypeId &&
        genotype.micMgPerL > founder.micMgPerL,
    )
    .map((genotype) => genotype.id);
  if (!sameOrderedStrings(memberGenotypeIds, expectedMembers)) {
    throw new Error(
      "flagship resistant cohort members must exactly equal scenario genotypes with MIC strictly greater than the configured founder",
    );
  }

  const cohortProvenance = requireRecord(
    "flagship resistant cohort provenance",
    cohort.provenance,
  );
  assertOnlyKnownKeys(
    "flagship resistant cohort provenance",
    cohortProvenance,
    COHORT_PROVENANCE_KEYS,
  );
  if (cohortProvenance.classification !== "derived") {
    throw new Error(
      "flagship resistant cohort provenance classification must be derived",
    );
  }
  const sourceKeys = requireStringArray(
    "flagship resistant cohort provenance sourceKeys",
    cohortProvenance.sourceKeys,
  );
  const scenarioSourceKeys = [...new Set(genotypes.map((item) => item.sourceKey))];
  if (!sameStringSet(sourceKeys, scenarioSourceKeys)) {
    throw new Error(
      "flagship resistant cohort source keys must exactly match genotype MIC provenance",
    );
  }

  const sampling = requireRecord(
    "flagship metric authority samplingPolicy",
    record.samplingPolicy,
  );
  assertOnlyKnownKeys(
    "flagship metric authority samplingPolicy",
    sampling,
    SAMPLING_KEYS,
  );
  const samplingPolicy: MetricSamplingPolicy = {
    version: sampling.version as typeof METRIC_SAMPLING_POLICY_VERSION,
    everyTicks:
      typeof sampling.everyTicks === "number" ? sampling.everyTicks : Number.NaN,
    offsetTicks:
      typeof sampling.offsetTicks === "number"
        ? sampling.offsetTicks
        : Number.NaN,
  };
  validateMetricSamplingPolicy(samplingPolicy);

  const samplingProvenance = requireRecord(
    "flagship metric sampling provenance",
    sampling.provenance,
  );
  assertOnlyKnownKeys(
    "flagship metric sampling provenance",
    samplingProvenance,
    SAMPLING_PROVENANCE_KEYS,
  );
  if (samplingProvenance.classification !== "engineering") {
    throw new Error(
      "flagship metric sampling provenance classification must be engineering",
    );
  }

  return Object.freeze({
    schemaVersion: FLAGSHIP_METRIC_AUTHORITY_SCHEMA_VERSION,
    id: requireCanonicalText("flagship metric authority id", record.id),
    version: requireCanonicalText(
      "flagship metric authority version",
      record.version,
    ),
    scenarioId,
    scenarioVersion,
    parameterSetId,
    parameterSetVersion,
    resistantCohort: Object.freeze({
      id: requireCanonicalText("flagship resistant cohort id", cohort.id),
      definition: cohort.definition,
      founderGenotypeId,
      founderMicMgPerL: founder.micMgPerL,
      memberGenotypeIds,
      micUnit: "mg/L",
      claimScope: "within-scenario-relative-mic",
      clinicalBreakpointAuthority: false,
      provenance: Object.freeze({
        classification: "derived",
        sourceKeys,
        transformation: requireCanonicalText(
          "flagship resistant cohort provenance transformation",
          cohortProvenance.transformation,
        ),
        limitation: requireCanonicalText(
          "flagship resistant cohort provenance limitation",
          cohortProvenance.limitation,
        ),
      }),
    }),
    samplingPolicy: Object.freeze({ ...samplingPolicy }),
    samplingProvenance: Object.freeze({
      classification: "engineering",
      rationale: requireCanonicalText(
        "flagship metric sampling provenance rationale",
        samplingProvenance.rationale,
      ),
      limitation: requireCanonicalText(
        "flagship metric sampling provenance limitation",
        samplingProvenance.limitation,
      ),
    }),
  });
}

export function resolveFlagshipMetricAuthorityForRun(
  identity: RunIdentity,
): FlagshipMetricAuthority {
  const authority = parseFlagshipMetricAuthority(authorityData, flagshipScenario);
  if (
    identity.scenarioId !== authority.scenarioId ||
    identity.scenarioVersion !== authority.scenarioVersion
  ) {
    throw new Error(
      "flagship metric authority cannot bind a foreign scenario identity",
    );
  }
  if (
    identity.parameterSetId !== authority.parameterSetId ||
    identity.parameterSetVersion !== authority.parameterSetVersion
  ) {
    throw new Error(
      "flagship metric authority cannot bind a foreign parameter-set identity",
    );
  }
  return authority;
}

/**
 * Construct flagship metric history without allowing product callers to invent
 * a resistance cohort or silently reuse renderer/animation cadence.
 */
export function createFlagshipLiveAnalysisHistory(
  identity: RunIdentity,
): LiveAnalysisHistory {
  const authority = resolveFlagshipMetricAuthorityForRun(identity);
  return new LiveAnalysisHistory({
    identity,
    samplingPolicy: authority.samplingPolicy,
    resistantGenotypeIds: authority.resistantCohort.memberGenotypeIds,
  });
}
