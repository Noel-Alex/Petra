import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REGION_INSPECTOR_CSS = readFileSync(
  new URL("./regionInspectorPanel.css", import.meta.url),
  "utf8",
);

describe("Region Inspector visual-theme contract", () => {
  it("consumes Petra shared visual variables instead of owning a numeric palette", () => {
    expect(REGION_INSPECTOR_CSS).toContain("--petra-color-cream");
    expect(REGION_INSPECTOR_CSS).toContain("--petra-color-cream-muted");
    expect(REGION_INSPECTOR_CSS).toContain("--petra-color-teal");
    expect(REGION_INSPECTOR_CSS).toContain("--petra-color-mint");
    expect(REGION_INSPECTOR_CSS).toContain("--petra-color-amber");
    expect(REGION_INSPECTOR_CSS).toContain("--petra-color-coral");

    expect(REGION_INSPECTOR_CSS).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(REGION_INSPECTOR_CSS).not.toMatch(/rgba?\(\s*[0-9.]+\s*[, ]/i);
  });

  it("keeps status presentation mapped to shared semantic reinforcement tokens", () => {
    expect(REGION_INSPECTOR_CSS).toMatch(
      /data-status="ready"[\s\S]*?--petra-(?:rgb|color)-mint/,
    );
    expect(REGION_INSPECTOR_CSS).toMatch(
      /data-status="pending"[\s\S]*?--petra-(?:rgb|color)-amber/,
    );
    expect(REGION_INSPECTOR_CSS).toMatch(
      /data-status="error"[\s\S]*?--petra-(?:rgb|color)-coral/,
    );
    expect(REGION_INSPECTOR_CSS).toContain('data-readout-stale="true"');
    expect(REGION_INSPECTOR_CSS).toContain("border-style: dashed");
  });
});
