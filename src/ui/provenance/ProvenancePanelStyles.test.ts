import { describe, expect, it } from "vitest";

import provenanceCss from "./provenancePanel.css?raw";

function ruleBody(selector: string): string {
  const start = provenanceCss.indexOf(`${selector} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = provenanceCss.indexOf("{", start) + 1;
  const end = provenanceCss.indexOf("}", bodyStart);
  expect(end).toBeGreaterThan(bodyStart);

  return provenanceCss.slice(bodyStart, end);
}

describe("provenance filter touch targets", () => {
  it("keeps native filter controls at Petra's 44px minimum target", () => {
    const controls = ruleBody(
      ".provenance-panel__filters input,\n" +
        ".provenance-panel__filters select,\n" +
        ".provenance-panel__filters button",
    );

    expect(controls).toContain("min-height: 2.75rem");
    expect(controls).not.toMatch(/(?:min-|max-)?width\s*:/);
  });

  it("keeps search and evidence controls native rather than replacing their semantics", () => {
    expect(provenanceCss).not.toContain("appearance: none");
    expect(provenanceCss).not.toContain("pointer-events: none");
  });
});
