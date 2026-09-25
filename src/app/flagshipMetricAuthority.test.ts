import { describe, expect, it } from "vitest";

import rawAuthority from "../../data/analysis/flagship_metric_authority_v1.json";
import flagshipScenario from "../../data/presets/ecoli_ciprofloxacin_v1.json";
import { composedConfigurationFingerprint } from "../sim/authoritative";
import { ComposedSimulationEngine } from "../sim/composedEngine";
import { buildDefaultFlagshipRun } from "./flagshipRunPreset";
import {
  createFlagshipLiveAnalysisHistory,
  parseFlagshipMetricAuthority,
  resolveFlagshipMetricAuthorityForRun,
} from "./flagshipMetricAuthority";

const EXPECTED_ELEVATED_MIC_GENOTYPES = [
  "A",
  "B",
  "D",
  "E",
  "AB",
  "AC",
  "AD",
  "AE",
  "BC",
  "BD",
  "ACB",
] as const;

describe("flagshipMetricAuthority", () => {
  it("binds the exact elevated-MIC-relative-to-founder cohort", () => {
    const authority = parseFlagshipMetricAuthority(
      rawAuthority,
      flagshipScenario,
    );

    expect(authority.scenarioId).toBe(flagshipScenario.id);
    expect(authority.scenarioVersion).toBe(flagshipScenario.version);
    expect(authority.resistantCohort.founderGenotypeId).toBe("WT");
    expect(authority.resistantCohort.founderMicMgPerL).toBe(0.016);
    expect(authority.resistantCohort.memberGenotypeIds).toEqual(
      EXPECTED_ELEVATED_MIC_GENOTYPES,
    );
    expect(authority.resistantCohort.memberGenotypeIds).not.toContain("C");
    expect(authority.resistantCohort.clinicalBreakpointAuthority).toBe(false);
    expect(authority.samplingPolicy).toEqual({
      version: 1,
      everyTicks: 1,
      offsetTicks: 0,
    });
  });

  it("rejects stale explicit cohort membership instead of treating all mutants as resistant", () => {
    const stale = structuredClone(rawAuthority);
    stale.resistantCohort.memberGenotypeIds = [
      ...stale.resistantCohort.memberGenotypeIds,
      "C",
    ];

    expect(() =>
      parseFlagshipMetricAuthority(stale, flagshipScenario),
    ).toThrow(/members must exactly equal/);
  });

  it("rejects MIC drift that changes the cohort boundary", () => {
    const driftedScenario = structuredClone(flagshipScenario);
    const genotypeA = driftedScenario.genotypes.find(
      (genotype) => genotype.id === "A",
    );
    expect(genotypeA).toBeDefined();
    genotypeA!.mic_mg_L = 0.016;

    expect(() =>
      parseFlagshipMetricAuthority(rawAuthority, driftedScenario),
    ).toThrow(/members must exactly equal/);
  });

  it("rejects foreign scenario and parameter-set versions", () => {
    const foreignScenario = structuredClone(flagshipScenario);
    foreignScenario.version = "foreign-scenario-version";
    expect(() =>
      parseFlagshipMetricAuthority(rawAuthority, foreignScenario),
    ).toThrow(/exact scenario id\/version/);

    const foreignParameterSet = structuredClone(flagshipScenario);
    foreignParameterSet.composedParameterSet.version = "foreign-parameter-set";
    expect(() =>
      parseFlagshipMetricAuthority(rawAuthority, foreignParameterSet),
    ).toThrow(/exact composed parameter-set id\/version/);
  });

  it("rejects ambiguous or broadened cohort semantics", () => {
    const ambiguous = structuredClone(rawAuthority);
    ambiguous.resistantCohort.definition = "all-mutants";

    expect(() =>
      parseFlagshipMetricAuthority(ambiguous, flagshipScenario),
    ).toThrow(/unsupported flagship resistant-cohort definition/);
  });

  it("rejects invalid metric cadence through the shared sampling validator", () => {
    const invalid = structuredClone(rawAuthority);
    invalid.samplingPolicy.everyTicks = 0;

    expect(() =>
      parseFlagshipMetricAuthority(invalid, flagshipScenario),
    ).toThrow(/everyTicks must be a positive safe integer/);
  });

  it("rejects missing, fixture, and drifted provenance bindings", () => {
    const { plan } = buildDefaultFlagshipRun();
    const { parameterSetBinding: _omitted, ...identityWithoutBinding } =
      plan.identity;
    expect(() =>
      resolveFlagshipMetricAuthorityForRun({
        ...plan,
        identity: identityWithoutBinding,
      }),
    ).toThrow(/versioned parameter-set configuration binding/);

    expect(() =>
      resolveFlagshipMetricAuthorityForRun({
        ...plan,
        identity: {
          ...plan.identity,
          parameterSetBinding: {
            ...plan.identity.parameterSetBinding!,
            authority: "fixture",
          },
        },
      }),
    ).toThrow(/fixture parameter-set ids must start/);

    expect(() =>
      resolveFlagshipMetricAuthorityForRun({
        ...plan,
        identity: {
          ...plan.identity,
          parameterSetBinding: {
            ...plan.identity.parameterSetBinding!,
            configurationFingerprint:
              plan.identity.parameterSetBinding!.configurationFingerprint +
              "-drift",
          },
        },
      }),
    ).toThrow(/configuration fingerprint does not match/);
  });

  it("rejects a self-consistent provenance binding when the composed MIC table drifts from scenario authority", () => {
    const { plan } = buildDefaultFlagshipRun();
    const ciprofloxacin = plan.config.ciprofloxacin;
    if (ciprofloxacin === null) {
      throw new Error("flagship run must expose ciprofloxacin MIC authority");
    }

    const driftedConfig = {
      ...plan.config,
      ciprofloxacin: {
        ...ciprofloxacin,
        genotypeMicMgPerL: ciprofloxacin.genotypeMicMgPerL.map(
          (record, index) =>
            index === 1
              ? { ...record, micMgPerL: record.micMgPerL + 0.001 }
              : record,
        ),
      },
    };
    const configurationFingerprint =
      composedConfigurationFingerprint(driftedConfig);
    const driftedBinding = {
      ...plan.parameterSetBinding,
      configurationFingerprint,
    };

    expect(() =>
      resolveFlagshipMetricAuthorityForRun({
        ...plan,
        config: driftedConfig,
        parameterSetBinding: driftedBinding,
        identity: {
          ...plan.identity,
          parameterSetBinding: driftedBinding,
        },
      }),
    ).toThrow(/composed genotype MIC authority drifted/);
  });

  it("binds the authority to the exact flagship run before constructing history", () => {
    const { plan } = buildDefaultFlagshipRun();
    const authority = resolveFlagshipMetricAuthorityForRun(plan);
    expect(authority.resistantCohort.memberGenotypeIds).toEqual(
      EXPECTED_ELEVATED_MIC_GENOTYPES,
    );

    const history = createFlagshipLiveAnalysisHistory(plan);
    expect(history.snapshot().samplingPolicy).toEqual(authority.samplingPolicy);
    expect(history.snapshot().samples).toEqual([]);

    const initialSnapshot = new ComposedSimulationEngine(
      plan.identity,
      plan.config,
    ).snapshot();
    expect(history.append(initialSnapshot)).toBe(true);
    expect(history.snapshot().samples).toHaveLength(1);
    expect(history.snapshot().samples[0]?.resistantFraction).toBe(0);

    expect(() =>
      resolveFlagshipMetricAuthorityForRun({
        ...plan,
        identity: {
          ...plan.identity,
          scenarioVersion: "foreign-scenario-version",
        },
      }),
    ).toThrow(/foreign scenario identity/);

    expect(() =>
      resolveFlagshipMetricAuthorityForRun({
        ...plan,
        identity: {
          ...plan.identity,
          parameterSetVersion: "foreign-parameter-set",
        },
      }),
    ).toThrow(/foreign parameter-set identity/);
  });
});
