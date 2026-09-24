import { sameComposedParameterSetBinding } from '../sim/parameterSetBinding'
import type {
  ComposedSimulationSnapshot,
  RunIdentity,
} from '../sim/protocol'

export const AUTHORITATIVE_HISTORY_SCHEMA_VERSION = 1 as const

export interface AuthoritativeHistoryKeyframe {
  readonly schemaVersion: typeof AUTHORITATIVE_HISTORY_SCHEMA_VERSION
  readonly runBranchIdentity: string
  readonly snapshot: ComposedSimulationSnapshot
}

export type HistoricalStateResolution =
  | {
      readonly kind: 'authoritative'
      readonly requestedCommandPosition: number
      readonly keyframe: AuthoritativeHistoryKeyframe
    }
  | {
      readonly kind: 'between-authority'
      readonly requestedCommandPosition: number
      readonly runBranchIdentity: string
      readonly lower: AuthoritativeHistoryKeyframe
      readonly upper: AuthoritativeHistoryKeyframe
      readonly progress: number
      readonly stateAuthority: 'presentation-only'
    }

export interface AuthoritativeHistoryIndex {
  readonly runBranchIdentity: string
  readonly identity: RunIdentity
  readonly firstCommandCount: number
  readonly lastCommandCount: number
  readonly keyframeCount: number
  resolve(requestedCommandPosition: number): HistoricalStateResolution
}

function canonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be a canonical non-empty string`)
  }
}

function sameRunIdentity(left: RunIdentity, right: RunIdentity): boolean {
  return (
    left.engineVersion === right.engineVersion &&
    left.protocolVersion === right.protocolVersion &&
    left.scenarioId === right.scenarioId &&
    left.scenarioVersion === right.scenarioVersion &&
    left.parameterSetId === right.parameterSetId &&
    left.parameterSetVersion === right.parameterSetVersion &&
    sameComposedParameterSetBinding(
      left.parameterSetBinding,
      right.parameterSetBinding,
    ) &&
    left.seed === right.seed
  )
}

function cloneKeyframe(
  keyframe: AuthoritativeHistoryKeyframe,
): AuthoritativeHistoryKeyframe {
  return {
    schemaVersion: AUTHORITATIVE_HISTORY_SCHEMA_VERSION,
    runBranchIdentity: keyframe.runBranchIdentity,
    snapshot: structuredClone(keyframe.snapshot),
  }
}

export function createAuthoritativeHistoryIndex(
  keyframes: readonly AuthoritativeHistoryKeyframe[],
): AuthoritativeHistoryIndex {
  if (!Array.isArray(keyframes) || keyframes.length === 0) {
    throw new Error('authoritative history requires at least one keyframe')
  }

  const stored: AuthoritativeHistoryKeyframe[] = []
  let branchIdentity: string | null = null
  let runIdentity: RunIdentity | null = null
  let previousCommandCount = -1
  let previousTime = -Infinity
  const traceHashes = new Set<string>()

  for (let index = 0; index < keyframes.length; index += 1) {
    if (!(index in keyframes)) {
      throw new Error('authoritative history keyframes must be dense')
    }
    const keyframe = keyframes[index]!
    if (keyframe.schemaVersion !== AUTHORITATIVE_HISTORY_SCHEMA_VERSION) {
      throw new Error('unsupported authoritative history schema version')
    }
    canonicalText('runBranchIdentity', keyframe.runBranchIdentity)

    const checkpoint = keyframe.snapshot.checkpoint
    if (checkpoint.authority !== 'composed') {
      throw new Error('historical product state requires composed authority')
    }
    if (
      !Number.isSafeInteger(checkpoint.commandCount) ||
      checkpoint.commandCount < 0
    ) {
      throw new Error('history commandCount must be a non-negative safe integer')
    }
    if (
      !Number.isFinite(checkpoint.simulationTimeHours) ||
      checkpoint.simulationTimeHours < 0
    ) {
      throw new Error('history simulationTimeHours must be finite and non-negative')
    }

    if (branchIdentity === null) {
      branchIdentity = keyframe.runBranchIdentity
      runIdentity = checkpoint.identity
    } else {
      if (keyframe.runBranchIdentity !== branchIdentity) {
        throw new Error('authoritative history cannot mix run branches')
      }
      if (!sameRunIdentity(checkpoint.identity, runIdentity!)) {
        throw new Error('authoritative history cannot mix run identities')
      }
    }

    if (checkpoint.commandCount <= previousCommandCount) {
      throw new Error('history commandCount must be strictly increasing')
    }
    if (checkpoint.simulationTimeHours < previousTime) {
      throw new Error('history biological time must be non-decreasing')
    }
    if (traceHashes.has(keyframe.snapshot.traceHash)) {
      throw new Error('history snapshot trace hashes must be unique')
    }

    previousCommandCount = checkpoint.commandCount
    previousTime = checkpoint.simulationTimeHours
    traceHashes.add(keyframe.snapshot.traceHash)
    stored.push(cloneKeyframe(keyframe))
  }

  const first = stored[0]!
  const last = stored[stored.length - 1]!
  const resolvedBranchIdentity = branchIdentity!
  const resolvedRunIdentity = structuredClone(runIdentity!)

  function resolve(
    requestedCommandPosition: number,
  ): HistoricalStateResolution {
    if (
      !Number.isFinite(requestedCommandPosition) ||
      requestedCommandPosition < 0
    ) {
      throw new Error(
        'historical requested command position must be finite and non-negative',
      )
    }

    if (requestedCommandPosition <= first.snapshot.checkpoint.commandCount) {
      return {
        kind: 'authoritative',
        requestedCommandPosition,
        keyframe: cloneKeyframe(first),
      }
    }
    if (requestedCommandPosition >= last.snapshot.checkpoint.commandCount) {
      return {
        kind: 'authoritative',
        requestedCommandPosition,
        keyframe: cloneKeyframe(last),
      }
    }

    let low = 0
    let high = stored.length - 1
    while (low < high) {
      const middle = Math.floor((low + high) / 2)
      if (
        stored[middle]!.snapshot.checkpoint.commandCount <
        requestedCommandPosition
      ) {
        low = middle + 1
      } else {
        high = middle
      }
    }

    const upper = stored[low]!
    if (upper.snapshot.checkpoint.commandCount === requestedCommandPosition) {
      return {
        kind: 'authoritative',
        requestedCommandPosition,
        keyframe: cloneKeyframe(upper),
      }
    }

    const lower = stored[low - 1]!
    const lowerPosition = lower.snapshot.checkpoint.commandCount
    const upperPosition = upper.snapshot.checkpoint.commandCount
    const progress =
      (requestedCommandPosition - lowerPosition) /
      (upperPosition - lowerPosition)

    return {
      kind: 'between-authority',
      requestedCommandPosition,
      runBranchIdentity: resolvedBranchIdentity,
      lower: cloneKeyframe(lower),
      upper: cloneKeyframe(upper),
      progress,
      stateAuthority: 'presentation-only',
    }
  }

  return Object.freeze({
    runBranchIdentity: resolvedBranchIdentity,
    identity: resolvedRunIdentity,
    firstCommandCount: first.snapshot.checkpoint.commandCount,
    lastCommandCount: last.snapshot.checkpoint.commandCount,
    keyframeCount: stored.length,
    resolve,
  })
}
