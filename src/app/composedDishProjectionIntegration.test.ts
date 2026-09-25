import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(
  fileURLToPath(new URL("./App.tsx", import.meta.url)),
  "utf8",
);
const runtimeBindingSource = readFileSync(
  fileURLToPath(new URL("./useExperimentRuntime.ts", import.meta.url)),
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
      "const ecologyObservation = experiment.state?.ecologyObservation ?? null;",
    );
    expect(appSource).toContain("measureDishProjectionPublication(");
    expect(appSource).toContain(
      "projectComposedDishSnapshot(\n                runtimeSnapshot,\n                runBranchIdentity,\n                ecologyObservation,",
    );
    expect(appSource).toContain("observeDishReactCommit(");
    expect(appSource).toContain("snapshot={dishSnapshot}");
  });

  it("observes each newly accepted runtime snapshot once before React publication", () => {
    expect(runtimeBindingSource).toContain(
      'import { observeRuntimeSnapshotPublication } from "./renderPublicationPerformance";',
    );
    expect(runtimeBindingSource).toContain(
      'nextState.snapshot !== lastObservedSnapshot',
    );
    expect(runtimeBindingSource).toContain(
      'observeRuntimeSnapshotPublication(\n            nextState.snapshot,\n            nextState.runBranchIdentity,',
    );
    expect(runtimeBindingSource).toContain(
      "lastObservedSnapshot = nextState.snapshot;",
    );
  });
});
