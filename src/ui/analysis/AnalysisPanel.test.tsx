import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnalysisPanel } from "./AnalysisPanel";
import { buildLineageTree, buildScientificChart } from "./model";

// Vite resolves raw assets in Vitest; this project intentionally omits vite/client globals.
// @ts-expect-error Vite raw asset import is runtime-supported but not declared in tsconfig types.
import analysisCss from "./analysisPanel.css?raw";

const chart = buildScientificChart(
  [
    {
      id: "wt",
      label: "Wild type",
      unit: "relative biomass",
      appearanceToken: "lineage-wt",
      patternToken: "solid",
      points: [
        { timeHours: 0, value: 1 },
        { timeHours: 1, value: 2 },
        { timeHours: 2, value: 3 },
      ],
    },
    {
      id: "resistant",
      label: "Resistant lineage",
      unit: "relative biomass",
      appearanceToken: "lineage-resistant",
      patternToken: "dash",
      points: [
        { timeHours: 0, value: 0.1 },
        { timeHours: 1, value: 0.4 },
        { timeHours: 2, value: 2.7 },
      ],
    },
  ],
  { maxPointsPerSeries: 20, zeroBaseline: true },
);

const tree = buildLineageTree([
  {
    lineageId: "L1",
    parentLineageId: null,
    genotypeId: "WT",
    createdAtHours: 0,
    extinctAtHours: null,
  },
  {
    lineageId: "L2",
    parentLineageId: "L1",
    genotypeId: "gyrA S83L",
    createdAtHours: 1,
    extinctAtHours: 2,
  },
]);

describe("AnalysisPanel", () => {
  it("renders explicit units, simulation time, authoritative sample metadata and no-interpolation disclosure", () => {
    const html = renderToStaticMarkup(
      <AnalysisPanel chart={chart} lineageTree={tree} motion="full" />,
    );

    expect(html).toContain("Scientific time series");
    expect(html).toContain("relative biomass");
    expect(html).toContain("Simulation time");
    expect(html).toContain('data-interpolation="none"');
    expect(html).toContain("Source samples only");
    expect(html).toContain("no invented intermediate values");
    expect(html).toContain("Connecting segments are visual guides only");
    expect(html).toContain("3 source samples");
  });

  it("keeps series identity redundant beyond color", () => {
    const html = renderToStaticMarkup(
      <AnalysisPanel chart={chart} lineageTree={tree} motion="reduced" />,
    );

    expect(html).toContain("Wild type");
    expect(html).toContain("Resistant lineage");
    expect(html).toContain('data-pattern-token="solid"');
    expect(html).toContain('data-pattern-token="dash"');
    expect(html).toContain("analysis-chart__series-number");
    expect(html).toContain('stroke-dasharray="10 5"');
  });

  it("renders ancestry with text plus distinct extant/extinct geometry", () => {
    const html = renderToStaticMarkup(
      <AnalysisPanel chart={chart} lineageTree={tree} motion="off" />,
    );

    expect(html).toContain("Lineage tree");
    expect(html).toContain("Circle means extant");
    expect(html).toContain("diamond means extinct");
    expect(html).toContain('data-lineage-id="L1"');
    expect(html).toContain('data-lineage-status="extant"');
    expect(html).toContain('data-lineage-id="L2"');
    expect(html).toContain('data-lineage-status="extinct"');
    expect(html).toContain("gyrA S83L");
  });


  it("renders complete semantic records even when SVG geometry is decimated", () => {
    const denseChart = buildScientificChart(
      [{
        id: "dense",
        label: "Dense lineage",
        unit: "relative biomass",
        appearanceToken: "lineage-dense",
        patternToken: "solid",
        points: Array.from({ length: 25 }, (_, index) => ({
          timeHours: index,
          value: index * 2,
        })),
      }],
      { maxPointsPerSeries: 4 },
    );
    expect(denseChart.series[0]!.points).toHaveLength(4);

    const html = renderToStaticMarkup(
      <AnalysisPanel chart={denseChart} lineageTree={tree} motion="off" />,
    );

    expect(html).toContain("Complete source data");
    expect(html).toContain("Complete authoritative source samples");
    expect(html.match(/data-source-sample-index=/g) ?? []).toHaveLength(25);
    expect(html).toContain('data-source-series-id="dense"');
    expect(html).toContain("Series ID");
    expect(html).toContain("Simulation time");

    expect(html).toContain("Complete ancestry data");
    expect(html).toContain("Complete authoritative lineage ancestry records");
    expect(html.match(/data-lineage-record-id=/g) ?? []).toHaveLength(2);
    expect(html).toContain('data-lineage-record-id="L1"');
    expect(html).toContain("Parent lineage");
    expect(html).toContain("gyrA S83L");
  });


  it("preserves round-trip numeric precision in semantic source records", () => {
    const preciseChart = buildScientificChart(
      [{
        id: "precise",
        label: "Precise lineage",
        unit: "model-biomass",
        appearanceToken: "lineage-precise",
        patternToken: "solid",
        points: [
          { timeHours: 0, value: 1 },
          { timeHours: 0.123456789, value: 1.2345678912345 },
        ],
      }],
      { maxPointsPerSeries: 20 },
    );
    const preciseTree = buildLineageTree([
      {
        lineageId: "P1",
        parentLineageId: null,
        genotypeId: "WT",
        createdAtHours: 0.3333333333333333,
        extinctAtHours: 1.23456789012345,
      },
    ]);

    const html = renderToStaticMarkup(
      <AnalysisPanel
        chart={preciseChart}
        lineageTree={preciseTree}
        motion="off"
      />,
    );

    expect(html).toContain("0.123456789 h");
    expect(html).toContain("1.2345678912345");
    expect(html).toContain("0.3333333333333333 h");
    expect(html).toContain("1.23456789012345 h");
  });

  it("projects shared motion policy without tying it to biological time", () => {
    const full = renderToStaticMarkup(
      <AnalysisPanel chart={chart} lineageTree={tree} motion="full" />,
    );
    const off = renderToStaticMarkup(
      <AnalysisPanel chart={chart} lineageTree={tree} motion="off" />,
    );

    expect(full).toContain('data-chart-treatment="animate"');
    expect(off).toContain('data-chart-treatment="static-emphasis"');
    expect(off).toContain("--analysis-chart-ms:0ms");
    expect(off).toContain("Simulation time");
  });

  it("renders a stable empty ancestry state without inventing lineage records", () => {
    const emptyTree = buildLineageTree([]);
    const html = renderToStaticMarkup(
      <AnalysisPanel chart={chart} lineageTree={emptyTree} motion="full" />,
    );

    expect(html).toContain("No authoritative lineage ancestry records yet.");
    expect(html).not.toContain('data-lineage-id="');
  });
  it("keeps authoritative data disclosures on Petra's expo touch-target contract", () => {
    expect(analysisCss).toContain(
      ".analysis-data > summary {\n  display: flex;\n  min-height: 2.75rem;",
    );
    expect(analysisCss).not.toContain("min-width: 2.75rem");
  });

});
