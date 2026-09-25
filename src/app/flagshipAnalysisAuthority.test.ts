import { describe, expect, it } from "vitest";

import { composedConfigurationFingerprint } from "../sim/authoritative";
import {
  COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
} from "../sim/parameterSetBinding";
import { buildDefaultFlagshipRun } from "./flagshipRunPreset";
import {
  createFlagshipRuntimeLineageAnalysisAuthority,
} from "./flagshipAnalysisAuthority";

function withReboundConfig(
  run: ReturnType<typeof buildDefaultFlagshipRun>,
  config: ReturnType<typeof buildDefaultFlagshipRun>["plan"]["config"],
) {
  const fingerprint = composedConfigurationFingerprint(config);
  const binding = {
    schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
    authority: "provenance" as const,
    parameterSetId: run.plan.identity.parameterSetId,
    parameterSetVersion: run.plan.identity.parameterSetVersion,
    configurationFingerprint: fingerprint,
  };
  return {
    ...run.plan,
    identity: {
      ...run.plan.identity,
      parameterSetBinding: binding,
    },
    parameterSetBinding: binding,
    config,
  };
}

describe("flagship lineage-analysis authority", () => {
  it("binds exact bundled genotype labels, MICs, sources, graph, and configuration identity", () => {
    const run = buildDefaultFlagshipRun();
    const authority = createFlagshipRuntimeLineageAnalysisAuthority(run.plan);

    expect(authority.identity).toEqual(run.plan.identity);
    expect(authority.identity).not.toBe(run.plan.identity);
    expect(authority.configurationFingerprint).toBe(
      run.plan.parameterSetBinding.configurationFingerprint,
    );
    expect(authority.evolutionGraph).toEqual(run.plan.config.evolutionGraph);
    expect(authority.evolutionGraph).not.toBe(run.plan.config.evolutionGraph);

    expect(authority.genotypeEvidence).toHaveLength(
      run.plan.config.evolutionGraph.genotypes.length,
    );
    expect(authority.genotypeEvidence.find((record) => record.genotypeId === "WT")).toEqual({
      genotypeId: "WT",
      label: "Wild type",
      ciprofloxacin: {
        micMgPerL: 0.016,
        responseShift: null,
      },
      sourceKeys: ["marcusson_2009"],
      assumptionKeys: [],
    });
    expect(authority.genotypeEvidence.find((record) => record.genotypeId === "A")).toMatchObject({
      label: "gyrA S83L",
      ciprofloxacin: {
        micMgPerL: 0.38,
        responseShift: null,
      },
      sourceKeys: ["marcusson_2009"],
    });
    expect(Object.isFrozen(authority)).toBe(true);
  });

  it("refuses a foreign scenario identity", () => {
    const run = buildDefaultFlagshipRun();

    expect(() =>
      createFlagshipRuntimeLineageAnalysisAuthority({
        ...run.plan,
        identity: {
          ...run.plan.identity,
          scenarioVersion: "foreign-version",
        },
      }),
    ).toThrow(/exact bundled scenario identity/i);
  });

  it("refuses a config that no longer matches the provenance-bound parameter set", () => {
    const run = buildDefaultFlagshipRun();

    expect(() =>
      createFlagshipRuntimeLineageAnalysisAuthority({
        ...run.plan,
        config: {
          ...run.plan.config,
          hoursPerTick: run.plan.config.hoursPerTick * 2,
        },
      }),
    ).toThrow(/configuration fingerprint/i);
  });

  it("refuses MIC drift even when a caller self-consistently rebinds the changed config", () => {
    const run = buildDefaultFlagshipRun();
    const cipro = run.plan.config.ciprofloxacin;
    if (cipro === null) throw new Error("fixture requires ciprofloxacin authority");

    const changedConfig = {
      ...run.plan.config,
      ciprofloxacin: {
        ...cipro,
        genotypeMicMgPerL: cipro.genotypeMicMgPerL.map((record) =>
          record.genotypeId === "A"
            ? { ...record, micMgPerL: record.micMgPerL * 2 }
            : record,
        ),
      },
    };

    expect(() =>
      createFlagshipRuntimeLineageAnalysisAuthority(
        withReboundConfig(run, changedConfig),
      ),
    ).toThrow(/MIC drifted from composed authority/i);
  });

  it("refuses mutation-transition drift under a freshly rebound config", () => {
    const run = buildDefaultFlagshipRun();
    const changedConfig = {
      ...run.plan.config,
      evolutionGraph: {
        ...run.plan.config.evolutionGraph,
        transitions: run.plan.config.evolutionGraph.transitions.map(
          (transition, index) =>
            index === 0
              ? {
                  ...transition,
                  probabilityPerDivision:
                    transition.probabilityPerDivision * 10,
                }
              : transition,
        ),
      },
    };

    expect(() =>
      createFlagshipRuntimeLineageAnalysisAuthority(
        withReboundConfig(run, changedConfig),
      ),
    ).toThrow(/mutation transition drifted from scenario authority/i);
  });

  it("refuses relative-fitness drift under a freshly rebound config", () => {
    const run = buildDefaultFlagshipRun();
    const changedConfig = {
      ...run.plan.config,
      evolutionGraph: {
        ...run.plan.config.evolutionGraph,
        genotypes: run.plan.config.evolutionGraph.genotypes.map((genotype) =>
          genotype.id === "A"
            ? { ...genotype, relativeFitness: genotype.relativeFitness + 0.01 }
            : genotype,
        ),
      },
    };

    expect(() =>
      createFlagshipRuntimeLineageAnalysisAuthority(
        withReboundConfig(run, changedConfig),
      ),
    ).toThrow(/relative fitness drifted from scenario authority/i);
  });

  it("refuses graph/evidence identity drift under a freshly rebound config", () => {
    const run = buildDefaultFlagshipRun();
    const changedConfig = {
      ...run.plan.config,
      evolutionGraph: {
        ...run.plan.config.evolutionGraph,
        genotypes: run.plan.config.evolutionGraph.genotypes.slice(0, -1),
      },
    };

    expect(() =>
      createFlagshipRuntimeLineageAnalysisAuthority(
        withReboundConfig(run, changedConfig),
      ),
    ).toThrow(/cover the exact evolution graph/i);
  });
});
