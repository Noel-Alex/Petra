import { describe, expect, it } from "vitest";

import source from "./App.tsx?raw";

describe("App authoritative region inspector shell", () => {
  it("mounts the real inspector panel instead of placeholder scientific values", () => {
    expect(source).toContain("projectRegionInspector(");
    expect(source).toContain("<RegionInspectorPanel");
    expect(source).toContain("onRegionPointActivate=");
    expect(source).not.toContain("<dd>—</dd>");
    expect(source).not.toContain("<dt>Drug</dt>");
  });

  it("disables region activation while intervention placement owns dish input", () => {
    expect(source).toContain(
      'regionInspectionAvailable &&\n              interventionPlacement.phase !== "placing"',
    );
  });
});
