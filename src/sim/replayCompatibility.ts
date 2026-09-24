import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type RunIdentity,
} from './protocol'

export const REPLAY_COMPATIBILITY_POLICY_VERSION = 1 as const

export const REPLAY_COMPATIBILITY_POLICY = Object.freeze({
  schemaVersion: REPLAY_COMPATIBILITY_POLICY_VERSION,
  migrationPolicy: 'exact-match-only',
} as const)

export type ReplayAuthority = 'synthetic' | 'composed'

export type ReplayCompatibilityReason =
  | 'malformed-identity'
  | 'unsupported-engine-version'
  | 'unsupported-protocol-version'
  | 'authority-mismatch'
  | 'scenario-id-mismatch'
  | 'scenario-version-mismatch'
  | 'parameter-set-id-mismatch'
  | 'parameter-set-version-mismatch'
  | 'parameter-set-binding-mismatch'
  | 'seed-mismatch'

export type ReplayCompatibilityDecision =
  | {
      readonly compatible: true
      readonly mode: 'exact'
      readonly policyVersion: typeof REPLAY_COMPATIBILITY_POLICY_VERSION
    }
  | {
      readonly compatible: false
      readonly reason: ReplayCompatibilityReason
      readonly message: string
      readonly policyVersion: typeof REPLAY_COMPATIBILITY_POLICY_VERSION
    }

interface SerializedRunIdentity {
  readonly engineVersion: string
  readonly protocolVersion: number
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly parameterSetId: string
  readonly parameterSetVersion: string
  readonly parameterSetBinding?: unknown
  readonly seed: number
}

export class ReplayCompatibilityError extends Error {
  readonly reason: ReplayCompatibilityReason

  constructor(decision: Extract<ReplayCompatibilityDecision, { compatible: false }>) {
    super(decision.message)
    this.name = 'ReplayCompatibilityError'
    this.reason = decision.reason
  }
}

/**
 * Release compatibility gate for checkpoint/replay authority.
 *
 * Petra currently registers no semantic migrations. Saved scientific state is
 * accepted only when it targets the current engine/protocol and exactly matches
 * the active run identity and authority kind.
 */
export function assessReplayCompatibility(args: {
  readonly artifactIdentity: unknown
  readonly targetIdentity: RunIdentity
  readonly artifactAuthority: ReplayAuthority
  readonly targetAuthority: ReplayAuthority
}): ReplayCompatibilityDecision {
  const artifact = parseSerializedRunIdentity(args.artifactIdentity)
  if (artifact === null) {
    return incompatible(
      'malformed-identity',
      'Replay artifact is incompatible: its run identity is malformed. No migration is registered.',
    )
  }

  const runtime = assessReplayArtifactRuntime(artifact)
  if (!runtime.compatible) return runtime

  if (args.artifactAuthority !== args.targetAuthority) {
    return incompatible(
      'authority-mismatch',
      `Replay artifact is incompatible with the active run: authority ${args.artifactAuthority} cannot restore into ${args.targetAuthority} authority. No migration is registered.`,
    )
  }

  const target = parseSerializedRunIdentity(args.targetIdentity)
  if (target === null) {
    return incompatible(
      'malformed-identity',
      'Replay target is incompatible: the active run identity is malformed.',
    )
  }
  if (target.engineVersion !== ENGINE_VERSION) {
    return incompatible(
      'unsupported-engine-version',
      `Replay target is incompatible with this Petra build: active engine identity ${target.engineVersion} is unsupported; expected ${ENGINE_VERSION}.`,
    )
  }
  if (target.protocolVersion !== PROTOCOL_VERSION) {
    return incompatible(
      'unsupported-protocol-version',
      `Replay target is incompatible with this Petra build: active protocol identity ${target.protocolVersion} is unsupported; expected ${PROTOCOL_VERSION}.`,
    )
  }

  const comparisons: readonly [
    keyof Pick<
      SerializedRunIdentity,
      | 'scenarioId'
      | 'scenarioVersion'
      | 'parameterSetId'
      | 'parameterSetVersion'
      | 'seed'
    >,
    ReplayCompatibilityReason,
    string,
  ][] = [
    ['scenarioId', 'scenario-id-mismatch', 'scenario id'],
    ['scenarioVersion', 'scenario-version-mismatch', 'scenario version'],
    ['parameterSetId', 'parameter-set-id-mismatch', 'parameter-set id'],
    [
      'parameterSetVersion',
      'parameter-set-version-mismatch',
      'parameter-set version',
    ],
    ['seed', 'seed-mismatch', 'seed'],
  ]

  for (const [field, reason, label] of comparisons) {
    if (artifact[field] !== target[field]) {
      return incompatible(
        reason,
        `Replay artifact is incompatible with the active run: different run identity (${label} mismatch). No migration is registered.`,
      )
    }
  }

  if (
    stableStringify(artifact.parameterSetBinding ?? null) !==
    stableStringify(target.parameterSetBinding ?? null)
  ) {
    return incompatible(
      'parameter-set-binding-mismatch',
      'Replay artifact is incompatible with the active run: different run identity (parameter-set binding mismatch). No migration is registered.',
    )
  }

  return {
    compatible: true,
    mode: 'exact',
    policyVersion: REPLAY_COMPATIBILITY_POLICY_VERSION,
  }
}

/**
 * Gate self-contained replay artifacts (for example a counterfactual bundle)
 * before they are allowed to instantiate an engine from their own saved
 * identity. This prevents an old artifact from validating against itself.
 */
export function assessReplayArtifactRuntime(
  artifactIdentity: unknown,
): ReplayCompatibilityDecision {
  const artifact = parseSerializedRunIdentity(artifactIdentity)
  if (artifact === null) {
    return incompatible(
      'malformed-identity',
      'Replay artifact is incompatible: its run identity is malformed. No migration is registered.',
    )
  }

  if (artifact.engineVersion !== ENGINE_VERSION) {
    return incompatible(
      'unsupported-engine-version',
      `Replay artifact is incompatible with this Petra build: engine version ${artifact.engineVersion} is unsupported; expected ${ENGINE_VERSION}. No migration is registered.`,
    )
  }

  if (artifact.protocolVersion !== PROTOCOL_VERSION) {
    return incompatible(
      'unsupported-protocol-version',
      `Replay artifact is incompatible with this Petra build: protocol version ${artifact.protocolVersion} is unsupported; expected ${PROTOCOL_VERSION}. No migration is registered.`,
    )
  }

  return {
    compatible: true,
    mode: 'exact',
    policyVersion: REPLAY_COMPATIBILITY_POLICY_VERSION,
  }
}

export function assertReplayCompatibility(args: {
  readonly artifactIdentity: unknown
  readonly targetIdentity: RunIdentity
  readonly artifactAuthority: ReplayAuthority
  readonly targetAuthority: ReplayAuthority
}): void {
  const decision = assessReplayCompatibility(args)
  if (!decision.compatible) throw new ReplayCompatibilityError(decision)
}

export function assertReplayArtifactUsesCurrentRuntime(
  artifactIdentity: unknown,
): void {
  const decision = assessReplayArtifactRuntime(artifactIdentity)
  if (!decision.compatible) throw new ReplayCompatibilityError(decision)
}

function incompatible(
  reason: ReplayCompatibilityReason,
  message: string,
): ReplayCompatibilityDecision {
  return {
    compatible: false,
    reason,
    message,
    policyVersion: REPLAY_COMPATIBILITY_POLICY_VERSION,
  }
}

function parseSerializedRunIdentity(value: unknown): SerializedRunIdentity | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const identity = value as Record<string, unknown>
  if (
    typeof identity.engineVersion !== 'string' ||
    !Number.isSafeInteger(identity.protocolVersion) ||
    typeof identity.scenarioId !== 'string' ||
    typeof identity.scenarioVersion !== 'string' ||
    typeof identity.parameterSetId !== 'string' ||
    typeof identity.parameterSetVersion !== 'string' ||
    !Number.isSafeInteger(identity.seed)
  ) {
    return null
  }

  return {
    engineVersion: identity.engineVersion,
    protocolVersion: identity.protocolVersion as number,
    scenarioId: identity.scenarioId,
    scenarioVersion: identity.scenarioVersion,
    parameterSetId: identity.parameterSetId,
    parameterSetVersion: identity.parameterSetVersion,
    ...(identity.parameterSetBinding === undefined
      ? {}
      : { parameterSetBinding: identity.parameterSetBinding }),
    seed: identity.seed as number,
  }
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined'
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`
  }
  const object = value as Record<string, unknown>
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(object[key])}`)
    .join(',')}}`
}
