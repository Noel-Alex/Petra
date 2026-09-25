import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const provenanceCss = readFileSync(
  fileURLToPath(new URL("./provenancePanel.css", import.meta.url)),
  "utf8",
);

function ruleBody(selector: string, last = false): string {
  const normalizedSelector = selector.trim().replace(/\s+/g, " ");
  const normalizedCss = provenanceCss.replace(/\s+/g, " ");
  const start = last
    ? normalizedCss.lastIndexOf(`${normalizedSelector} {`)
    : normalizedCss.indexOf(`${normalizedSelector} {`);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = normalizedCss.indexOf("{", start) + 1;
  const end = normalizedCss.indexOf("}", bodyStart);
  expect(end).toBeGreaterThan(bodyStart);

  return normalizedCss.slice(bodyStart, end);
}

describe("provenance filter touch targets", () => {
  it("keeps native filter controls at Petra's 44px minimum target", () => {
    const controls = ruleBody(
      ".provenance-panel__filters input,\n" +
        ".provenance-panel__filters select,\n" +
        ".provenance-panel__filters button",
    );

    expect(controls).toContain("min-height: 2.75rem");
    expect(controls).toContain("min-width: 0;");
    expect(controls).toContain("box-sizing: border-box;");
    expect(controls).not.toMatch(/(?:^|\n)\s*width\s*:/);
  });

  it("keeps search and evidence controls native rather than replacing their semantics", () => {
    expect(provenanceCss).not.toContain("appearance: none");
    expect(provenanceCss).not.toContain("pointer-events: none");
  });

  it("keeps the search, evidence select, and Clear action in separate fluid tracks", () => {
    const filters = ruleBody(".provenance-panel__filters");
    const clear = ruleBody(".provenance-panel__filters button", true);

    expect(filters).toContain("min-width: 0;");
    expect(filters).toContain(
      "grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) max-content;",
    );
    expect(clear).toContain("justify-self: stretch;");
    expect(clear).toContain("white-space: nowrap;");
  });

  it("uses readable Petra dark colors in the native evidence menu", () => {
    const select = ruleBody(".provenance-panel__filters select");
    const option = ruleBody(".provenance-panel__filters select option");

    expect(select).toContain("color-scheme: dark;");
    expect(option).toContain("background: var(--petra-color-ink-soft);");
    expect(option).toContain("color: var(--petra-color-cream);");
  });
});
