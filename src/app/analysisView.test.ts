import { describe, expect, it } from "vitest";

import {
  ANALYSIS_MAX_POINTS_PER_SERIES,
  projectAuthoritativeAnalysis,
  type AuthoritativeAnalysisRecords,
} from "./analysisView";

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
});
