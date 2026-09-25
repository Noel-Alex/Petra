import { describe, expect, it } from "vitest";

import source from "./App.tsx?raw";

describe("App authoritative region inspector shell", () => {
  it("mounts the real inspector panel instead of placeholder scientific values", () => {
    expect(source).toContain("projectRegionInspector(");
    expect(source).toContain("<RegionInspectorPanel");
    expect(source).toContain("onRegionPointActivate=");
    expect(source).toContain('title="Colony Details"');
    expect(source).toContain("emptyStateAdornment=");
    expect(source).not.toContain("<dd>—</dd>");
    expect(source).not.toContain("<dt>Drug</dt>");
  });

  it("keeps the live inspector, activity, and analysis inside the right-side shell", () => {
    const shellStart = source.indexOf(
      'className="inspector-shell petra-panel--inspector"',
    );
    const analysisStart = source.indexOf("<AnalysisSurface", shellStart);
    const shellEnd = source.indexOf("</div>", analysisStart);

    expect(shellStart).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('className="inspector-activity"', shellStart)).toBeGreaterThan(shellStart);
    expect(analysisStart).toBeGreaterThan(shellStart);
    expect(shellEnd).toBeGreaterThan(analysisStart);
  });

  it("gives intervention placement first ownership of dish activation", () => {
    expect(source).toMatch(
      /regionInspectionAvailable\s*&&\s*interventionPlacement\.phase !== "placing"/,
    );
  });

  it("does not fabricate a renderer snapshot just to enable inspection", () => {
    expect(source).toContain("experiment.state?.snapshot ?? null");
    expect(source).not.toContain("createRendererDemoSnapshot");
  });
});
