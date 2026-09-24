import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ValidationStatusPanel } from "./ValidationStatusPanel";
import {
  buildScenarioValidationPresentation,
  type ScenarioValidationStatus,
} from "./validationStatus";

function status(): ScenarioValidationStatus {
  return {
    schemaVersion: 1,
    scenarioId: "ecoli-ciprofloxacin-spatial",
    scenarioVersion: "1.4.0-research",
    records: [
      {
        id: "numerical-source-suite",
        dimension: "numerical",
        evidenceKind: "source-test",
        status: "passed",
        summary: "Deterministic numerical invariants passed in the recorded source suite.",
        locator: "tests/sim",
      },
      {
        id: "component-science-gap",
        dimension: "component-science",
        evidenceKind: "scientific-comparison",
        status: "partial",
        summary: "Some component comparisons exist; full quantitative validation is incomplete.",
        locator: "research/VALIDATION_PLAN.md",
      },
      {
        id: "browser-evidence",
        dimension: "browser-product",
        evidenceKind: "browser-rehearsal",
        status: "blocked",
        summary: "Expo browser acceptance has not yet been recorded.",
        blocker: "Awaiting registered local browser experiment.",
      },
      {
        id: "demo-run",
        dimension: "demonstration",
        evidenceKind: "demonstration-evidence",
        status: "not-run",
        summary: "Final judge-flow rehearsal has not yet been recorded.",
      },
    ],
  };
}

describe("scenario validation status", () => {
  it("keeps validation layers separate and preserves missing lanes", () => {
    const presentation = buildScenarioValidationPresentation(status());

    expect(presentation.lanes.map((lane) => lane.dimension)).toEqual([
      "numerical",
      "component-science",
      "composed-scenario",
      "browser-product",
      "demonstration",
    ]);
    expect(
      presentation.lanes.find((lane) => lane.dimension === "composed-scenario")
        ?.records,
    ).toEqual([]);
  });

  it("requires evidence locators for passed/partial/failed claims", () => {
    const invalid = status();
    const records = invalid.records.map((record) =>
      record.id === "numerical-source-suite"
        ? { ...record, locator: undefined }
        : record,
    );

    expect(() =>
      buildScenarioValidationPresentation({ ...invalid, records }),
    ).toThrow(/requires an explicit locator/);
  });

  it("requires an explicit blocker for blocked evidence", () => {
    const invalid = status();
    const records = invalid.records.map((record) =>
      record.id === "browser-evidence"
        ? { ...record, blocker: undefined }
        : record,
    );

    expect(() =>
      buildScenarioValidationPresentation({ ...invalid, records }),
    ).toThrow(/requires an explicit blocker/);
  });

  it("rejects duplicate evidence identity instead of last-write-wins", () => {
    const input = status();
    expect(() =>
      buildScenarioValidationPresentation({
        ...input,
        records: [...input.records, input.records[0]!],
      }),
    ).toThrow(/duplicate validation evidence id/);
  });

  it("renders no universal validated verdict and exposes empty/blocked states", () => {
    const html = renderToStaticMarkup(
      <ValidationStatusPanel status={status()} />,
    );

    expect(html).toContain("Evidence by layer");
    expect(html).toContain("does not validate the whole simulator");
    expect(html).toContain("No evidence supplied for this layer.");
    expect(html).toContain("Awaiting registered local browser experiment.");
    expect(html).toContain("tests/sim");
    expect(html).not.toMatch(/>Validated</);
    expect(html).not.toContain("validation-score");
  });
});
