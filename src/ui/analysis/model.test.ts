import { describe, expect, it } from "vitest";

import {
  buildLineageTree,
  buildScientificChart,
  decimateSourcePoints,
  resolveAnalysisMotion,
  type ScientificSeriesPoint,
} from "./model";

describe("scientific analysis projection", () => {
  it("decimates by selecting only authoritative source points", () => {
    const source: ScientificSeriesPoint[] = Array.from(
      { length: 100 },
      (_, index) => ({
        timeHours: index * 0.25,
        value: index === 51 ? 500 : Math.sin(index / 7) * 10 + 30,
      }),
    );

    const projected = decimateSourcePoints(source, 12);
    expect(projected).toHaveLength(12);
    expect(projected[0]).toBe(source[0]);
    expect(projected.at(-1)).toBe(source.at(-1));
    for (const point of projected) expect(source.includes(point)).toBe(true);
    for (let index = 1; index < projected.length; index += 1) {
      expect(projected[index]!.timeHours).toBeGreaterThanOrEqual(
        projected[index - 1]!.timeHours,
      );
    }
  });

  it("keeps a single sample at biological time zero on a non-negative axis", () => {
    const chart = buildScientificChart(
      [{
        id: "zero-time",
        label: "Zero time",
        unit: "cells",
        appearanceToken: "lineage-cyan",
        patternToken: "solid",
        points: [{ timeHours: 0, value: 5 }],
      }],
      { maxPointsPerSeries: 20 },
    );

    expect(chart.timeMinimumHours).toBe(0);
    expect(chart.timeMaximumHours).toBe(1);
    expect(chart.series[0]!.points[0]!.x).toBe(0);
  });

  it("uses one-sided time expansion near zero without changing the source timestamp", () => {
    const chart = buildScientificChart(
      [{
        id: "early-time",
        label: "Early time",
        unit: "cells",
        appearanceToken: "lineage-cyan",
        patternToken: "solid",
        points: [{ timeHours: 0.5, value: 5 }],
      }],
      { maxPointsPerSeries: 20 },
    );

    expect(chart.timeMinimumHours).toBe(0);
    expect(chart.timeMaximumHours).toBe(1.5);
    expect(chart.series[0]!.sourcePoints[0]!.timeHours).toBe(0.5);
    expect(chart.series[0]!.points[0]!.x).toBeCloseTo(1 / 3);
  });

  it("expands later degenerate biological time symmetrically", () => {
    const chart = buildScientificChart(
      [{
        id: "later-time",
        label: "Later time",
        unit: "cells",
        appearanceToken: "lineage-cyan",
        patternToken: "solid",
        points: [{ timeHours: 20, value: 5 }],
      }],
      { maxPointsPerSeries: 20 },
    );

    expect(chart.timeMinimumHours).toBe(19);
    expect(chart.timeMaximumHours).toBe(21);
    expect(chart.series[0]!.points[0]!.x).toBe(0.5);
  });

  it("uses one shared non-negative time domain when several series share one time", () => {
    const chart = buildScientificChart(
      [
        {
          id: "a",
          label: "A",
          unit: "cells",
          appearanceToken: "lineage-cyan",
          patternToken: "solid",
          points: [{ timeHours: 0.5, value: 1 }],
        },
        {
          id: "b",
          label: "B",
          unit: "cells",
          appearanceToken: "lineage-coral",
          patternToken: "dash",
          points: [{ timeHours: 0.5, value: 2 }],
        },
      ],
      { maxPointsPerSeries: 20 },
    );

    expect(chart.timeMinimumHours).toBe(0);
    expect(chart.timeMaximumHours).toBe(1.5);
    expect(chart.series).toHaveLength(2);
    for (const series of chart.series) {
      expect(series.points[0]!.x).toBeCloseTo(1 / 3);
    }
  });

  it("preserves ordinary time bounds exactly and leaves signed value domains unconstrained", () => {
    const chart = buildScientificChart(
      [{
        id: "ordinary-time",
        label: "Ordinary time",
        unit: "net units",
        appearanceToken: "lineage-cyan",
        patternToken: "solid",
        points: [
          { timeHours: 0.5, value: -2 },
          { timeHours: 2, value: 3 },
        ],
      }],
      { maxPointsPerSeries: 20 },
    );

    expect(chart.timeMinimumHours).toBe(0.5);
    expect(chart.timeMaximumHours).toBe(2);
    expect(chart.valueMinimum).toBe(-2);
    expect(chart.valueMaximum).toBe(3);
  });

  it("computes domains from full source data rather than decimated output", () => {
    const chart = buildScientificChart(
      [{
        id: "wt",
        label: "WT lineage",
        unit: "relative biomass",
        appearanceToken: "lineage-cyan",
        patternToken: "solid",
        points: [
          { timeHours: 0, value: 1 },
          { timeHours: 1, value: 1000 },
          { timeHours: 2, value: 3 },
          { timeHours: 3, value: 4 },
          { timeHours: 4, value: 5 },
        ],
      }],
      { maxPointsPerSeries: 3, zeroBaseline: true },
    );

    expect(chart.valueMinimum).toBe(0);
    expect(chart.valueMaximum).toBe(1000);
    expect(chart.interpolation).toBe("none");
    expect(chart.series[0]!.sourcePointCount).toBe(5);
    expect(chart.series[0]!.points).toHaveLength(3);
  });


  it("preserves every source sample independently of the visual decimation budget", () => {
    const source: ScientificSeriesPoint[] = Array.from(
      { length: 100 },
      (_, index) => ({
        timeHours: index * 0.1,
        value: index * index,
      }),
    );

    const chart = buildScientificChart(
      [{
        id: "complete-source",
        label: "Complete source",
        unit: "model-biomass",
        appearanceToken: "lineage-cyan",
        patternToken: "solid",
        points: source,
      }],
      { maxPointsPerSeries: 12 },
    );

    const series = chart.series[0]!;
    expect(series.points).toHaveLength(12);
    expect(series.sourcePointCount).toBe(100);
    expect(series.sourcePoints).toHaveLength(100);
    expect(series.sourcePoints).toEqual(source);
    expect(series.sourcePoints).not.toBe(source);
  });

  it("refuses to overlay unlike units", () => {
    expect(() =>
      buildScientificChart(
        [
          {
            id: "population",
            label: "Population",
            unit: "cells",
            appearanceToken: "a",
            patternToken: "solid",
            points: [{ timeHours: 0, value: 10 }],
          },
          {
            id: "fraction",
            label: "Resistance",
            unit: "fraction",
            appearanceToken: "b",
            patternToken: "dash",
            points: [{ timeHours: 0, value: 0.2 }],
          },
        ],
        { maxPointsPerSeries: 20 },
      ),
    ).toThrow(/different units/);
  });

  it("rejects duplicate series ids instead of creating ambiguous presentation identity", () => {
    expect(() =>
      buildScientificChart(
        [
          {
            id: "same",
            label: "A",
            unit: "cells",
            appearanceToken: "a",
            patternToken: "solid",
            points: [{ timeHours: 0, value: 1 }],
          },
          {
            id: "same",
            label: "B",
            unit: "cells",
            appearanceToken: "b",
            patternToken: "dash",
            points: [{ timeHours: 0, value: 2 }],
          },
        ],
        { maxPointsPerSeries: 20 },
      ),
    ).toThrow(/duplicate scientific series id/);
  });

  it("rejects duplicate biological timestamps with equal values within one series", () => {
    expect(() =>
      buildScientificChart(
        [{
          id: "population",
          label: "Population",
          unit: "relative biomass",
          appearanceToken: "lineage-cyan",
          patternToken: "solid",
          points: [
            { timeHours: 0, value: 1 },
            { timeHours: 1, value: 2 },
            { timeHours: 1, value: 2 },
          ],
        }],
        { maxPointsPerSeries: 20 },
      ),
    ).toThrow(/unique simulation timestamps/i);
  });

  it("rejects duplicate biological timestamps with different values within one series", () => {
    expect(() =>
      buildScientificChart(
        [{
          id: "population",
          label: "Population",
          unit: "relative biomass",
          appearanceToken: "lineage-cyan",
          patternToken: "solid",
          points: [
            { timeHours: 0, value: 1 },
            { timeHours: 1, value: 2 },
            { timeHours: 1, value: 9 },
          ],
        }],
        { maxPointsPerSeries: 20 },
      ),
    ).toThrow(/unique simulation timestamps/i);
  });

  it("keeps descending timestamps distinct from duplicate timestamp errors", () => {
    expect(() =>
      buildScientificChart(
        [{
          id: "population",
          label: "Population",
          unit: "relative biomass",
          appearanceToken: "lineage-cyan",
          patternToken: "solid",
          points: [
            { timeHours: 0, value: 1 },
            { timeHours: 2, value: 2 },
            { timeHours: 1, value: 3 },
          ],
        }],
        { maxPointsPerSeries: 20 },
      ),
    ).toThrow(/ordered by simulation time/i);
  });

  it("allows different series to share the same biological timestamp", () => {
    expect(() =>
      buildScientificChart(
        [
          {
            id: "a",
            label: "A",
            unit: "relative biomass",
            appearanceToken: "a",
            patternToken: "solid",
            points: [{ timeHours: 1, value: 2 }],
          },
          {
            id: "b",
            label: "B",
            unit: "relative biomass",
            appearanceToken: "b",
            patternToken: "dash",
            points: [{ timeHours: 1, value: 3 }],
          },
        ],
        { maxPointsPerSeries: 20 },
      ),
    ).not.toThrow();
  });

  it("rejects duplicate timestamps before long-series decimation", () => {
    const source: ScientificSeriesPoint[] = Array.from(
      { length: 100 },
      (_, index) => ({
        timeHours: index * 0.25,
        value: Math.sin(index / 9) + 3,
      }),
    );
    source[60] = {
      timeHours: source[59]!.timeHours,
      value: source[60]!.value,
    };

    expect(() => decimateSourcePoints(source, 12)).toThrow(
      /unique simulation timestamps/i,
    );
  });

  it("preserves scientific meaning when motion is reduced or off", () => {
    const reduced = resolveAnalysisMotion("reduced");
    expect(reduced.chart.treatment).toBe("crossfade");
    expect(reduced.lineageBranch.durationMs).toBeGreaterThan(0);

    const off = resolveAnalysisMotion("off");
    expect(off.chart.treatment).toBe("static-emphasis");
    expect(off.lineageBranch.durationMs).toBe(0);
  });
});

describe("lineage ancestry layout", () => {
  const lineages = [
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
      genotypeId: "gyrA-S83L",
      createdAtHours: 2,
      extinctAtHours: null,
    },
    {
      lineageId: "L3",
      parentLineageId: "L1",
      genotypeId: "other",
      createdAtHours: 1,
      extinctAtHours: 3,
    },
  ] as const;

  it("builds deterministic temporal ancestry without changing records", () => {
    const layout = buildLineageTree(lineages);
    expect(layout.nodes.map((node) => node.lineageId)).toEqual(["L1", "L3", "L2"]);
    expect(layout.edges).toEqual([
      { parentLineageId: "L1", childLineageId: "L3" },
      { parentLineageId: "L1", childLineageId: "L2" },
    ]);
    expect(layout.nodes.find((node) => node.lineageId === "L2")?.depth).toBe(1);
    expect(layout.nodes.find((node) => node.lineageId === "L3")?.status).toBe("extinct");
    expect(lineages[1]!.createdAtHours).toBe(2);
  });

  it("uses the shared lineage identity in standard and high-contrast analysis", () => {
    const standard = buildLineageTree(lineages);
    const highContrast = buildLineageTree(lineages, {
      contrastMode: "high-contrast",
    });

    for (const node of standard.nodes) {
      const high = highContrast.nodes.find(
        (candidate) => candidate.lineageId === node.lineageId,
      )!;
      expect(high.appearanceToken).toBe(node.appearanceToken);
      expect(high.patternToken).toBe(node.patternToken);
      expect(high.contrastMode).toBe("high-contrast");
      expect(high.strokeWidthScale).toBeGreaterThan(node.strokeWidthScale);
    }

    expect(
      new Set(standard.nodes.map((node) => node.patternToken)).size,
    ).toBeGreaterThan(1);
  });

  it("keeps a single lineage created at zero on a non-negative time axis", () => {
    const layout = buildLineageTree([{
      lineageId: "L0",
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      extinctAtHours: null,
    }]);

    expect(layout.timeMinimumHours).toBe(0);
    expect(layout.timeMaximumHours).toBe(1);
    expect(layout.nodes[0]!.x).toBe(0);
  });

  it("uses one-sided lineage time expansion near zero", () => {
    const layout = buildLineageTree([{
      lineageId: "L-early",
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0.5,
      extinctAtHours: null,
    }]);

    expect(layout.timeMinimumHours).toBe(0);
    expect(layout.timeMaximumHours).toBe(1.5);
    expect(layout.nodes[0]!.createdAtHours).toBe(0.5);
    expect(layout.nodes[0]!.x).toBeCloseTo(1 / 3);
  });

  it("expands later degenerate lineage time symmetrically", () => {
    const layout = buildLineageTree([{
      lineageId: "L-later",
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 20,
      extinctAtHours: null,
    }]);

    expect(layout.timeMinimumHours).toBe(19);
    expect(layout.timeMaximumHours).toBe(21);
    expect(layout.nodes[0]!.x).toBe(0.5);
  });

  it("keeps equal lineage creation times finite and inside the normalized domain", () => {
    const layout = buildLineageTree([
      {
        lineageId: "root-a",
        parentLineageId: null,
        genotypeId: "A",
        createdAtHours: 0.5,
        extinctAtHours: null,
      },
      {
        lineageId: "root-b",
        parentLineageId: null,
        genotypeId: "B",
        createdAtHours: 0.5,
        extinctAtHours: null,
      },
    ]);

    expect(layout.timeMinimumHours).toBe(0);
    expect(layout.timeMaximumHours).toBe(1.5);
    for (const node of layout.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x).toBeLessThanOrEqual(1);
      expect(node.x).toBeCloseTo(1 / 3);
    }
  });

  it("preserves ordinary non-degenerate lineage creation-time bounds exactly", () => {
    const layout = buildLineageTree([
      {
        lineageId: "root",
        parentLineageId: null,
        genotypeId: "WT",
        createdAtHours: 1,
        extinctAtHours: null,
      },
      {
        lineageId: "child",
        parentLineageId: "root",
        genotypeId: "mutant",
        createdAtHours: 3,
        extinctAtHours: null,
      },
    ]);

    expect(layout.timeMinimumHours).toBe(1);
    expect(layout.timeMaximumHours).toBe(3);
    expect(layout.nodes.map((node) => node.x)).toEqual([0, 1]);
  });

  it("rejects missing parents, temporal impossibilities and cycles", () => {
    expect(() =>
      buildLineageTree([{
        lineageId: "L2",
        parentLineageId: "missing",
        genotypeId: "x",
        createdAtHours: 1,
        extinctAtHours: null,
      }]),
    ).toThrow(/unknown parent/);

    expect(() =>
      buildLineageTree([
        {
          lineageId: "L1",
          parentLineageId: null,
          genotypeId: "root",
          createdAtHours: 2,
          extinctAtHours: null,
        },
        {
          lineageId: "L2",
          parentLineageId: "L1",
          genotypeId: "child",
          createdAtHours: 1,
          extinctAtHours: null,
        },
      ]),
    ).toThrow(/predates its parent/);

    expect(() =>
      buildLineageTree([
        {
          lineageId: "L1",
          parentLineageId: "L2",
          genotypeId: "a",
          createdAtHours: 1,
          extinctAtHours: null,
        },
        {
          lineageId: "L2",
          parentLineageId: "L1",
          genotypeId: "b",
          createdAtHours: 1,
          extinctAtHours: null,
        },
      ]),
    ).toThrow(/cycle/);
  });
  it("preserves supplied scientific detail without aliasing caller evidence arrays", () => {
    const sourceKeys = ["source:gyrA"];
    const assumptionKeys = ["assumption:transfer"];
    const layout = buildLineageTree([{
      lineageId: "detail",
      parentLineageId: null,
      genotypeId: "gyrA-S83L",
      createdAtHours: 0,
      extinctAtHours: null,
      scientificDetail: {
        genotypeLabel: "GyrA S83L",
        originCellIndex: 17,
        mutationClass: "target-site",
        abundanceModelBiomass: 2.5,
        relativeFitness: 0.91,
        sourceKeys,
        assumptionKeys,
      },
    }]);

    const detail = layout.nodes[0]!.scientificDetail;
    expect(detail).toEqual({
      genotypeLabel: "GyrA S83L",
      originCellIndex: 17,
      mutationClass: "target-site",
      abundanceModelBiomass: 2.5,
      relativeFitness: 0.91,
      sourceKeys: ["source:gyrA"],
      assumptionKeys: ["assumption:transfer"],
    });
    expect(detail?.sourceKeys).not.toBe(sourceKeys);
    expect(detail?.assumptionKeys).not.toBe(assumptionKeys);

    sourceKeys[0] = "changed";
    assumptionKeys[0] = "changed";
    expect(detail?.sourceKeys).toEqual(["source:gyrA"]);
    expect(detail?.assumptionKeys).toEqual(["assumption:transfer"]);
  });

  it("fails closed on malformed supplied lineage scientific detail", () => {
    const base = {
      lineageId: "detail",
      parentLineageId: null,
      genotypeId: "WT",
      createdAtHours: 0,
      extinctAtHours: null,
      scientificDetail: {
        genotypeLabel: "Wild type",
        originCellIndex: 0,
        mutationClass: null,
        abundanceModelBiomass: 1,
        relativeFitness: 1,
        sourceKeys: ["source:wt"],
        assumptionKeys: [],
      },
    } as const;

    expect(() =>
      buildLineageTree([{
        ...base,
        scientificDetail: {
          ...base.scientificDetail,
          abundanceModelBiomass: -1,
        },
      }]),
    ).toThrow(/abundanceModelBiomass/);

    expect(() =>
      buildLineageTree([{
        ...base,
        scientificDetail: {
          ...base.scientificDetail,
          originCellIndex: 1.5,
        },
      }]),
    ).toThrow(/originCellIndex/);

    expect(() =>
      buildLineageTree([{
        ...base,
        scientificDetail: {
          ...base.scientificDetail,
          sourceKeys: ["source:wt", "source:wt"],
        },
      }]),
    ).toThrow(/duplicate key/);
  });

});
