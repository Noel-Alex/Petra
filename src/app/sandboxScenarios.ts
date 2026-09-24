import flagshipScenario from '../../data/presets/ecoli_ciprofloxacin_v1.json'
import { assertSimulationSeed, type RunIdentity } from '../sim/protocol'

export const SANDBOX_MODE = 'sandbox' as const

export type SandboxScenarioStatus =
  | 'science'
  | 'research'
  | 'experimental'
  | 'sandbox'

interface SandboxScenarioIdentity {
  readonly key: string
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly title: string
  readonly status: SandboxScenarioStatus
  readonly warning: string
  readonly seedPolicy: 'user' | 'fixed-demo' | 'random-recorded'
  readonly executionProfileId: string | null
  readonly executionProfileVersion: string | null
  readonly parameterSetId: string | null
  readonly parameterSetVersion: string | null
  readonly parameterEvidenceClass: string | null
  readonly resourceContextVersion: string | null
  readonly resourceBindingStatus: string | null
}

export interface AvailableSandboxScenario extends SandboxScenarioIdentity {
  readonly availability: 'available'
  readonly runtimeId: string
  readonly parameterSetId: string
  readonly parameterSetVersion: string
}

export interface UnavailableSandboxScenario extends SandboxScenarioIdentity {
  readonly availability: 'unavailable'
  readonly unavailableReason: string
}

export type SandboxScenario =
  | AvailableSandboxScenario
  | UnavailableSandboxScenario

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

function scenarioStatus(value: unknown): SandboxScenarioStatus {
  if (
    value === 'science' ||
    value === 'research' ||
    value === 'experimental' ||
    value === 'sandbox'
  ) {
    return value
  }
  throw new Error('bundled Sandbox scenario has unsupported status')
}

function seedPolicy(
  value: unknown,
): SandboxScenarioIdentity['seedPolicy'] {
  if (
    value === 'user' ||
    value === 'fixed-demo' ||
    value === 'random-recorded'
  ) {
    return value
  }
  throw new Error('bundled Sandbox scenario has unsupported seed policy')
}

const flagshipScenarioId = canonicalText('flagship scenario id', flagshipScenario.id)
const flagshipScenarioVersion = canonicalText(
  'flagship scenario version',
  flagshipScenario.version,
)
const flagshipParameterSetId = canonicalText(
  'flagship parameter-set id',
  flagshipScenario.composedParameterSet.id,
)
const flagshipParameterSetVersion = canonicalText(
  'flagship parameter-set version',
  flagshipScenario.composedParameterSet.version,
)

if (
  flagshipScenario.composedParameterSet.scenarioId !== flagshipScenarioId ||
  flagshipScenario.composedParameterSet.scenarioVersion !==
    flagshipScenarioVersion
) {
  throw new Error(
    'bundled Sandbox parameter set must reference the flagship scenario exactly',
  )
}

/**
 * Offline-safe product registry for scenarios with reviewed executable bindings.
 *
 * Display/science identity is projected from the versioned scenario preset.
 * The only app-owned value is the runtime adapter ID that tells later shell
 * wiring which reviewed composition path may construct a fresh runtime.
 */
export const BUNDLED_SANDBOX_SCENARIOS: readonly SandboxScenario[] =
  Object.freeze([
    Object.freeze({
      key: `${flagshipScenarioId}@${flagshipScenarioVersion}`,
      scenarioId: flagshipScenarioId,
      scenarioVersion: flagshipScenarioVersion,
      title: canonicalText('flagship scenario title', flagshipScenario.title),
      status: scenarioStatus(flagshipScenario.status),
      warning: canonicalText(
        'flagship scenario warning',
        flagshipScenario.warning,
      ),
      seedPolicy: seedPolicy(flagshipScenario.seedPolicy),
      executionProfileId: canonicalText(
        'flagship execution-profile id',
        flagshipScenario.executionProfile.id,
      ),
      executionProfileVersion: canonicalText(
        'flagship execution-profile version',
        flagshipScenario.executionProfile.version,
      ),
      parameterSetId: flagshipParameterSetId,
      parameterSetVersion: flagshipParameterSetVersion,
      parameterEvidenceClass: canonicalText(
        'flagship parameter-set evidence class',
        flagshipScenario.composedParameterSet.provenance.classification,
      ),
      resourceContextVersion: canonicalText(
        'flagship resource-context version',
        flagshipScenario.environment.resourceContext.version,
      ),
      resourceBindingStatus: canonicalText(
        'flagship resource binding status',
        flagshipScenario.environment.resourceContext.bindingStatus,
      ),
      availability: 'available',
      runtimeId: 'flagship-composed-v1',
    }),
  ])

function findScenario(
  scenarios: readonly SandboxScenario[],
  key: string,
): SandboxScenario | undefined {
  return scenarios.find((scenario) => scenario.key === key)
}

/**
 * Accepted selection never means "edit the current simulation".
 * It is an instruction to construct a fresh runtime through the registered
 * adapter, after which projectSandboxActiveRun verifies the returned identity.
 */
export function planSandboxScenarioSelection(args: {
  readonly scenarioKey: string
  readonly seed: number
  readonly scenarios?: readonly SandboxScenario[]
}): SandboxScenarioSelectionPlan {
  const scenarios = args.scenarios ?? BUNDLED_SANDBOX_SCENARIOS
  const requestedKey = canonicalText(
    'requested Sandbox scenario key',
    args.scenarioKey,
  )
  const scenario = findScenario(scenarios, requestedKey)

  if (scenario === undefined) {
    return {
      kind: 'refused',
      scenarioKey: requestedKey,
      reason: 'Unknown Sandbox scenario.',
    }
  }
  if (scenario.availability === 'unavailable') {
    return {
      kind: 'refused',
      scenarioKey: requestedKey,
      reason: scenario.unavailableReason,
    }
  }
  if (scenario.seedPolicy !== 'user') {
    return {
      kind: 'refused',
      scenarioKey: requestedKey,
      reason:
        'This scenario seed policy has no reviewed Sandbox runtime adapter yet.',
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

/**
 * Exact identity shown for an active Sandbox run. Card metadata alone is never
 * allowed to claim that a runtime is active; the returned worker RunIdentity is
 * the source for engine/config/seed display.
 */
export function projectSandboxActiveRun(args: {
  readonly scenarioKey: string
  readonly identity: RunIdentity
  readonly scenarios?: readonly SandboxScenario[]
}): SandboxActiveRunView {
  const scenarios = args.scenarios ?? BUNDLED_SANDBOX_SCENARIOS
  const scenario = findScenario(scenarios, args.scenarioKey)
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
      'active Sandbox run requires a provenance-owned parameter-set binding',
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
