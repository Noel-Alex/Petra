import { describe, expect, it } from "vitest";

import {
  FLAGSHIP_SANDBOX_RUNTIME_ID,
  buildSandboxRun,
  listSandboxScenarios,
  planSandboxSelection,
  projectSandboxActiveRun,
} from "../../src/app/sandboxScenarios";
import { composedConfigurationFingerprint } from "../../src/sim/authoritative";

describe("Sandbox authoritative scenario selection", () => {
  it("lists only the real bundled flagship and preserves shared Science Mode maturity", () => {
    const catalog = listSandboxScenarios();

    expect(catalog.catalogVersion).toBe(1);
    expect(catalog.scenarios).toHaveLength(1);
    expect(catalog.scenarios[0]).toMatchObject({
      scenarioId: "ecoli-ciprofloxacin-spatial",
      scenarioVersion: "1.5.0-research",
      availability: "available",
      runtimeId: FLAGSHIP_SANDBOX_RUNTIME_ID,
      catalogStatus: "research",
      scienceMode: {
        admitted: false,
        maturity: "experimental",
      },
    });
  });

  it("plans selection only as a fresh run with an explicit canonical seed", () => {
    const scenario = listSandboxScenarios().scenarios[0]!;
    const accepted = planSandboxSelection({
      scenarioKey: scenario.key,
      seed: 17,
    });

    expect(accepted).toEqual({
      kind: "fresh-run",
      mode: "sandbox",
      runtimeId: FLAGSHIP_SANDBOX_RUNTIME_ID,
      scenarioKey: scenario.key,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.scenarioVersion,
      seed: 17,
    });

    expect(
      planSandboxSelection({ scenarioKey: scenario.key, seed: -1 }),
    ).toMatchObject({
      kind: "refused",
      reason: expect.stringMatching(/unsigned 32-bit integer/),
    });
    expect(
      planSandboxSelection({ scenarioKey: "missing@1", seed: 17 }),
    ).toEqual({
      kind: "refused",
      scenarioKey: "missing@1",
      reason: "Unknown or unavailable Sandbox scenario.",
    });
  });

  it("starts through the authoritative flagship composition with no hidden initialization defaults", () => {
    const scenario = listSandboxScenarios().scenarios[0]!;
    const selection = planSandboxSelection({
      scenarioKey: scenario.key,
      seed: 0x5eed1234,
    });
    if (selection.kind !== "fresh-run") {
      throw new Error("expected fresh Sandbox run");
    }

    const run = buildSandboxRun(selection, {
      initialResourceLevel: 8,
      inocula: [
        {
          lineageId: "founder-wt",
          x: 80,
          y: 80,
          biomass: 1,
        },
      ],
    });

    expect(run.identity).toMatchObject({
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.scenarioVersion,
      seed: 0x5eed1234,
    });
    expect(run.config.initialResource[80 * run.config.width + 80]).toBe(8);
    expect(
      run.config.initialLineageBiomass[0]![80 * run.config.width + 80],
    ).toBe(1);
    expect(run.parameterSetBinding.authority).toBe("provenance");
  });

  it("projects exact active identity only after the returned run matches the selection", () => {
    const scenario = listSandboxScenarios().scenarios[0]!;
    const selection = planSandboxSelection({
      scenarioKey: scenario.key,
      seed: 7,
    });
    if (selection.kind !== "fresh-run") {
      throw new Error("expected fresh Sandbox run");
    }

    const run = buildSandboxRun(selection, {
      initialResourceLevel: 4,
      inocula: [
        {
          lineageId: "founder-wt",
          x: 80,
          y: 80,
          biomass: 1,
        },
      ],
    });
    const active = projectSandboxActiveRun({ selection, run });

    expect(active).toMatchObject({
      mode: "sandbox",
      runtimeId: FLAGSHIP_SANDBOX_RUNTIME_ID,
      scenarioKey: scenario.key,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.scenarioVersion,
      scenarioTitle: scenario.title,
      scienceModeMaturity: "experimental",
      scienceModeAdmitted: false,
      parameterSetId: run.identity.parameterSetId,
      parameterSetVersion: run.identity.parameterSetVersion,
      seed: 7,
    });
    expect(active.configurationFingerprint).toBe(
      composedConfigurationFingerprint(run.config),
    );
  });

  it("fails closed if a selection is stale or a returned run identity is foreign", () => {
    const scenario = listSandboxScenarios().scenarios[0]!;
    const selection = planSandboxSelection({
      scenarioKey: scenario.key,
      seed: 7,
    });
    if (selection.kind !== "fresh-run") {
      throw new Error("expected fresh Sandbox run");
    }

    expect(() =>
      buildSandboxRun(
        {
          ...selection,
          scenarioVersion: "stale-version",
        },
        {
          initialResourceLevel: 4,
          inocula: [
            {
              lineageId: "founder-wt",
              x: 80,
              y: 80,
              biomass: 1,
            },
          ],
        },
      ),
    ).toThrow(/no longer matches/);

    const run = buildSandboxRun(selection, {
      initialResourceLevel: 4,
      inocula: [
        {
          lineageId: "founder-wt",
          x: 80,
          y: 80,
          biomass: 1,
        },
      ],
    });
    const foreign = structuredClone(run);
    (foreign.identity as { seed: number }).seed = 8;

    expect(() =>
      projectSandboxActiveRun({ selection, run: foreign }),
    ).toThrow(/does not match the fresh-run selection/);
  });
});
