import {
  listBundledScenarioDiscovery,
  type ScenarioDiscoveryEntry,
} from "./scenarioDiscovery";
import {
  buildFlagshipComposedRunPlan,
  type FlagshipComposedRunPlan,
} from "../sim/flagshipComposition";
import {
  composedConfigurationFingerprint,
  type ComposedSimulationConfig,
} from "../sim/authoritative";
import type { ComposedParameterSetBinding } from "../sim/parameterSetBinding";
import {
  assertSimulationSeed,
  type RunIdentity,
} from "../sim/protocol";

export const SANDBOX_MODE = "sandbox" as const;
export const SANDBOX_SCENARIO_CATALOG_VERSION = 1 as const;
export const SANDBOX_RUNTIME_REGISTRY_VERSION = 1 as const;
export const FLAGSHIP_SANDBOX_RUNTIME_ID = "flagship-composed-v1" as const;

export interface SandboxFounderInoculum {
  readonly lineageId: string;
  readonly x: number;
  readonly y: number;
  readonly biomass: number;
}

export interface SandboxScenarioEntry {
  readonly catalogVersion: typeof SANDBOX_SCENARIO_CATALOG_VERSION;
  readonly key: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly title: string;
  readonly catalogStatus: string;
  readonly scienceMode: ScenarioDiscoveryEntry["scienceMode"];
  readonly availability: "available";
  readonly runtimeId: string;
}

export interface SandboxScenarioCatalog {
  readonly catalogVersion: typeof SANDBOX_SCENARIO_CATALOG_VERSION;
  readonly scenarios: readonly SandboxScenarioEntry[];
}

export type SandboxSelectionPlan =
  | {
      readonly kind: "fresh-run";
      readonly mode: typeof SANDBOX_MODE;
      readonly runtimeId: string;
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
  readonly inocula: readonly SandboxFounderInoculum[];
}

export interface SandboxComposedRunPlan {
  readonly identity: RunIdentity;
  readonly config: ComposedSimulationConfig;
  readonly parameterSetBinding: ComposedParameterSetBinding;
}

export interface SandboxActiveRunView {
  readonly mode: typeof SANDBOX_MODE;
  readonly runtimeId: string;
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

interface SandboxRuntimeRegistration {
  readonly registryVersion: typeof SANDBOX_RUNTIME_REGISTRY_VERSION;
  readonly runtimeId: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
  readonly buildRun: (
    seed: number,
    initialization: SandboxRunInitialization,
  ) => SandboxComposedRunPlan;
}

const FLAGSHIP_SANDBOX_SCENARIO_ID = "ecoli-ciprofloxacin-spatial";
const FLAGSHIP_SANDBOX_SCENARIO_VERSION = "1.5.0-research";

/**
 * Executable Sandbox runtimes are explicit product authority.
 *
 * A scenario becoming bundled/discoverable does not make it runnable here.
 * The validated two-bacterium authority from #890 intentionally remains
 * unregistered until #907/#879 promotion evidence is accepted.
 */
const SANDBOX_RUNTIME_REGISTRATIONS: readonly SandboxRuntimeRegistration[] =
  Object.freeze([
    Object.freeze({
      registryVersion: SANDBOX_RUNTIME_REGISTRY_VERSION,
      runtimeId: FLAGSHIP_SANDBOX_RUNTIME_ID,
      scenarioId: FLAGSHIP_SANDBOX_SCENARIO_ID,
      scenarioVersion: FLAGSHIP_SANDBOX_SCENARIO_VERSION,
      buildRun(
        seed: number,
        initialization: SandboxRunInitialization,
      ): FlagshipComposedRunPlan {
        return buildFlagshipComposedRunPlan({
          seed,
          initialResourceLevel: initialization.initialResourceLevel,
          inocula: initialization.inocula,
        });
      },
    }),
  ]);

function scenarioKey(id: string, version: string): string {
  return `${id}@${version}`;
}

function runtimeRegistrationKey(registration: SandboxRuntimeRegistration): string {
  return scenarioKey(registration.scenarioId, registration.scenarioVersion);
}

function assertRuntimeRegistry(): void {
  const runtimeIds = new Set<string>();
  const scenarioKeys = new Set<string>();

  for (const registration of SANDBOX_RUNTIME_REGISTRATIONS) {
    canonicalText("Sandbox runtime id", registration.runtimeId);
    canonicalText("Sandbox runtime scenario id", registration.scenarioId);
    canonicalText("Sandbox runtime scenario version", registration.scenarioVersion);
    if (registration.registryVersion !== SANDBOX_RUNTIME_REGISTRY_VERSION) {
      throw new Error("unsupported Sandbox runtime registration version");
    }
    if (runtimeIds.has(registration.runtimeId)) {
      throw new Error(
        `duplicate Sandbox runtime registration: ${registration.runtimeId}`,
      );
    }
    const key = runtimeRegistrationKey(registration);
    if (scenarioKeys.has(key)) {
      throw new Error(`duplicate Sandbox scenario runtime registration: ${key}`);
    }
    runtimeIds.add(registration.runtimeId);
    scenarioKeys.add(key);
  }
}

function findRuntimeRegistration(args: {
  readonly runtimeId: string;
  readonly scenarioId: string;
  readonly scenarioVersion: string;
}): SandboxRuntimeRegistration | undefined {
  return SANDBOX_RUNTIME_REGISTRATIONS.find(
    (registration) =>
      registration.runtimeId === args.runtimeId &&
      registration.scenarioId === args.scenarioId &&
      registration.scenarioVersion === args.scenarioVersion,
  );
}

/**
 * Sandbox deliberately projects executable product registrations onto shared
 * discovery metadata. Bundling a scenario JSON record alone never makes it
 * runnable; registration is an explicit reviewed integration decision.
 */
export function listSandboxScenarios(): SandboxScenarioCatalog {
  assertRuntimeRegistry();
  const discovered = listBundledScenarioDiscovery();
  const discoveryByKey = new Map<string, ScenarioDiscoveryEntry>();

  for (const entry of discovered) {
    const key = scenarioKey(entry.id, entry.version);
    if (discoveryByKey.has(key)) {
      throw new Error(`duplicate bundled Sandbox discovery identity: ${key}`);
    }
    discoveryByKey.set(key, entry);
  }

  const scenarios = SANDBOX_RUNTIME_REGISTRATIONS.map((registration) => {
    const key = runtimeRegistrationKey(registration);
    const discovery = discoveryByKey.get(key);
    if (discovery === undefined) {
      throw new Error(
        `Sandbox runtime ${registration.runtimeId} has no exact bundled discovery entry for ${key}`,
      );
    }

    return Object.freeze({
      catalogVersion: SANDBOX_SCENARIO_CATALOG_VERSION,
      key,
      scenarioId: discovery.id,
      scenarioVersion: discovery.version,
      title: discovery.title,
      catalogStatus: discovery.catalogStatus,
      scienceMode: structuredClone(discovery.scienceMode),
      availability: "available" as const,
      runtimeId: registration.runtimeId,
    });
  });

  return Object.freeze({
    catalogVersion: SANDBOX_SCENARIO_CATALOG_VERSION,
    scenarios: Object.freeze(scenarios),
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

  if (
    scenario === undefined ||
    findRuntimeRegistration({
      runtimeId: scenario.runtimeId,
      scenarioId: scenario.scenarioId,
      scenarioVersion: scenario.scenarioVersion,
    }) === undefined
  ) {
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
 * Execute a reviewed Sandbox selection through its exact registered authority
 * builder. Initial resource and founder state remain explicit user/run inputs;
 * Sandbox owns no hidden demo inoculum or resource defaults.
 */
export function buildSandboxRun(
  selection: Extract<SandboxSelectionPlan, { readonly kind: "fresh-run" }>,
  initialization: SandboxRunInitialization,
): SandboxComposedRunPlan {
  const registration = resolveCurrentSelection(selection);
  const run = registration.buildRun(selection.seed, initialization);
  assertRunMatchesSelection(selection, run);
  return run;
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
  readonly run: SandboxComposedRunPlan;
}): SandboxActiveRunView {
  resolveCurrentSelection(args.selection);
  assertRunMatchesSelection(args.selection, args.run);

  const scenario = currentScenarioForSelection(args.selection);
  const identity = args.run.identity;
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

function resolveCurrentSelection(
  selection: Extract<SandboxSelectionPlan, { readonly kind: "fresh-run" }>,
): SandboxRuntimeRegistration {
  if (selection.kind !== "fresh-run" || selection.mode !== SANDBOX_MODE) {
    throw new Error("unsupported Sandbox fresh-run selection");
  }
  assertSimulationSeed(selection.seed);

  const registration = findRuntimeRegistration({
    runtimeId: selection.runtimeId,
    scenarioId: selection.scenarioId,
    scenarioVersion: selection.scenarioVersion,
  });
  if (
    registration === undefined ||
    selection.scenarioKey !== runtimeRegistrationKey(registration)
  ) {
    throw new Error(
      "Sandbox selection no longer matches a registered runtime identity",
    );
  }

  currentScenarioForSelection(selection);
  return registration;
}

function currentScenarioForSelection(
  selection: Extract<SandboxSelectionPlan, { readonly kind: "fresh-run" }>,
): SandboxScenarioEntry {
  const current = listSandboxScenarios().scenarios.find(
    (scenario) =>
      scenario.runtimeId === selection.runtimeId &&
      scenario.key === selection.scenarioKey &&
      scenario.scenarioId === selection.scenarioId &&
      scenario.scenarioVersion === selection.scenarioVersion,
  );
  if (current === undefined) {
    throw new Error(
      "Sandbox selection no longer matches the registered scenario identity",
    );
  }
  return current;
}

function assertRunMatchesSelection(
  selection: Extract<SandboxSelectionPlan, { readonly kind: "fresh-run" }>,
  run: SandboxComposedRunPlan,
): void {
  const identity = run.identity;
  if (
    identity.scenarioId !== selection.scenarioId ||
    identity.scenarioVersion !== selection.scenarioVersion ||
    identity.seed !== selection.seed
  ) {
    throw new Error(
      "active Sandbox run identity does not match the fresh-run selection",
    );
  }
}

function canonicalText(name: string, value: string): string {
  if (value.length === 0 || value.trim() !== value) {
    throw new Error(`${name} must be a canonical non-empty string`);
  }
  return value;
}
