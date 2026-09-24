import flagshipScenario from '../../data/presets/ecoli_ciprofloxacin_v1.json'
import {
  assertSimulationSeed,
  type RunIdentity,
} from '../sim/protocol'

export const SANDBOX_SCENARIO_REGISTRY_VERSION = 1 as const
export const SANDBOX_MODE = 'sandbox' as const

export type SandboxScenarioStatus =
  | 'science'
  | 'research'
  | 'experimental'
  | 'sandbox'

export interface SandboxScenarioRecord {
  readonly id: string
  readonly version: string
  readonly title: string
  readonly status?: SandboxScenarioStatus
  readonly warning: string
  readonly seedPolicy: 'user' | 'fixed-demo' | 'random-recorded'
  readonly executionProfile?: {
    readonly id: string
    readonly version: string
    readonly classification?: string
  }
  readonly composedParameterSet?: {
    readonly id: string
    readonly version: string
    readonly scenarioId: string
    readonly scenarioVersion: string
    readonly provenance?: {
      readonly classification?: string
    }
  }
  readonly environment?: {
    readonly resourceContext?: {
      readonly version: string
      readonly bindingStatus: string
    }
  }
}

export interface SandboxAuthoritativeBinding {
  readonly runtimeId: string
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly parameterSetId: string
  readonly parameterSetVersion: string
}

export interface SandboxScenarioRegistration {
  readonly scenario: SandboxScenarioRecord
  /**
   * Execution availability is explicit product authority. A data record without
   * a reviewed runtime binding remains visible only as unavailable metadata.
   */
  readonly authoritativeBinding?: SandboxAuthoritativeBinding
}

interface SandboxScenarioBase {
  readonly registryVersion: typeof SANDBOX_SCENARIO_REGISTRY_VERSION
  readonly key: string
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly title: string
  readonly status: SandboxScenarioStatus
  readonly warning: string
  readonly seedPolicy: SandboxScenarioRecord['seedPolicy']
  readonly executionProfileId: string | null
  readonly executionProfileVersion: string | null
  readonly parameterSetId: string | null
  readonly parameterSetVersion: string | null
  readonly parameterEvidenceClass: string | null
  readonly resourceContextVersion: string | null
  readonly resourceBindingStatus: string | null
}

export interface AvailableSandboxScenario extends SandboxScenarioBase {
  readonly availability: 'available'
  readonly runtimeId: string
  readonly parameterSetId: string
  readonly parameterSetVersion: string
}

export interface UnavailableSandboxScenario extends SandboxScenarioBase {
  readonly availability: 'unavailable'
  readonly unavailableReason: string
}

export type SandboxScenario =
  | AvailableSandboxScenario
  | UnavailableSandboxScenario

export interface SandboxScenarioCatalog {
  readonly registryVersion: typeof SANDBOX_SCENARIO_REGISTRY_VERSION
  readonly scenarios: readonly SandboxScenario[]
}

export type SandboxScenarioSelectionPlan =
  | {
      readonly kind: 'fresh-run'
      readonly mode: typeof SANDBOX_MODE
      readonly scenarioKey: string
      readonly scenarioId: string
      readonly scenarioVersion: string
      readonly runtimeId: string
      readonly parameterSetId: string
      readonly parameterSetVersion: string
      readonly seed: number
    }
  | {
      readonly kind: 'refused'
      readonly scenarioKey: string
      readonly reason: string
    }

export interface SandboxActiveRunView {
  readonly mode: typeof SANDBOX_MODE
  readonly scenarioKey: string
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly scenarioTitle: string
  readonly status: SandboxScenarioStatus
  readonly engineVersion: string
  readonly protocolVersion: number
  readonly parameterSetId: string
  readonly parameterSetVersion: string
  readonly configurationFingerprint: string
  readonly seed: number
}

function canonicalText(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be canonical with no surrounding whitespace`)
  }
  return value
}

function scenarioKey(id: string, version: string): string {
  return `${id}@${version}`
}

function scenarioStatus(value: unknown): SandboxScenarioStatus {
  if (
    value === 'science' ||
    value === 'research' ||
    value === 'experimental' ||
    value === 'sandbox'
  ) {
    return value
  }
  throw new Error('sandbox scenario status must be explicit and schema-valid')
}

function projectRegistration(
  registration: SandboxScenarioRegistration,
): SandboxScenario {
  const scenario = registration.scenario
  const scenarioId = canonicalText('sandbox scenario id', scenario.id)
  const scenarioVersion = canonicalText(
    'sandbox scenario version',
    scenario.version,
  )
  const title = canonicalText('sandbox scenario title', scenario.title)
  const warning = canonicalText('sandbox scenario warning', scenario.warning)
  const status = scenarioStatus(scenario.status)

  const parameterSet = scenario.composedParameterSet
  const executionProfile = scenario.executionProfile
  const resourceContext = scenario.environment?.resourceContext
  const base: SandboxScenarioBase = {
    registryVersion: SANDBOX_SCENARIO_REGISTRY_VERSION,
    key: scenarioKey(scenarioId, scenarioVersion),
    scenarioId,
    scenarioVersion,
    title,
    status,
    warning,
    seedPolicy: scenario.seedPolicy,
    executionProfileId:
      executionProfile === undefined
        ? null
        : canonicalText('sandbox execution profile id', executionProfile.id),
    executionProfileVersion:
      executionProfile === undefined
        ? null
        : canonicalText(
            'sandbox execution profile version',
            executionProfile.version,
          ),
    parameterSetId:
      parameterSet === undefined
        ? null
        : canonicalText('sandbox parameter-set id', parameterSet.id),
    parameterSetVersion:
      parameterSet === undefined
        ? null
        : canonicalText(
            'sandbox parameter-set version',
            parameterSet.version,
          ),
    parameterEvidenceClass:
      parameterSet?.provenance?.classification === undefined
        ? null
        : canonicalText(
            'sandbox parameter-set evidence class',
            parameterSet.provenance.classification,
          ),
    resourceContextVersion:
      resourceContext === undefined
        ? null
        : canonicalText(
            'sandbox resource-context version',
            resourceContext.version,
          ),
    resourceBindingStatus:
      resourceContext === undefined
        ? null
        : canonicalText(
            'sandbox resource binding status',
            resourceContext.bindingStatus,
          ),
  }

  const binding = registration.authoritativeBinding
  if (binding === undefined) {
    return Object.freeze({
      ...base,
      availability: 'unavailable',
      unavailableReason:
        'No authoritative runtime binding is registered for this scenario.',
    })
  }

  const runtimeId = canonicalText('sandbox runtime id', binding.runtimeId)
  const bindingScenarioId = canonicalText(
    'sandbox binding scenario id',
    binding.scenarioId,
  )
  const bindingScenarioVersion = canonicalText(
    'sandbox binding scenario version',
    binding.scenarioVersion,
  )
  const bindingParameterSetId = canonicalText(
    'sandbox binding parameter-set id',
    binding.parameterSetId,
  )
  const bindingParameterSetVersion = canonicalText(
    'sandbox binding parameter-set version',
    binding.parameterSetVersion,
  )

  if (
    bindingScenarioId !== scenarioId ||
    bindingScenarioVersion !== scenarioVersion
  ) {
    throw new Error(
      'sandbox authoritative binding must match scenario id/version exactly',
    )
  }
  if (
    parameterSet === undefined ||
    bindingParameterSetId !== parameterSet.id ||
    bindingParameterSetVersion !== parameterSet.version
  ) {
    throw new Error(
      'sandbox authoritative binding must match the scenario parameter set exactly',
    )
  }
  if (
    parameterSet.scenarioId !== scenarioId ||
    parameterSet.scenarioVersion !== scenarioVersion
  ) {
    throw new Error(
      'sandbox scenario parameter set must reference its scenario id/version',
    )
  }

  if (scenario.seedPolicy !== 'user') {
    return Object.freeze({
      ...base,
      availability: 'unavailable',
      unavailableReason:
        'Sandbox does not yet have an authoritative adapter for this scenario seed policy.',
    })
  }

  return Object.freeze({
    ...base,
    availability: 'available',
    runtimeId,
    parameterSetId: bindingParameterSetId,
    parameterSetVersion: bindingParameterSetVersion,
  })
}

export function createSandboxScenarioCatalog(
  registrations: readonly SandboxScenarioRegistration[],
): SandboxScenarioCatalog {
  const scenarios = registrations.map(projectRegistration)
  const keys = new Set<string>()
  for (const scenario of scenarios) {
    if (keys.has(scenario.key)) {
      throw new Error(`duplicate sandbox scenario registration: ${scenario.key}`)
    }
    keys.add(scenario.key)
  }

  return Object.freeze({
    registryVersion: SANDBOX_SCENARIO_REGISTRY_VERSION,
    scenarios: Object.freeze(scenarios),
  })
}

const flagshipBinding: SandboxAuthoritativeBinding = Object.freeze({
  runtimeId: 'flagship-composed-v1',
  scenarioId: flagshipScenario.id,
  scenarioVersion: flagshipScenario.version,
  parameterSetId: flagshipScenario.composedParameterSet.id,
  parameterSetVersion: flagshipScenario.composedParameterSet.version,
})

/**
 * Offline-safe product catalog. Entries come from bundled versioned scenario
 * data and require an explicit reviewed runtime binding before becoming
 * selectable. Adding a JSON preset alone never implies executable biology.
 */
export const BUNDLED_SANDBOX_SCENARIOS = createSandboxScenarioCatalog([
  {
    scenario: flagshipScenario,
    authoritativeBinding: flagshipBinding,
  },
])

export function planSandboxScenarioSelection(args: {
  readonly catalog?: SandboxScenarioCatalog
  readonly scenarioKey: string
  readonly seed: number
}): SandboxScenarioSelectionPlan {
  const catalog = args.catalog ?? BUNDLED_SANDBOX_SCENARIOS
  const requestedKey = canonicalText(
    'requested sandbox scenario key',
    args.scenarioKey,
  )
  const scenario = catalog.scenarios.find((entry) => entry.key === requestedKey)

  if (scenario === undefined) {
    return {
      kind: 'refused',
      scenarioKey: requestedKey,
      reason: 'Unknown sandbox scenario.',
    }
  }
  if (scenario.availability !== 'available') {
    return {
      kind: 'refused',
      scenarioKey: requestedKey,
      reason: scenario.unavailableReason,
    }
  }

  try {
    assertSimulationSeed(args.seed)
  } catch {
    return {
      kind: 'refused',
      scenarioKey: requestedKey,
      reason: 'Seed must be an unsigned 32-bit integer.',
    }
  }

  // This planner deliberately has no "mutate active run" result. Every accepted
  // selection is a request for a fresh runtime whose returned identity must be
  // checked before it can be presented as active Sandbox authority.
  return Object.freeze({
    kind: 'fresh-run',
    mode: SANDBOX_MODE,
    scenarioKey: scenario.key,
    scenarioId: scenario.scenarioId,
    scenarioVersion: scenario.scenarioVersion,
    runtimeId: scenario.runtimeId,
    parameterSetId: scenario.parameterSetId,
    parameterSetVersion: scenario.parameterSetVersion,
    seed: args.seed,
  })
}

export function projectSandboxActiveRun(args: {
  readonly catalog?: SandboxScenarioCatalog
  readonly scenarioKey: string
  readonly identity: RunIdentity
}): SandboxActiveRunView {
  const catalog = args.catalog ?? BUNDLED_SANDBOX_SCENARIOS
  const scenario = catalog.scenarios.find(
    (entry) => entry.key === args.scenarioKey,
  )
  if (scenario === undefined || scenario.availability !== 'available') {
    throw new Error('active Sandbox run must reference an available scenario')
  }

  const identity = args.identity
  if (
    identity.scenarioId !== scenario.scenarioId ||
    identity.scenarioVersion !== scenario.scenarioVersion ||
    identity.parameterSetId !== scenario.parameterSetId ||
    identity.parameterSetVersion !== scenario.parameterSetVersion
  ) {
    throw new Error(
      'active Sandbox run identity does not match the selected scenario binding',
    )
  }

  const binding = identity.parameterSetBinding
  if (binding === undefined || binding.authority !== 'provenance') {
    throw new Error(
      'active Sandbox composed run requires a provenance-owned parameter-set binding',
    )
  }

  return Object.freeze({
    mode: SANDBOX_MODE,
    scenarioKey: scenario.key,
    scenarioId: identity.scenarioId,
    scenarioVersion: identity.scenarioVersion,
    scenarioTitle: scenario.title,
    status: scenario.status,
    engineVersion: identity.engineVersion,
    protocolVersion: identity.protocolVersion,
    parameterSetId: identity.parameterSetId,
    parameterSetVersion: identity.parameterSetVersion,
    configurationFingerprint: binding.configurationFingerprint,
    seed: identity.seed,
  })
}
