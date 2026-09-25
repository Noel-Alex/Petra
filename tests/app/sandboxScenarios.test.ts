import { describe, expect, it } from "vitest";

import {
  FLAGSHIP_SANDBOX_RUNTIME_ID,
  SANDBOX_RUNTIME_REGISTRY_VERSION,
  TWO_BACTERIUM_SANDBOX_RUNTIME_ID,
  buildSandboxRun,
  listSandboxRuntimeReadiness,
  listSandboxScenarios,
  planSandboxSelection,
  projectSandboxActiveRun,
} from "../../src/app/sandboxScenarios";
import { composedConfigurationFingerprint } from "../../src/sim/authoritative";

describe("Sandbox authoritative scenario selection", () => {
  it("lists only the real bundled flagship and preserves shared Science Mode maturity", () => {
    const catalog = listSandboxScenarios();

    expect(SANDBOX_RUNTIME_REGISTRY_VERSION).toBe(1);
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

  it("prebinds the exact two-bacterium runtime behind the local evidence gate without making it selectable", () => {
    const readiness = listSandboxRuntimeReadiness();

    expect(readiness).toHaveLength(2);
    expect(readiness[0]).toMatchObject({
      runtimeId: FLAGSHIP_SANDBOX_RUNTIME_ID,
      scenarioId: "ecoli-ciprofloxacin-spatial",
      scenarioVersion: "1.5.0-research",
      availability: "available",
      evidenceGate: null,
    });

    const candidate = readiness.find(
      (entry) => entry.runtimeId === TWO_BACTERIUM_SANDBOX_RUNTIME_ID,
    );
    expect(candidate).toMatchObject({
      runtimeId: TWO_BACTERIUM_SANDBOX_RUNTIME_ID,
      scenarioId: "ecoli-bsubtilis-shared-resource",
      scenarioVersion: "1.0.0-experimental",
      availability: "blocked-local-evidence",
      evidenceGate: {
        experimentId: "two-bacterium-shared-resource-validation",
        issueIds: [907],
      },
    });
    expect(Object.isFrozen(readiness)).toBe(true);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate?.evidenceGate?.issueIds)).toBe(true);

    const executable = listSandboxScenarios();
    expect(
      executable.scenarios.some(
        (entry) => entry.runtimeId === TWO_BACTERIUM_SANDBOX_RUNTIME_ID,
      ),
    ).toBe(false);

    expect(
      planSandboxSelection({
        scenarioKey: "ecoli-bsubtilis-shared-resource@1.0.0-experimental",
        seed: 17,
      }),
    ).toEqual({
      kind: "refused",
      scenarioKey: "ecoli-bsubtilis-shared-resource@1.0.0-experimental",
      reason: "Unknown or unavailable Sandbox scenario.",
    });

    const flagship = executable.scenarios[0]!;
    const forgedCatalog = {
      catalogVersion: 1 as const,
      scenarios: [
        {
          ...flagship,
          key: "ecoli-bsubtilis-shared-resource@1.0.0-experimental",
          scenarioId: "ecoli-bsubtilis-shared-resource",
          scenarioVersion: "1.0.0-experimental",
          runtimeId: TWO_BACTERIUM_SANDBOX_RUNTIME_ID,
        },
      ],
    };
    expect(
      planSandboxSelection({
        scenarioKey: "ecoli-bsubtilis-shared-resource@1.0.0-experimental",
        seed: 17,
        catalog: forgedCatalog,
      }),
    ).toEqual({
      kind: "refused",
      scenarioKey: "ecoli-bsubtilis-shared-resource@1.0.0-experimental",
      reason: "Unknown or unavailable Sandbox scenario.",
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

  it("refuses a catalog entry that is not backed by an exact executable runtime registration", () => {
    const scenario = listSandboxScenarios().scenarios[0]!;
    const catalog = {
      catalogVersion: 1 as const,
      scenarios: [
        {
          ...scenario,
          runtimeId: "unregistered-runtime-v1",
        },
      ],
    };

    expect(
      planSandboxSelection({
        scenarioKey: scenario.key,
        seed: 17,
        catalog,
      }),
    ).toEqual({
      kind: "refused",
      scenarioKey: scenario.key,
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

  it("fails closed if a selection is stale, unregistered, or a returned run identity is foreign", () => {
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

    expect(() =>
      buildSandboxRun(
        {
          ...selection,
          runtimeId: "unregistered-runtime-v1",
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
    ).toThrow(/registered runtime identity/);

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
