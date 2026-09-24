import { describe, expect, it } from 'vitest'

import {
  buildFlagshipReleaseScientificIdentity,
  RELEASE_SCIENTIFIC_IDENTITY_SCHEMA_VERSION,
} from '../../src/sim/releaseScientificIdentity'
import {
  buildFlagshipComposedRunPlan,
  type FlagshipRunInitialization,
} from '../../src/sim/flagshipComposition'
import { REPLAY_COMPATIBILITY_POLICY } from '../../src/sim/replayCompatibility'
import { resourceContextIdentity } from '../../src/sim/resourceContext'

const SOURCE_COMMIT_SHA = '0123456789abcdef0123456789abcdef01234567'

const baseline: FlagshipRunInitialization = {
  seed: 0x5eed1234,
  initialResourceLevel: 8,
  inocula: [
    {
      lineageId: 'founder-wt',
      x: 80,
      y: 80,
      biomass: 1,
    },
  ],
}

describe('flagship release scientific identity', () => {
  it('derives one inspectable release record from current flagship authority', () => {
    const plan = buildFlagshipComposedRunPlan(baseline)
    const identity = buildFlagshipReleaseScientificIdentity({
      sourceCommitSha: SOURCE_COMMIT_SHA,
      initialization: baseline,
    })

    expect(identity).toMatchObject({
      schemaVersion: RELEASE_SCIENTIFIC_IDENTITY_SCHEMA_VERSION,
      sourceCommitSha: SOURCE_COMMIT_SHA,
      authority: 'composed',
      runIdentity: plan.identity,
      configurationFingerprint:
        plan.parameterSetBinding.configurationFingerprint,
      executionProfileIdentity: plan.executionProfile.profileIdentity,
      resourceContextIdentity: resourceContextIdentity(plan.resourceContext),
      replayCompatibilityPolicy: REPLAY_COMPATIBILITY_POLICY,
    })
    expect(identity.runIdentity.parameterSetBinding).toEqual(
      plan.parameterSetBinding,
    )
    expect(identity.runIdentity.parameterSetBinding.authority).toBe(
      'provenance',
    )
    expect(identity.runInitialization).toEqual(baseline)
    expect(JSON.parse(identity.runInitializationIdentity)).toEqual(baseline)
  })

  it('keeps exact run-state initialization distinct from mechanism identity', () => {
    const first = buildFlagshipReleaseScientificIdentity({
      sourceCommitSha: SOURCE_COMMIT_SHA,
      initialization: baseline,
    })
    const second = buildFlagshipReleaseScientificIdentity({
      sourceCommitSha: SOURCE_COMMIT_SHA,
      initialization: {
        ...baseline,
        initialResourceLevel: 4,
        inocula: [
          {
            lineageId: 'founder-wt',
            x: 81,
            y: 80,
            biomass: 0.5,
          },
        ],
      },
    })

    expect(second.runIdentity).toEqual(first.runIdentity)
    expect(second.configurationFingerprint).toBe(
      first.configurationFingerprint,
    )
    expect(second.runInitializationIdentity).not.toBe(
      first.runInitializationIdentity,
    )
  })

  it('requires an exact canonical release source commit', () => {
    expect(() =>
      buildFlagshipReleaseScientificIdentity({
        sourceCommitSha: 'main',
        initialization: baseline,
      }),
    ).toThrow(/sourceCommitSha/)

    expect(() =>
      buildFlagshipReleaseScientificIdentity({
        sourceCommitSha: SOURCE_COMMIT_SHA.toUpperCase(),
        initialization: baseline,
      }),
    ).toThrow(/sourceCommitSha/)
  })

  it('returns detached immutable release metadata', () => {
    const identity = buildFlagshipReleaseScientificIdentity({
      sourceCommitSha: SOURCE_COMMIT_SHA,
      initialization: baseline,
    })

    expect(Object.isFrozen(identity)).toBe(true)
    expect(Object.isFrozen(identity.runIdentity)).toBe(true)
    expect(Object.isFrozen(identity.runIdentity.parameterSetBinding)).toBe(
      true,
    )
    expect(Object.isFrozen(identity.runInitialization)).toBe(true)
    expect(Object.isFrozen(identity.runInitialization.inocula)).toBe(true)
    expect(Object.isFrozen(identity.runInitialization.inocula[0])).toBe(true)
    expect(Object.isFrozen(identity.replayCompatibilityPolicy)).toBe(true)
  })
})
