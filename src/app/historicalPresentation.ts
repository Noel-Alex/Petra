import type { AuthoritativeAnalysisSeriesBundle } from './analysisMetrics'
import type {
  HistoricalStateResolution,
  AuthoritativeHistoryKeyframe,
} from './historicalState'
import { sameComposedParameterSetBinding } from '../sim/parameterSetBinding'
import {
  inspectAuthoritativeRegion,
  type AuthoritativeRegionInspection,
  type NormalizedRegionSelection,
} from '../sim/regionInspector'
import type {
  ComposedSimulationCheckpoint,
  RunIdentity,
} from '../sim/protocol'
import type {
  DishReplayMotion,
  DishReplayPresentation,
  DishReplayPresenter,
} from '../render/replayPresentation'

export const HISTORICAL_PRESENTATION_SCHEMA_VERSION = 1 as const

export type HistoricalTimeDescriptor =
  | {
      readonly kind: 'authoritative'
      readonly commandCount: number
      readonly simulationTimeHours: number
    }
  | {
      readonly kind: 'bounded-presentation'
      readonly lowerCommandCount: number
      readonly upperCommandCount: number
      readonly lowerSimulationTimeHours: number
      readonly upperSimulationTimeHours: number
      readonly progress: number
    }

export type HistoricalAnalysisCursor =
  | {
      readonly kind: 'authoritative'
      readonly stateAuthority: 'authoritative'
      readonly commandCount: number
      readonly simulationTimeHours: number
    }
  | {
      readonly kind: 'between-authority'
      readonly stateAuthority: 'presentation-only'
      readonly lowerCommandCount: number
      readonly upperCommandCount: number
      readonly lowerSimulationTimeHours: number
      readonly upperSimulationTimeHours: number
      readonly progress: number
      readonly scientificInterpolation: false
    }

interface HistoricalPresentationFrameBase {
  readonly schemaVersion: typeof HISTORICAL_PRESENTATION_SCHEMA_VERSION
  readonly runBranchIdentity: string
  readonly identity: RunIdentity
  readonly requestedCommandPosition: number
  readonly dish: DishReplayPresentation
  readonly analysis:
    | {
        readonly series: AuthoritativeAnalysisSeriesBundle
        readonly cursor: HistoricalAnalysisCursor
      }
    | null
  readonly time: HistoricalTimeDescriptor
}

export interface AuthoritativeHistoricalPresentationFrame
  extends HistoricalPresentationFrameBase {
  readonly kind: 'authoritative'
  readonly stateAuthority: 'authoritative'
  readonly scientificCheckpoint: ComposedSimulationCheckpoint
  readonly regionInspection: AuthoritativeRegionInspection | null
  readonly regionInspectionUnavailableReason: null
}

export interface BetweenAuthorityHistoricalPresentationFrame
  extends HistoricalPresentationFrameBase {
  readonly kind: 'between-authority'
  readonly stateAuthority: 'presentation-only'
  readonly scientificCheckpoint: null
  readonly regionInspection: null
  readonly regionInspectionUnavailableReason:
    | 'presentation-only-cursor'
    | null
}

export type HistoricalPresentationFrame =
  | AuthoritativeHistoricalPresentationFrame
  | BetweenAuthorityHistoricalPresentationFrame

export interface ProjectHistoricalPresentationArgs {
  readonly resolution: HistoricalStateResolution
  readonly dishPresenter: DishReplayPresenter
  readonly dishMotion?: DishReplayMotion
  readonly regionSelection?: NormalizedRegionSelection | null
  readonly analysisSeries?: AuthoritativeAnalysisSeriesBundle | null
}

/**
 * Bind all scrub consumers to one resolved historical cursor.
 *
 * Exact authority may feed scientific projections. A between-keyframe cursor is
 * presentation-only even when the renderer elects to visually snap to a real
 * lower keyframe; no checkpoint or inspector measurement is exposed for the
 * requested in-between position.
 */
export function projectHistoricalPresentation(
  args: ProjectHistoricalPresentationArgs,
): HistoricalPresentationFrame {
  const { resolution } = args
  const requested = resolution.requestedCommandPosition
  if (!Number.isFinite(requested) || requested < 0) {
    throw new RangeError(
      'historical presentation command position must be finite and non-negative',
    )
  }

  const dish = args.dishPresenter.evaluate(
    requested,
    args.dishMotion ?? 'interpolate',
  )
  if (dish === null) {
    throw new Error(
      'historical presentation requires dish replay keyframes aligned to simulation history',
    )
  }

  if (resolution.kind === 'authoritative') {
    const keyframe = resolution.keyframe
    const checkpoint = keyframe.snapshot.checkpoint
    validateHistoricalKeyframe(keyframe)
    validateDishAgainstAuthoritativeKeyframe(dish, keyframe, requested)

    const analysis = analysisProjection(
      args.analysisSeries ?? null,
      checkpoint.identity,
      {
        kind: 'authoritative',
        stateAuthority: 'authoritative',
        commandCount: checkpoint.commandCount,
        simulationTimeHours: checkpoint.simulationTimeHours,
      },
    )

    const selection = args.regionSelection ?? null
    const regionInspection =
      selection === null
        ? null
        : inspectAuthoritativeRegion(
            structuredClone(checkpoint.composedState),
            selection,
          )

    return Object.freeze({
      schemaVersion: HISTORICAL_PRESENTATION_SCHEMA_VERSION,
      kind: 'authoritative',
      stateAuthority: 'authoritative',
      runBranchIdentity: keyframe.runBranchIdentity,
      identity: structuredClone(checkpoint.identity),
      requestedCommandPosition: requested,
      scientificCheckpoint: structuredClone(checkpoint),
      regionInspection:
        regionInspection === null
          ? null
          : structuredClone(regionInspection),
      regionInspectionUnavailableReason: null,
      dish,
      analysis,
      time: Object.freeze({
        kind: 'authoritative',
        commandCount: checkpoint.commandCount,
        simulationTimeHours: checkpoint.simulationTimeHours,
      }),
    })
  }

  validateHistoricalKeyframe(resolution.lower)
  validateHistoricalKeyframe(resolution.upper)
  validateBetweenResolution(resolution)
  validateDishAgainstBounds(dish, resolution)

  const lowerCheckpoint = resolution.lower.snapshot.checkpoint
  const upperCheckpoint = resolution.upper.snapshot.checkpoint
  const analysis = analysisProjection(
    args.analysisSeries ?? null,
    lowerCheckpoint.identity,
    {
      kind: 'between-authority',
      stateAuthority: 'presentation-only',
      lowerCommandCount: lowerCheckpoint.commandCount,
      upperCommandCount: upperCheckpoint.commandCount,
      lowerSimulationTimeHours: lowerCheckpoint.simulationTimeHours,
      upperSimulationTimeHours: upperCheckpoint.simulationTimeHours,
      progress: resolution.progress,
      scientificInterpolation: false,
    },
  )

  return Object.freeze({
    schemaVersion: HISTORICAL_PRESENTATION_SCHEMA_VERSION,
    kind: 'between-authority',
    stateAuthority: 'presentation-only',
    runBranchIdentity: resolution.runBranchIdentity,
    identity: structuredClone(lowerCheckpoint.identity),
    requestedCommandPosition: requested,
    scientificCheckpoint: null,
    regionInspection: null,
    regionInspectionUnavailableReason:
      args.regionSelection === undefined || args.regionSelection === null
        ? null
        : 'presentation-only-cursor',
    dish,
    analysis,
    time: Object.freeze({
      kind: 'bounded-presentation',
      lowerCommandCount: lowerCheckpoint.commandCount,
      upperCommandCount: upperCheckpoint.commandCount,
      lowerSimulationTimeHours: lowerCheckpoint.simulationTimeHours,
      upperSimulationTimeHours: upperCheckpoint.simulationTimeHours,
      progress: resolution.progress,
    }),
  })
}

function validateHistoricalKeyframe(
  keyframe: AuthoritativeHistoryKeyframe,
): void {
  const checkpoint = keyframe.snapshot.checkpoint
  if (checkpoint.authority !== 'composed') {
    throw new Error('historical presentation requires composed authority')
  }
  canonicalText('runBranchIdentity', keyframe.runBranchIdentity)
  if (
    !Number.isSafeInteger(checkpoint.commandCount) ||
    checkpoint.commandCount < 0
  ) {
    throw new RangeError(
      'historical presentation commandCount must be a non-negative safe integer',
    )
  }
  if (
    !Number.isFinite(checkpoint.simulationTimeHours) ||
    checkpoint.simulationTimeHours < 0
  ) {
    throw new RangeError(
      'historical presentation biological time must be finite and non-negative',
    )
  }
}

function validateBetweenResolution(
  resolution: Extract<
    HistoricalStateResolution,
    { kind: 'between-authority' }
  >,
): void {
  if (resolution.stateAuthority !== 'presentation-only') {
    throw new Error(
      'between-keyframe historical state must remain presentation-only',
    )
  }
  if (
    resolution.lower.runBranchIdentity !== resolution.runBranchIdentity ||
    resolution.upper.runBranchIdentity !== resolution.runBranchIdentity
  ) {
    throw new Error('historical presentation bounds mix run branches')
  }

  const lower = resolution.lower.snapshot.checkpoint
  const upper = resolution.upper.snapshot.checkpoint
  if (!sameRunIdentity(lower.identity, upper.identity)) {
    throw new Error('historical presentation bounds mix run identities')
  }
  if (lower.commandCount >= upper.commandCount) {
    throw new Error(
      'historical presentation bounds must increase accepted command count',
    )
  }
  if (
    resolution.requestedCommandPosition <= lower.commandCount ||
    resolution.requestedCommandPosition >= upper.commandCount
  ) {
    throw new Error(
      'between-keyframe historical cursor must lie strictly between bounds',
    )
  }
  if (
    !Number.isFinite(resolution.progress) ||
    resolution.progress <= 0 ||
    resolution.progress >= 1
  ) {
    throw new RangeError(
      'between-keyframe historical progress must be finite and within (0, 1)',
    )
  }
  const expectedProgress =
    (resolution.requestedCommandPosition - lower.commandCount) /
    (upper.commandCount - lower.commandCount)
  if (!numbersAgree(resolution.progress, expectedProgress)) {
    throw new Error(
      'historical presentation progress does not match command-position bounds',
    )
  }
}

function validateDishAgainstAuthoritativeKeyframe(
  dish: DishReplayPresentation,
  keyframe: AuthoritativeHistoryKeyframe,
  requested: number,
): void {
  const checkpoint = keyframe.snapshot.checkpoint
  validateDishCommon(dish, keyframe.runBranchIdentity, requested)
  if (
    dish.mode !== 'authoritative-keyframe' ||
    dish.stateAuthority !== 'authoritative' ||
    dish.lowerAcceptedCommandCount !== checkpoint.commandCount ||
    dish.upperAcceptedCommandCount !== checkpoint.commandCount ||
    dish.lowerSimulationTimeHours !== checkpoint.simulationTimeHours ||
    dish.upperSimulationTimeHours !== checkpoint.simulationTimeHours
  ) {
    throw new Error(
      'dish replay presentation is not aligned to the exact authoritative historical checkpoint',
    )
  }
}

function validateDishAgainstBounds(
  dish: DishReplayPresentation,
  resolution: Extract<
    HistoricalStateResolution,
    { kind: 'between-authority' }
  >,
): void {
  validateDishCommon(
    dish,
    resolution.runBranchIdentity,
    resolution.requestedCommandPosition,
  )
  const lower = resolution.lower.snapshot.checkpoint
  const upper = resolution.upper.snapshot.checkpoint
  if (
    dish.lowerAcceptedCommandCount !== lower.commandCount ||
    dish.upperAcceptedCommandCount !== upper.commandCount ||
    dish.lowerSimulationTimeHours !== lower.simulationTimeHours ||
    dish.upperSimulationTimeHours !== upper.simulationTimeHours ||
    !numbersAgree(dish.progress, resolution.progress)
  ) {
    throw new Error(
      'dish replay presentation bounds do not match the resolved historical cursor',
    )
  }
}

function validateDishCommon(
  dish: DishReplayPresentation,
  runBranchIdentity: string,
  requested: number,
): void {
  if (dish.runBranchIdentity !== runBranchIdentity) {
    throw new Error('dish replay presentation belongs to a different run branch')
  }
  if (!numbersAgree(dish.requestedOrderPosition, requested)) {
    throw new Error(
      'dish replay presentation command position does not match historical cursor',
    )
  }
}

function analysisProjection(
  series: AuthoritativeAnalysisSeriesBundle | null,
  identity: RunIdentity,
  cursor: HistoricalAnalysisCursor,
): HistoricalPresentationFrameBase['analysis'] {
  if (series === null) return null
  if (!sameRunIdentity(series.identity, identity)) {
    throw new Error(
      'historical analysis series belongs to a different run identity',
    )
  }
  return Object.freeze({
    series,
    cursor: Object.freeze(cursor),
  })
}

function sameRunIdentity(
  left: RunIdentity,
  right: RunIdentity,
): boolean {
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

function canonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new TypeError(`${name} must be a canonical non-empty string`)
  }
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true
  return (
    Math.abs(left - right) <=
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right))
  )
}
