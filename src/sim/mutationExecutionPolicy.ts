export const MUTATION_EXECUTION_POLICY_SCHEMA_VERSION = 1 as const

export interface MutationExecutionPolicy {
  readonly schemaVersion: typeof MUTATION_EXECUTION_POLICY_SCHEMA_VERSION
  readonly id: string
  /**
   * Runtime-only ceiling for one biological tick. It does not alter mutation
   * probabilities or accepted child identity; exceeding it refuses the detached
   * transaction before publication.
   */
  readonly maximumMaterializedChildrenPerTick: number
}

/**
 * Conservative interactive default. This is an engineering work budget, not a
 * biological parameter or a measured performance guarantee. Offline callers
 * may supply a separately identified larger policy.
 */
export const DEFAULT_MUTATION_EXECUTION_POLICY: MutationExecutionPolicy =
  Object.freeze({
    schemaVersion: MUTATION_EXECUTION_POLICY_SCHEMA_VERSION,
    id: 'petra-default-bounded-mutation-materialization-v1',
    maximumMaterializedChildrenPerTick: 128,
  })

export function validateMutationExecutionPolicy(
  policy: MutationExecutionPolicy,
): void {
  if (policy.schemaVersion !== MUTATION_EXECUTION_POLICY_SCHEMA_VERSION) {
    throw new Error('unsupported mutation execution policy version')
  }
  if (
    typeof policy.id !== 'string' ||
    policy.id.length === 0 ||
    policy.id !== policy.id.trim()
  ) {
    throw new Error(
      'mutation execution policy id must be a trimmed non-empty string',
    )
  }
  if (
    !Number.isSafeInteger(policy.maximumMaterializedChildrenPerTick) ||
    policy.maximumMaterializedChildrenPerTick < 1
  ) {
    throw new RangeError(
      'maximumMaterializedChildrenPerTick must be a positive safe integer',
    )
  }
}
