import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AnalysisPanel } from "./AnalysisPanel";
import { buildLineageTree, buildScientificChart } from "./model";

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
});
