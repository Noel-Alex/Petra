export const ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION = 1 as const

export interface AdvanceExecutionPolicy {
  readonly schemaVersion: typeof ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION
  readonly id: string
  /**
   * Maximum ticks one synchronous advance command may execute.
   * This is runtime work policy, not biological time or a scientific parameter.
   */
  readonly maximumTicksPerAdvance: number
}

export type AdvanceExecutionPolicyRefusalReason =
  | 'advance-tick-budget-exceeded'

export interface AdvanceExecutionPolicyRefusalDiagnostics {
  readonly reason: AdvanceExecutionPolicyRefusalReason
  readonly policyIdentity: string
  readonly requestedTicks: number
  readonly maximumTicksPerAdvance: number
}

export class AdvanceExecutionPolicyRefusalError extends Error {
  readonly code = 'advance-execution-policy-refusal' as const
  readonly diagnostics: AdvanceExecutionPolicyRefusalDiagnostics

  constructor(
    message: string,
    diagnostics: AdvanceExecutionPolicyRefusalDiagnostics,
  ) {
    super(message)
    this.name = 'AdvanceExecutionPolicyRefusalError'
    this.diagnostics = diagnostics
  }
}

/**
 * Conservative repository default for interactive/direct engine entrypoints.
 *
 * This ceiling bounds pathological synchronous work; it is not a measured
 * responsiveness claim. Explicit offline callers may supply a separately
 * identified policy with a larger finite cap when their workload requires it.
 */
export const DEFAULT_ADVANCE_EXECUTION_POLICY: AdvanceExecutionPolicy =
  Object.freeze({
    schemaVersion: ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION,
    id: 'petra-default-bounded-advance-v1',
    maximumTicksPerAdvance: 4_096,
  })

export function validateAdvanceExecutionPolicy(
  policy: AdvanceExecutionPolicy,
): void {
  if (policy.schemaVersion !== ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION) {
    throw new Error('unsupported advance execution policy version')
  }
  if (
    typeof policy.id !== 'string' ||
    policy.id.length === 0 ||
    policy.id !== policy.id.trim()
  ) {
    throw new Error(
      'advance execution policy id must be a trimmed non-empty string',
    )
  }
  if (
    !Number.isSafeInteger(policy.maximumTicksPerAdvance) ||
    policy.maximumTicksPerAdvance < 1
  ) {
    throw new RangeError(
      'maximumTicksPerAdvance must be a positive safe integer',
    )
  }
}

export function advanceExecutionPolicyIdentity(
  policy: AdvanceExecutionPolicy,
): string {
  validateAdvanceExecutionPolicy(policy)
  return JSON.stringify({
    schemaVersion: policy.schemaVersion,
    id: policy.id,
    maximumTicksPerAdvance: policy.maximumTicksPerAdvance,
  })
}

/**
 * Refuses oversized synchronous work before an engine consumes RNG, mutates
 * biological state, advances counters, or appends events.
 */
export function enforceAdvanceExecutionPolicy(
  requestedTicks: number,
  policy: AdvanceExecutionPolicy,
): void {
  if (!Number.isSafeInteger(requestedTicks) || requestedTicks < 0) {
    throw new RangeError(
      'advance ticks must be a non-negative safe integer',
    )
  }
  validateAdvanceExecutionPolicy(policy)

  if (requestedTicks <= policy.maximumTicksPerAdvance) return

  const policyIdentity = advanceExecutionPolicyIdentity(policy)
  throw new AdvanceExecutionPolicyRefusalError(
    `advance request for ${requestedTicks} ticks exceeds execution policy cap ${policy.maximumTicksPerAdvance}`,
    {
      reason: 'advance-tick-budget-exceeded',
      policyIdentity,
      requestedTicks,
      maximumTicksPerAdvance: policy.maximumTicksPerAdvance,
    },
  )
}
