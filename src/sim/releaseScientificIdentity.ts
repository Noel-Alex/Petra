import type { ComposedParameterSetBinding } from './parameterSetBinding'
import { assertComposedParameterSetBinding } from './parameterSetBinding'
import {
  buildFlagshipComposedRunPlan,
  type FlagshipFounderInoculum,
  type FlagshipRunInitialization,
} from './flagshipComposition'
import type { RunIdentity } from './protocol'
import {
  REPLAY_COMPATIBILITY_POLICY,
  REPLAY_COMPATIBILITY_POLICY_VERSION,
  assertReplayArtifactUsesCurrentRuntime,
} from './replayCompatibility'
import { resourceContextIdentity } from './resourceContext'

export const RELEASE_SCIENTIFIC_IDENTITY_SCHEMA_VERSION = 1 as const

export interface FrozenFlagshipRunInitialization {
  readonly seed: number
  readonly initialResourceLevel: number
  readonly inocula: readonly Readonly<FlagshipFounderInoculum>[]
}

export interface FlagshipReleaseScientificIdentity {
  readonly schemaVersion: typeof RELEASE_SCIENTIFIC_IDENTITY_SCHEMA_VERSION
  readonly sourceCommitSha: string
  readonly authority: 'composed'
  readonly runIdentity: Readonly<RunIdentity> & {
    readonly parameterSetBinding: Readonly<ComposedParameterSetBinding>
  }
  readonly runInitialization: FrozenFlagshipRunInitialization
  readonly runInitializationIdentity: string
  readonly configurationFingerprint: string
  readonly executionProfileIdentity: string
  readonly resourceContextIdentity: string
  readonly replayCompatibilityPolicy: {
    readonly schemaVersion: typeof REPLAY_COMPATIBILITY_POLICY_VERSION
    readonly migrationPolicy: 'exact-match-only'
  }
}

const SOURCE_COMMIT_SHA = /^[0-9a-f]{40}$/

function requireSourceCommitSha(value: string): string {
  if (!SOURCE_COMMIT_SHA.test(value)) {
    throw new Error(
      'release sourceCommitSha must be an exact lowercase 40-character Git commit SHA',
    )
  }
  return value
}

function freezeRunInitialization(
  initialization: FlagshipRunInitialization,
): FrozenFlagshipRunInitialization {
  const inocula = initialization.inocula.map((inoculum) =>
    Object.freeze({ ...inoculum }),
  )
  return Object.freeze({
    seed: initialization.seed,
    initialResourceLevel: initialization.initialResourceLevel,
    inocula: Object.freeze(inocula),
  })
}

function runInitializationIdentity(
  initialization: FrozenFlagshipRunInitialization,
): string {
  return JSON.stringify({
    seed: initialization.seed,
    initialResourceLevel: initialization.initialResourceLevel,
    inocula: initialization.inocula.map((inoculum) => ({
      lineageId: inoculum.lineageId,
      x: inoculum.x,
      y: inoculum.y,
      biomass: inoculum.biomass,
    })),
  })
}

/**
 * Build the exact scientific identity record that #561 can snapshot at release.
 *
 * This does not choose a release seed or source revision. Callers must provide
 * both explicitly. Flagship run-state initialization is retained separately
 * from mechanism/configuration identity because resource level and founder
 * placement are intentionally not part of the parameter-set fingerprint.
 */
export function buildFlagshipReleaseScientificIdentity(args: {
  readonly sourceCommitSha: string
  readonly initialization: FlagshipRunInitialization
}): FlagshipReleaseScientificIdentity {
  const sourceCommitSha = requireSourceCommitSha(args.sourceCommitSha)
  const plan = buildFlagshipComposedRunPlan(args.initialization)

  assertReplayArtifactUsesCurrentRuntime(plan.identity)
  assertComposedParameterSetBinding(plan.identity, plan.config)
  if (plan.parameterSetBinding.authority !== 'provenance') {
    throw new Error(
      'release scientific identity requires a provenance-owned parameter-set binding',
    )
  }

  const parameterSetBinding = Object.freeze({
    ...plan.parameterSetBinding,
  })
  const runIdentity = Object.freeze({
    ...plan.identity,
    parameterSetBinding,
  })
  const runInitialization = freezeRunInitialization(args.initialization)

  return Object.freeze({
    schemaVersion: RELEASE_SCIENTIFIC_IDENTITY_SCHEMA_VERSION,
    sourceCommitSha,
    authority: 'composed',
    runIdentity,
    runInitialization,
    runInitializationIdentity: runInitializationIdentity(runInitialization),
    configurationFingerprint:
      plan.parameterSetBinding.configurationFingerprint,
    executionProfileIdentity: plan.executionProfile.profileIdentity,
    resourceContextIdentity: resourceContextIdentity(plan.resourceContext),
    replayCompatibilityPolicy: Object.freeze({
      schemaVersion: REPLAY_COMPATIBILITY_POLICY.schemaVersion,
      migrationPolicy: REPLAY_COMPATIBILITY_POLICY.migrationPolicy,
    }),
  })
}
