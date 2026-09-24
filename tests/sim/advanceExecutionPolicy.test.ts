import { describe, expect, it } from 'vitest'

import {
  ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION,
  DEFAULT_ADVANCE_EXECUTION_POLICY,
  AdvanceExecutionPolicyRefusalError,
  advanceExecutionPolicyIdentity,
  enforceAdvanceExecutionPolicy,
  validateAdvanceExecutionPolicy,
  type AdvanceExecutionPolicy,
} from '../../src/sim/advanceExecutionPolicy'

function policy(maximumTicksPerAdvance: number): AdvanceExecutionPolicy {
  return Object.freeze({
    schemaVersion: ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION,
    id: 'test-bounded-advance-v1',
    maximumTicksPerAdvance,
  })
}

describe('advance execution policy', () => {
  it('has a stable versioned identity and a finite repository default', () => {
    validateAdvanceExecutionPolicy(DEFAULT_ADVANCE_EXECUTION_POLICY)
    expect(DEFAULT_ADVANCE_EXECUTION_POLICY.maximumTicksPerAdvance).toBe(4_096)
    expect(
      advanceExecutionPolicyIdentity(DEFAULT_ADVANCE_EXECUTION_POLICY),
    ).toBe(
      JSON.stringify({
        schemaVersion: ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION,
        id: 'petra-default-bounded-advance-v1',
        maximumTicksPerAdvance: 4_096,
      }),
    )
  })

  it('accepts zero, budget-1, and budget exactly', () => {
    const bounded = policy(3)

    expect(() => enforceAdvanceExecutionPolicy(0, bounded)).not.toThrow()
    expect(() => enforceAdvanceExecutionPolicy(2, bounded)).not.toThrow()
    expect(() => enforceAdvanceExecutionPolicy(3, bounded)).not.toThrow()
  })

  it('refuses budget+1 and huge safe-integer work with typed diagnostics', () => {
    const bounded = policy(3)

    for (const requestedTicks of [4, Number.MAX_SAFE_INTEGER]) {
      let refusal: unknown
      try {
        enforceAdvanceExecutionPolicy(requestedTicks, bounded)
      } catch (error) {
        refusal = error
      }

      expect(refusal).toBeInstanceOf(AdvanceExecutionPolicyRefusalError)
      if (!(refusal instanceof AdvanceExecutionPolicyRefusalError)) {
        throw new Error('expected typed advance execution-policy refusal')
      }
      expect(refusal.code).toBe('advance-execution-policy-refusal')
      expect(refusal.diagnostics).toMatchObject({
        reason: 'advance-tick-budget-exceeded',
        requestedTicks,
        maximumTicksPerAdvance: 3,
      })
      expect(refusal.diagnostics.policyIdentity).toBe(
        advanceExecutionPolicyIdentity(bounded),
      )
    }
  })

  it('rejects malformed caller-owned policies instead of coercing them', () => {
    expect(() =>
      validateAdvanceExecutionPolicy({
        schemaVersion: ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION,
        id: 'bad-zero-budget',
        maximumTicksPerAdvance: 0,
      }),
    ).toThrow(/positive safe integer/)

    expect(() =>
      validateAdvanceExecutionPolicy({
        schemaVersion: ADVANCE_EXECUTION_POLICY_SCHEMA_VERSION,
        id: ' padded ',
        maximumTicksPerAdvance: 1,
      }),
    ).toThrow(/trimmed non-empty string/)
  })
})
