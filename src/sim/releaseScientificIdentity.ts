import type {
  ComposedParameterSetBinding,
} from './parameterSetBinding'
import { assertComposedParameterSetBinding } from './parameterSetBinding'
import {
  buildFlagshipComposedRunPlan,
  type FlagshipComposedRunPlan,
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
  /**
   * Canonical accepted flagship run-state initialization reconstructed from the
   * authoritative config after Float32 storage/accumulation semantics.
   */
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

/**
 * Reconstruct the compact flagship initialization from the values that actually
 * entered authoritative state. Raw caller literals are deliberately not used:
 * resource/biomass inputs are stored as Float32, and duplicate inocula may
 * accumulate into one lineage/cell cohort.
 */
function canonicalAcceptedRunInitialization(
  plan: FlagshipComposedRunPlan,
): FrozenFlagshipRunInitialization {
  const { config } = plan
  const cellCount = config.width * config.height
  if (
    config.mask.length !== cellCount ||
    config.initialResource.length !== cellCount
  ) {
    throw new Error('release flagship initial resource shape is inconsistent')
  }
  if (config.initialLineageBiomass.length !== config.lineages.length) {
    throw new Error('release flagship lineage-channel shape is inconsistent')
  }

  let initialResourceLevel: number | undefined
  for (let cell = 0; cell < cellCount; cell += 1) {
    const value = config.initialResource[cell]
    if (value === undefined || !Number.isFinite(value) || value < 0) {
      throw new Error('release flagship initial resource must be finite and non-negative')
    }
    if (config.mask[cell] === 1) {
      if (initialResourceLevel === undefined) {
        initialResourceLevel = value === 0 ? 0 : value
      } else if (value !== initialResourceLevel) {
        throw new Error(
          'release flagship initialization requires one uniform accepted resource level',
        )
      }
    } else if (value !== 0) {
      throw new Error('release flagship initial resource must be zero off-mask')
    }
  }
  if (initialResourceLevel === undefined) {
    throw new Error('release flagship dish must contain an authoritative cell')
  }

  const inocula: Readonly<FlagshipFounderInoculum>[] = []
  for (
    let lineageIndex = 0;
    lineageIndex < config.lineages.length;
    lineageIndex += 1
  ) {
    const lineage = config.lineages[lineageIndex]
    const channel = config.initialLineageBiomass[lineageIndex]
    if (lineage === undefined || channel === undefined) {
      throw new Error('release flagship lineage channel is missing')
    }
    if (channel.length !== cellCount) {
      throw new Error('release flagship lineage channel length is inconsistent')
    }

    for (let cell = 0; cell < cellCount; cell += 1) {
      const biomass = channel[cell]
      if (biomass === undefined || !Number.isFinite(biomass) || biomass < 0) {
        throw new Error(
          'release flagship initial lineage biomass must be finite and non-negative',
        )
      }
      if (config.mask[cell] !== 1) {
        if (biomass !== 0) {
          throw new Error(
            'release flagship initial lineage biomass must be zero off-mask',
          )
        }
        continue
      }
      if (biomass === 0) continue

      inocula.push(
        Object.freeze({
          lineageId: lineage.id,
          x: cell % config.width,
          y: Math.floor(cell / config.width),
          biomass,
        }),
      )
    }
  }

  return Object.freeze({
    seed: plan.identity.seed,
    initialResourceLevel,
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
 * both explicitly. Run-state identity is reconstructed from the accepted
 * authoritative flagship configuration so raw Float32/input-order aliases
 * cannot create distinct release identities for the same scientific state.
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
  const runInitialization = canonicalAcceptedRunInitialization(plan)

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
