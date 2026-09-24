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
});
