import type { AuthoritativeLineageAnalysis } from "../sim/evolution/analysis";
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type RunIdentity,
} from "../sim/protocol";
import { describe, expect, it } from "vitest";

import {
  ANALYSIS_MAX_POINTS_PER_SERIES,
  projectAuthoritativeAnalysis,
  type AuthoritativeAnalysisRecords,
} from "./analysisView";

function composedRunIdentity(seed = 7): RunIdentity {
  return {
    engineVersion: ENGINE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
    scenarioId: "analysis-fixture",
    scenarioVersion: "1",
    parameterSetId: "fixture:analysis",
    parameterSetVersion: "1",
    parameterSetBinding: {
      schemaVersion: 1,
      authority: "fixture",
      parameterSetId: "fixture:analysis",
      parameterSetVersion: "1",
      configurationFingerprint: "fixture-config",
    },
    seed,
  };
}

function records(): AuthoritativeAnalysisRecords {
  return {
    identity: {
      runIdentity: "run-flagship-1",
      stateIdentity: "snapshot-12",
      simulationTimeHours: 2,
    },
    series: [
      {
        id: "ancestor",
        label: "Ancestor biomass",
        unit: "model-biomass",
        appearanceToken: "lineage-cyan",
        patternToken: "solid-ring",
        points: [
          { timeHours: 0, value: 1 },
          { timeHours: 1, value: 2 },
          { timeHours: 2, value: 3 },
        ],
      },
    ],
    lineages: [
      {
        lineageId: "ancestor",
        parentLineageId: null,
        genotypeId: "ancestor-genotype",
        createdAtHours: 0,
        extinctAtHours: null,
      },
      {
        lineageId: "child",
        parentLineageId: "ancestor",
        genotypeId: "child-genotype",
        createdAtHours: 1.5,
        extinctAtHours: null,
      },
    ],
  };
}

describe("authoritative analysis app projection", () => {
  it("fails honest-to-empty when authoritative records are absent", () => {
    expect(projectAuthoritativeAnalysis(null)).toEqual({
      status: "unavailable",
      message:
        "Authoritative analysis is not connected. Petra will not substitute synthetic or visual-demo data.",
    });
  });

  it("projects source samples and ancestry only through existing analysis helpers", () => {
    const view = projectAuthoritativeAnalysis(records());
    expect(view.status).toBe("available");
    if (view.status !== "available") return;

    expect(ANALYSIS_MAX_POINTS_PER_SERIES).toBe(240);
    expect(view.identity.stateIdentity).toBe("snapshot-12");
    expect(view.charts).toHaveLength(1);
    expect(view.charts[0]!.unit).toBe("model-biomass");
    expect(view.charts[0]!.interpolation).toBe("none");
    expect(view.charts[0]!.series[0]?.sourcePointCount).toBe(3);
    expect(view.lineageTree.nodes.map((node) => node.lineageId)).toEqual([
      "ancestor",
      "child",
    ]);
  });

  it("projects high contrast as presentation emphasis without changing lineage identity", () => {
    const standard = projectAuthoritativeAnalysis(records());
    const high = projectAuthoritativeAnalysis(records(), {
      contrastMode: "high-contrast",
    });
    expect(standard.status).toBe("available");
    expect(high.status).toBe("available");
    if (standard.status !== "available" || high.status !== "available") return;

    expect(
      high.lineageTree.nodes.map((node) => [
        node.lineageId,
        node.appearanceToken,
        node.patternToken,
      ]),
    ).toEqual(
      standard.lineageTree.nodes.map((node) => [
        node.lineageId,
        node.appearanceToken,
        node.patternToken,
      ]),
    );
    expect(
      high.lineageTree.nodes.every(
        (node) =>
          node.contrastMode === "high-contrast" &&
          node.strokeWidthScale > 1,
      ),
    ).toBe(true);
  });

  it("groups mixed scientific units into separate charts in source order", () => {
    const input = records();
    const view = projectAuthoritativeAnalysis({
      ...input,
      series: [
        input.series[0]!,
        {
          ...input.series[0]!,
          id: "resource",
          label: "Resource",
          unit: "model-resource",
        },
        {
          ...input.series[0]!,
          id: "child-biomass",
          label: "Child biomass",
        },
      ],
    });

    expect(view.status).toBe("available");
    if (view.status !== "available") return;
    expect(view.charts.map((chart) => chart.unit)).toEqual([
      "model-biomass",
      "model-resource",
    ]);
    expect(view.charts[0]!.series.map((series) => series.id)).toEqual([
      "ancestor",
      "child-biomass",
    ]);
    expect(view.charts[1]!.series.map((series) => series.id)).toEqual([
      "resource",
    ]);
  });

  it("refuses samples or ancestry records from the future of the bound state", () => {
    const input = records();

    expect(() =>
      projectAuthoritativeAnalysis({
        ...input,
        series: [
          {
            ...input.series[0]!,
            points: [{ timeHours: 2.01, value: 4 }],
          },
        ],
      }),
    ).toThrow(/after its authoritative state time/);

    expect(() =>
      projectAuthoritativeAnalysis({
        ...input,
        lineages: [
          {
            lineageId: "future",
            parentLineageId: null,
            genotypeId: "future-genotype",
            createdAtHours: 2.01,
            extinctAtHours: null,
          },
        ],
      }),
    ).toThrow(/created after its authoritative state time/);
  });
  it("preserves the full #665 lineage analysis detail instead of collapsing it to ancestry", () => {
    const input = records();
    const lineageAnalysis: AuthoritativeLineageAnalysis = {
      schemaVersion: 1,
      identity: composedRunIdentity(),
      configurationFingerprint: "fixture-config",
      simulationTimeHours: 2,
      records: [
        {
          lineageId: "ancestor",
          parentLineageId: null,
          genotypeId: "ancestor-genotype",
          genotypeLabel: "Ancestor genotype",
          createdAtHours: 0,
          extinctAtHours: null,
          originCellIndex: 17,
          mutationClass: null,
          status: "extant",
          abundanceModelBiomass: 3.25,
          relativeFitness: 1,
          ciprofloxacin: {
            micMgPerL: 0.016,
            responseShift: null,
          },
          sourceKeys: ["source:ancestor"],
          assumptionKeys: ["assumption:context"],
        },
      ],
    };

    const view = projectAuthoritativeAnalysis({
      identity: {
        ...input.identity,
        composedRunIdentity: composedRunIdentity(),
      },
      series: input.series,
      lineageAnalysis,
    });
    expect(view.status).toBe("available");
    if (view.status !== "available") return;

    expect(view.lineageTree.nodes[0]?.scientificDetail).toEqual({
      genotypeLabel: "Ancestor genotype",
      originCellIndex: 17,
      mutationClass: null,
      abundanceModelBiomass: 3.25,
      relativeFitness: 1,
      ciprofloxacin: {
        micMgPerL: 0.016,
        responseShift: null,
      },
      sourceKeys: ["source:ancestor"],
      assumptionKeys: ["assumption:context"],
    });
  });

  it("refuses rich lineage detail on the generic ancestry-only app seam", () => {
    const input = records();
    const invalid = {
      ...input,
      lineages: [{
        lineageId: "ancestor",
        parentLineageId: null,
        genotypeId: "ancestor-genotype",
        createdAtHours: 0,
        extinctAtHours: null,
        scientificDetail: {
          genotypeLabel: "Hand-authored label",
          originCellIndex: null,
          mutationClass: null,
          abundanceModelBiomass: 99,
          relativeFitness: 99,
          sourceKeys: ["invented"],
          assumptionKeys: [],
        },
      }],
    } as unknown as AuthoritativeAnalysisRecords;

    expect(() => projectAuthoritativeAnalysis(invalid)).toThrow(
      /requires full authoritative lineageAnalysis/,
    );
  });

  it("requires exact composed run identity for rich lineage authority", () => {
    const input = records();
    const lineageAnalysis: AuthoritativeLineageAnalysis = {
      schemaVersion: 1,
      identity: composedRunIdentity(8),
      configurationFingerprint: "fixture-config",
      simulationTimeHours: 2,
      records: [],
    };

    expect(() =>
      projectAuthoritativeAnalysis({
        identity: input.identity,
        series: input.series,
        lineageAnalysis,
      }),
    ).toThrow(/requires an exact composed run identity/);

    expect(() =>
      projectAuthoritativeAnalysis({
        identity: {
          ...input.identity,
          composedRunIdentity: composedRunIdentity(7),
        },
        series: input.series,
        lineageAnalysis,
      }),
    ).toThrow(/seed mismatch|different run identity/);
  });

  it("requires exactly one lineage source and exact full-analysis time/lifecycle identity", () => {
    const input = records();
    expect(() =>
      projectAuthoritativeAnalysis({
        identity: input.identity,
        series: input.series,
      }),
    ).toThrow(/exactly one lineage source/);

    expect(() =>
      projectAuthoritativeAnalysis({
        ...input,
        lineageAnalysis: {
          schemaVersion: 1,
          identity: composedRunIdentity(),
          configurationFingerprint: "fixture-config",
          simulationTimeHours: 2,
          records: [],
        },
      }),
    ).toThrow(/exactly one lineage source/);

    const analysis: AuthoritativeLineageAnalysis = {
      schemaVersion: 1,
      identity: composedRunIdentity(),
      configurationFingerprint: "fixture-config",
      simulationTimeHours: 1.5,
      records: [],
    };
    expect(() =>
      projectAuthoritativeAnalysis({
        identity: {
          ...input.identity,
          composedRunIdentity: composedRunIdentity(),
        },
        series: input.series,
        lineageAnalysis: analysis,
      }),
    ).toThrow(/time does not match/);

    expect(() =>
      projectAuthoritativeAnalysis({
        identity: {
          ...input.identity,
          composedRunIdentity: composedRunIdentity(),
        },
        series: input.series,
        lineageAnalysis: {
          ...analysis,
          simulationTimeHours: 2,
          records: [{
            lineageId: "ancestor",
            parentLineageId: null,
            genotypeId: "ancestor-genotype",
            genotypeLabel: "Ancestor genotype",
            createdAtHours: 0,
            extinctAtHours: null,
            originCellIndex: null,
            mutationClass: null,
            status: "extinct",
            abundanceModelBiomass: 0,
            relativeFitness: 1,
            sourceKeys: [],
            assumptionKeys: [],
          }],
        },
      }),
    ).toThrow(/lifecycle status disagrees/);
  });

});
