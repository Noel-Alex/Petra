import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { App } from "./App";
import { AnalysisSurface } from "./AnalysisSurface";
import type { AuthoritativeAnalysisRecords } from "./analysisView";

const RECORDS: AuthoritativeAnalysisRecords = {
  identity: {
    runIdentity: "run-authoritative",
    stateIdentity: "state-authoritative",
    simulationTimeHours: 1,
  },
  series: [
    {
      id: "population",
      label: "Population biomass",
      unit: "model-biomass",
      appearanceToken: "lineage-cyan",
      patternToken: "solid-ring",
      points: [
        { timeHours: 0, value: 1 },
        { timeHours: 1, value: 2 },
      ],
    },
    {
      id: "resource",
      label: "Remaining resource",
      unit: "model-resource",
      appearanceToken: "resource",
      patternToken: "dash",
      points: [
        { timeHours: 0, value: 1 },
        { timeHours: 1, value: 0.5 },
      ],
    },
  ],
  lineages: [
    {
      lineageId: "ancestor",
      parentLineageId: null,
      genotypeId: "ancestor",
      createdAtHours: 0,
      extinctAtHours: null,
    },
  ],
};

describe("AnalysisSurface", () => {
  it("shows an honest unavailable state instead of fixture/synthetic analysis", () => {
    const html = renderToStaticMarkup(
      <AnalysisSurface records={null} motion="full" />,
    );

    expect(html).toContain('data-analysis-status="unavailable"');
    expect(html).toContain('<details');
    expect(html).not.toContain('<details open');
    expect(html).toContain("not connected");
    expect(html).toContain("Authoritative analysis unavailable");
    expect(html).toContain(
      "Petra will not substitute synthetic or visual-demo data",
    );
    expect(html).not.toContain("Scientific time series");
  });

  it("mounts the existing authoritative AnalysisPanel as a secondary disclosure", () => {
    const html = renderToStaticMarkup(
      <AnalysisSurface records={RECORDS} motion="reduced" />,
    );

    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain('data-analysis-status="available"');
    expect(html).toContain('data-run-identity="run-authoritative"');
    expect(html).toContain('data-state-identity="state-authoritative"');
    expect(html).toContain("Scientific trajectories &amp; lineage ancestry");
    expect(html).toContain("Scientific time series");
    expect(html).toContain("model-biomass");
    expect(html).toContain("model-resource");
    expect(html.match(/data-chart-unit=/g) ?? []).toHaveLength(2);
    expect(html).toContain('data-motion="reduced"');
    expect(html).toContain("Source samples only · no invented intermediate values");
  });

  it("threads high contrast through analysis without changing scientific records", () => {
    const html = renderToStaticMarkup(
      <AnalysisSurface
        records={RECORDS}
        motion="off"
        contrastMode="high-contrast"
      />,
    );

    expect(html).toContain('data-contrast-mode="high-contrast"');
    expect(html).toContain('data-lineage-id="ancestor"');
    expect(html).toContain('data-contrast-mode="high-contrast"');
    expect(html).toContain("--analysis-lineage-stroke-scale:1.6");
  });

  it("mounts the unavailable analysis seam in the default app without manufacturing data", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('data-analysis-status="unavailable"');
    expect(html).toContain('<details');
    expect(html).not.toContain('<details open');
    expect(html).toContain("not connected");
    expect(html).toContain("Authoritative analysis unavailable");
    expect(html).not.toContain("Scientific time series");
  });

  it("lets an authoritative caller populate the app without changing runtime authority", () => {
    const html = renderToStaticMarkup(<App analysisRecords={RECORDS} />);

    expect(html).toContain('data-analysis-status="available"');
    expect(html).toContain('data-state-identity="state-authoritative"');
    expect(html).toContain("Scientific time series");
    expect(html).toContain("model-biomass");
    expect(html).toContain("model-resource");
  });
});
