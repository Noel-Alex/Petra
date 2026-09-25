import { describe, expect, it } from "vitest";

import { buildDefaultFlagshipRun } from "./flagshipRunPreset";
import {
  FLAGSHIP_CIPROFLOXACIN_TOOL_BINDING,
  resolveCiprofloxacinToolAuthorityForRun,
} from "./ciprofloxacinToolBinding";

describe("flagship ciprofloxacin tool binding", () => {
  it("admits scenario-owned tool authority only for the exact bundled run identity", () => {
    const run = buildDefaultFlagshipRun();

    expect(resolveCiprofloxacinToolAuthorityForRun(run.plan.identity)).toEqual(
      run.ciprofloxacinToolAuthority,
    );
    expect(FLAGSHIP_CIPROFLOXACIN_TOOL_BINDING.authority).toEqual(
      run.ciprofloxacinToolAuthority,
    );
  });

  it("fails closed for stale or foreign scenario and parameter-set identity", () => {
    const run = buildDefaultFlagshipRun();

    expect(
      resolveCiprofloxacinToolAuthorityForRun({
        ...run.plan.identity,
        scenarioVersion: "foreign-scenario-version",
      }),
    ).toBeNull();
    expect(
      resolveCiprofloxacinToolAuthorityForRun({
        ...run.plan.identity,
        parameterSetVersion: "foreign-parameter-set-version",
      }),
    ).toBeNull();
    expect(resolveCiprofloxacinToolAuthorityForRun(null)).toBeNull();
  });
});
