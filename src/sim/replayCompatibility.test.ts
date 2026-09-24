import { describe, expect, it } from 'vitest'
import {
  REPLAY_COMPATIBILITY_POLICY,
  assessReplayArtifactRuntime,
  assessReplayCompatibility,
  assertReplayCompatibility,
} from './replayCompatibility'
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  createRunIdentity,
} from './protocol'

const identity = createRunIdentity({
  scenarioId: 'compat-fixture',
  scenarioVersion: '1',
  parameterSetId: 'fixture:none',
  parameterSetVersion: '1',
  parameterSetBinding: {
    schemaVersion: 1,
    authority: 'fixture',
    parameterSetId: 'fixture:none',
    parameterSetVersion: '1',
    configurationFingerprint: 'fixture:fingerprint',
  },
  seed: 7,
})

describe('replay compatibility policy', () => {
  it('declares exact-match-only migration behavior', () => {
    expect(REPLAY_COMPATIBILITY_POLICY).toEqual({
      schemaVersion: 1,
      migrationPolicy: 'exact-match-only',
    })
  })

  it('accepts only exact current runtime and run identity', () => {
    expect(
      assessReplayCompatibility({
        artifactIdentity: structuredClone(identity),
        targetIdentity: identity,
        artifactAuthority: 'composed',
        targetAuthority: 'composed',
      }),
    ).toEqual({
      compatible: true,
      mode: 'exact',
      policyVersion: 1,
    })
  })

  it('refuses old engine and protocol identities even when an artifact would otherwise self-match', () => {
    const oldEngine = { ...identity, engineVersion: 'petra-ts-core/0.0.9' }
    const oldProtocol = { ...identity, protocolVersion: PROTOCOL_VERSION - 1 }

    expect(assessReplayArtifactRuntime(oldEngine)).toMatchObject({
      compatible: false,
      reason: 'unsupported-engine-version',
    })
    expect(assessReplayArtifactRuntime(oldProtocol)).toMatchObject({
      compatible: false,
      reason: 'unsupported-protocol-version',
    })
    expect(assessReplayArtifactRuntime(identity)).toMatchObject({
      compatible: true,
      mode: 'exact',
    })
    expect(identity.engineVersion).toBe(ENGINE_VERSION)
  })

  it('refuses authority and every replay-critical run-identity mismatch', () => {
    const cases = [
      [{ ...identity, scenarioId: 'other' }, 'scenario-id-mismatch'],
      [{ ...identity, scenarioVersion: '2' }, 'scenario-version-mismatch'],
      [{ ...identity, parameterSetId: 'fixture:other' }, 'parameter-set-id-mismatch'],
      [{ ...identity, parameterSetVersion: '2' }, 'parameter-set-version-mismatch'],
      [{ ...identity, seed: 8 }, 'seed-mismatch'],
      [
        {
          ...identity,
          parameterSetBinding: {
            ...identity.parameterSetBinding!,
            configurationFingerprint: 'fixture:other',
          },
        },
        'parameter-set-binding-mismatch',
      ],
    ] as const

    for (const [artifactIdentity, reason] of cases) {
      expect(
        assessReplayCompatibility({
          artifactIdentity,
          targetIdentity: identity,
          artifactAuthority: 'composed',
          targetAuthority: 'composed',
        }),
      ).toMatchObject({ compatible: false, reason })
    }

    expect(
      assessReplayCompatibility({
        artifactIdentity: identity,
        targetIdentity: identity,
        artifactAuthority: 'synthetic',
        targetAuthority: 'composed',
      }),
    ).toMatchObject({
      compatible: false,
      reason: 'authority-mismatch',
    })
  })

  it('compares structured parameter bindings canonically rather than by object insertion order', () => {
    const binding = identity.parameterSetBinding!
    const reordered = {
      configurationFingerprint: binding.configurationFingerprint,
      parameterSetVersion: binding.parameterSetVersion,
      parameterSetId: binding.parameterSetId,
      authority: binding.authority,
      schemaVersion: binding.schemaVersion,
    }

    expect(
      assessReplayCompatibility({
        artifactIdentity: { ...identity, parameterSetBinding: reordered },
        targetIdentity: identity,
        artifactAuthority: 'composed',
        targetAuthority: 'composed',
      }),
    ).toMatchObject({ compatible: true, mode: 'exact' })
  })

  it('fails closed with human-readable refusal instead of migrating versions', () => {
    expect(() =>
      assertReplayCompatibility({
        artifactIdentity: { ...identity, scenarioVersion: '0' },
        targetIdentity: identity,
        artifactAuthority: 'composed',
        targetAuthority: 'composed',
      }),
    ).toThrow(/different run identity .*scenario version mismatch.*No migration is registered/i)

    expect(
      assessReplayCompatibility({
        artifactIdentity: null,
        targetIdentity: identity,
        artifactAuthority: 'composed',
        targetAuthority: 'composed',
      }),
    ).toMatchObject({
      compatible: false,
      reason: 'malformed-identity',
    })
  })
})
