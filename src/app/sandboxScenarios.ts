import {
  listBundledScenarioDiscovery,
  type ScenarioDiscoveryEntry,
} from "./scenarioDiscovery";
import {
  buildFlagshipComposedRunPlan,
  type FlagshipComposedRunPlan,
  type FlagshipFounderInoculum,
} from "../sim/flagshipComposition";
import { composedConfigurationFingerprint } from "../sim/authoritative";
import { assertSimulationSeed } from "../sim/protocol";

export const SANDBOX_MODE = "sandbox" as const;
export const SANDBOX_SCENARIO_CATALOG_VERSION = 1 as const;
export const FLAGSHIP_SANDBOX_RUNTIME_ID = "flagship-composed-v1" as const;

export interface SandboxScenarioEntry {
  readonly catalogVersion: typeof SANDBOX_SCENARIO_CATALOG_VERSION;
  readonly key: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly title: string;
  readonly catalogStatus: string;
  readonly scienceMode: ScenarioDiscoveryEntry["scienceMode"];
  readonly availability: "available";
  readonly runtimeId: typeof FLAGSHIP_SANDBOX_RUNTIME_ID;
}

export interface SandboxScenarioCatalog {
  readonly catalogVersion: typeof SANDBOX_SCENARIO_CATALOG_VERSION;
  readonly scenarios: readonly SandboxScenarioEntry[];
}

export type SandboxSelectionPlan =
  | {
      readonly kind: "fresh-run";
      readonly mode: typeof SANDBOX_MODE;
      readonly runtimeId: typeof FLAGSHIP_SANDBOX_RUNTIME_ID;
      readonly scenarioKey: string;
      readonly scenarioId: string;
      readonly scenarioVersion: string;
      readonly seed: number;
    }
  | {
      readonly kind: "refused";
      readonly scenarioKey: string;
      readonly reason: string;
    };

export interface SandboxRunInitialization {
  readonly initialResourceLevel: number;
  readonly inocula: readonly FlagshipFounderInoculum[];
}

export interface SandboxActiveRunView {
  readonly mode: typeof SANDBOX_MODE;
  readonly runtimeId: typeof FLAGSHIP_SANDBOX_RUNTIME_ID;
  readonly scenarioKey: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly scenarioTitle: string;
  readonly scienceModeMaturity: ScenarioDiscoveryEntry["scienceMode"]["maturity"];
  readonly scienceModeAdmitted: boolean;
  readonly engineVersion: string;
  readonly protocolVersion: number;
  readonly parameterSetId: string;
  readonly parameterSetVersion: string;
  readonly configurationFingerprint: string;
  readonly seed: number;
}

function scenarioKey(id: string, version: string): string {
  return `${id}@${version}`;
}

/**
 * Sandbox deliberately projects product discovery rather than reparsing scenario
 * evidence. The bundled flagship is the only currently registered executable
 * Sandbox runtime; adding a JSON/content record alone never makes it runnable.
 */
export function listSandboxScenarios(): SandboxScenarioCatalog {
  const discovered = listBundledScenarioDiscovery();
  if (discovered.length !== 1) {
    throw new Error(
      "Sandbox flagship runtime registration expects exactly one bundled scenario",
    );
  }

  const flagship = discovered[0]!;
  const entry: SandboxScenarioEntry = Object.freeze({
    catalogVersion: SANDBOX_SCENARIO_CATALOG_VERSION,
    key: scenarioKey(flagship.id, flagship.version),
    scenarioId: flagship.id,
    scenarioVersion: flagship.version,
    title: flagship.title,
    catalogStatus: flagship.catalogStatus,
    scienceMode: structuredClone(flagship.scienceMode),
    availability: "available",
    runtimeId: FLAGSHIP_SANDBOX_RUNTIME_ID,
  });

  return Object.freeze({
    catalogVersion: SANDBOX_SCENARIO_CATALOG_VERSION,
    scenarios: Object.freeze([entry]),
  });
}

/**
 * Selection never mutates an existing run. The only successful result is a
 * request to create fresh authority with an explicit canonical seed.
 */
export function planSandboxSelection(args: {
  readonly scenarioKey: string;
  readonly seed: number;
  readonly catalog?: SandboxScenarioCatalog;
}): SandboxSelectionPlan {
  const catalog = args.catalog ?? listSandboxScenarios();
  const requestedKey = canonicalText("sandbox scenario key", args.scenarioKey);
  const scenario = catalog.scenarios.find((item) => item.key === requestedKey);

  if (scenario === undefined) {
    return Object.freeze({
      kind: "refused",
      scenarioKey: requestedKey,
      reason: "Unknown or unavailable Sandbox scenario.",
    });
  }

  try {
    assertSimulationSeed(args.seed);
  } catch {
    return Object.freeze({
      kind: "refused",
      scenarioKey: requestedKey,
      reason: "Seed must be an unsigned 32-bit integer.",
    });
  }

  return Object.freeze({
    kind: "fresh-run",
    mode: SANDBOX_MODE,
    runtimeId: scenario.runtimeId,
    scenarioKey: scenario.key,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.scenarioVersion,
    seed: args.seed,
  });
}

/**
 * Execute a reviewed Sandbox selection through the same flagship composition
 * boundary used by authoritative product/runtime code. Initial resource and
 * founder state remain explicit user/run inputs; Sandbox owns no hidden demo
 * inoculum or resource defaults.
 */
export function buildSandboxRun(
  selection: Extract<SandboxSelectionPlan, { readonly kind: "fresh-run" }>,
  initialization: SandboxRunInitialization,
): FlagshipComposedRunPlan {
  assertCurrentSelection(selection);
  return buildFlagshipComposedRunPlan({
    seed: selection.seed,
    initialResourceLevel: initialization.initialResourceLevel,
    inocula: initialization.inocula,
  });
}

/**
 * Post-start product identity projection. Display identity is accepted only
 * after the actual composed run returns a provenance-bound matching identity.
 */
export function projectSandboxActiveRun(args: {
  readonly selection: Extract<
    SandboxSelectionPlan,
    { readonly kind: "fresh-run" }
  >;
  readonly run: FlagshipComposedRunPlan;
}): SandboxActiveRunView {
  assertCurrentSelection(args.selection);
  const catalog = listSandboxScenarios();
  const scenario = catalog.scenarios[0]!;
  const identity = args.run.identity;

  if (
    identity.scenarioId !== args.selection.scenarioId ||
    identity.scenarioVersion !== args.selection.scenarioVersion ||
    identity.seed !== args.selection.seed
  ) {
    throw new Error(
      "active Sandbox run identity does not match the fresh-run selection",
    );
  }

  const binding = identity.parameterSetBinding;
  if (binding === undefined || binding.authority !== "provenance") {
    throw new Error(
      "active Sandbox run requires a provenance-owned parameter-set binding",
    );
  }
  if (
    binding.parameterSetId !== identity.parameterSetId ||
    binding.parameterSetVersion !== identity.parameterSetVersion
  ) {
    throw new Error(
      "active Sandbox parameter-set binding does not match run identity",
    );
  }

  const fingerprint = composedConfigurationFingerprint(args.run.config);
  if (
    binding.configurationFingerprint !== fingerprint ||
    args.run.parameterSetBinding.configurationFingerprint !== fingerprint
  ) {
    throw new Error(
      "active Sandbox configuration does not match its parameter-set binding",
    );
  }

  return Object.freeze({
    mode: SANDBOX_MODE,
    runtimeId: args.selection.runtimeId,
    scenarioKey: scenario.key,
    scenarioId: identity.scenarioId,
    scenarioVersion: identity.scenarioVersion,
    scenarioTitle: scenario.title,
    scienceModeMaturity: scenario.scienceMode.maturity,
    scienceModeAdmitted: scenario.scienceMode.admitted,
    engineVersion: identity.engineVersion,
    protocolVersion: identity.protocolVersion,
    parameterSetId: identity.parameterSetId,
    parameterSetVersion: identity.parameterSetVersion,
    configurationFingerprint: fingerprint,
    seed: identity.seed,
  });
}

function assertCurrentSelection(
  selection: Extract<SandboxSelectionPlan, { readonly kind: "fresh-run" }>,
): void {
  if (
    selection.kind !== "fresh-run" ||
    selection.mode !== SANDBOX_MODE ||
    selection.runtimeId !== FLAGSHIP_SANDBOX_RUNTIME_ID
  ) {
    throw new Error("unsupported Sandbox fresh-run selection");
  }
  assertSimulationSeed(selection.seed);

  const current = listSandboxScenarios().scenarios[0]!;
  if (
    selection.scenarioKey !== current.key ||
    selection.scenarioId !== current.scenarioId ||
    selection.scenarioVersion !== current.scenarioVersion
  ) {
    throw new Error(
      "Sandbox selection no longer matches the registered scenario identity",
    );
  }
}

function canonicalText(name: string, value: string): string {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${name} must be a canonical non-empty string`);
  }
  return value;
}
