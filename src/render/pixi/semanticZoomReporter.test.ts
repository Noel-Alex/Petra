import { describe, expect, it } from "vitest";
import { createSemanticZoomReporter } from "./semanticZoomReporter";

describe("semantic zoom reporter", () => {
  it("reports the initial named level once", () => {
    const levels: string[] = [];
    const reporter = createSemanticZoomReporter(1, (level) => levels.push(level));

    expect(reporter.currentLevel()).toBe("dish");
    expect(levels).toEqual(["dish"]);
  });

  it("does not notify React while zoom moves within one semantic level", () => {
    const levels: string[] = [];
    const reporter = createSemanticZoomReporter(1, (level) => levels.push(level));

    reporter.reportZoom(1.2);
    reporter.reportZoom(1.8);
    reporter.reportZoom(2.24);

    expect(levels).toEqual(["dish"]);
    expect(reporter.currentLevel()).toBe("dish");
  });

  it("notifies exactly once for each named threshold crossing", () => {
    const levels: string[] = [];
    const reporter = createSemanticZoomReporter(1, (level) => levels.push(level));

    reporter.reportZoom(2.25);
    reporter.reportZoom(3);
    reporter.reportZoom(6.99);
    reporter.reportZoom(7);
    reporter.reportZoom(9);

    expect(levels).toEqual(["dish", "colony", "representative-cell"]);
  });

  it("reports reset and zoom-out crossings back to overview", () => {
    const levels: string[] = [];
    const reporter = createSemanticZoomReporter(8, (level) => levels.push(level));

    reporter.reportZoom(4);
    reporter.reportZoom(2);
    reporter.reportZoom(1);

    expect(levels).toEqual([
      "representative-cell",
      "colony",
      "dish",
    ]);
    expect(reporter.currentLevel()).toBe("dish");
  });

  it("respects an injected presentation threshold policy", () => {
    const levels: string[] = [];
    const reporter = createSemanticZoomReporter(
      1,
      (level) => levels.push(level),
      { colonyAt: 1.5, representativeCellAt: 2.5 },
    );

    reporter.reportZoom(1.49);
    reporter.reportZoom(1.5);
    reporter.reportZoom(2.5);

    expect(levels).toEqual(["dish", "colony", "representative-cell"]);
  });
});
