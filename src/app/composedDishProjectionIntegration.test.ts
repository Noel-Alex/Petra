import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  fileURLToPath(new URL("./App.tsx", import.meta.url)),
  "utf8",
);

describe("App authoritative dish projection integration", () => {
  it("feeds the current runtime snapshot and branch identity into DishViewport", () => {
    expect(appSource).toContain(
      'import { projectComposedDishSnapshot } from "./composedDishProjection";',
    );
    expect(appSource).toContain(
      "const runtimeSnapshot = experiment.state?.snapshot ?? null;",
    );
    expect(appSource).toContain(
      "const runBranchIdentity = experiment.state?.runBranchIdentity ?? null;",
    );
    expect(appSource).toContain(
      "projectComposedDishSnapshot(runtimeSnapshot, runBranchIdentity)",
    );
    expect(appSource).toContain("snapshot={dishSnapshot}");
  });
});
