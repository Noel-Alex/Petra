import { describe, expect, it } from "vitest";

import { createRunIdentity } from "../sim/protocol";
import { runIdentityKey } from "./runIdentityKey";

describe("runIdentityKey", () => {
  it("changes when any mutable run-identity dimension changes", () => {
    const base = createRunIdentity({
      scenarioId: "scenario",
      scenarioVersion: "1",
      parameterSetId: "params",
      parameterSetVersion: "1",
      seed: 7,
    });
    const key = runIdentityKey(base);

    expect(runIdentityKey({ ...base, scenarioId: "other" })).not.toBe(key);
    expect(runIdentityKey({ ...base, scenarioVersion: "2" })).not.toBe(key);
    expect(runIdentityKey({ ...base, parameterSetId: "other" })).not.toBe(key);
    expect(runIdentityKey({ ...base, parameterSetVersion: "2" })).not.toBe(key);
    expect(runIdentityKey({ ...base, seed: 8 })).not.toBe(key);
  });
});
