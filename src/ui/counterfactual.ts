/**
 * Presentation-only counterfactual comparison semantics.
 *
 * This module never forks or mutates authoritative simulation state. It describes
 * how already-created branches/snapshots should be labelled and compared by UI.
 */

export interface ForkOrigin {
  /** Stable run identifier supplied by the orchestration layer. */
  sourceRunId: string
  /** Trace/checkpoint fingerprint for the exact shared state at the fork. */
  checkpointTraceHash: string
  tick: number
  simulationTimeHours: number
  commandCount: number
}

export interface CounterfactualBranch {
  branchId: string
  label: string
  origin: ForkOrigin
  seed: number
  /** Commands issued after the shared fork, in authoritative order. */
  interventionCommandIds: readonly string[]
}

export type DivergenceCause =
  | 'none'
  | 'intervention'
  | 'seed'
  | 'seed-and-intervention'
  | 'incompatible-origin'

export interface ComparisonIdentity {
  leftBranchId: string
  rightBranchId: string
  hasSharedOrigin: boolean
  divergenceCause: DivergenceCause
  firstDivergentCommandIndex: number | null
}

export interface SynchronizedCompareCursor {
  requestedTimeHours: number
  leftTimeHours: number
  rightTimeHours: number
  isClamped: boolean
}

export interface TrajectorySample {
  simulationTimeHours: number
  population: number
  activeLineages: number
}

export interface TrajectoryDelta {
  simulationTimeHours: number
  populationDelta: number
  activeLineageDelta: number
}

function sameOrigin(a: ForkOrigin, b: ForkOrigin): boolean {
  return (
    a.sourceRunId === b.sourceRunId &&
    a.checkpointTraceHash === b.checkpointTraceHash &&
    a.tick === b.tick &&
    a.simulationTimeHours === b.simulationTimeHours &&
    a.commandCount === b.commandCount
  )
}

function firstCommandDifference(a: readonly string[], b: readonly string[]): number | null {
  const sharedLength = Math.min(a.length, b.length)
  for (let index = 0; index < sharedLength; index += 1) {
    if (a[index] !== b[index]) return index
  }
  return a.length === b.length ? null : sharedLength
}

/**
 * Classifies why two branches differ without pretending to infer biological cause.
 * A seed change is stochastic setup; a command-stream change is an intervention
 * difference. When both changed, UI must disclose both.
 */
export function describeComparison(
  left: CounterfactualBranch,
  right: CounterfactualBranch,
): ComparisonIdentity {
  if (!sameOrigin(left.origin, right.origin)) {
    return {
      leftBranchId: left.branchId,
      rightBranchId: right.branchId,
      hasSharedOrigin: false,
      divergenceCause: 'incompatible-origin',
      firstDivergentCommandIndex: null,
    }
  }

  const firstDivergentCommandIndex = firstCommandDifference(
    left.interventionCommandIds,
    right.interventionCommandIds,
  )
  const seedChanged = left.seed !== right.seed
  const interventionChanged = firstDivergentCommandIndex !== null

  let divergenceCause: DivergenceCause = 'none'
  if (seedChanged && interventionChanged) divergenceCause = 'seed-and-intervention'
  else if (seedChanged) divergenceCause = 'seed'
  else if (interventionChanged) divergenceCause = 'intervention'

  return {
    leftBranchId: left.branchId,
    rightBranchId: right.branchId,
    hasSharedOrigin: true,
    divergenceCause,
    firstDivergentCommandIndex,
  }
}

/**
 * Keeps side-by-side/swipe views on the same requested biological time while
 * clamping each branch only to data that actually exists.
 */
export function synchronizeCompareCursor(
  requestedTimeHours: number,
  leftAvailableThroughHours: number,
  rightAvailableThroughHours: number,
): SynchronizedCompareCursor {
  if (
    !Number.isFinite(requestedTimeHours) ||
    !Number.isFinite(leftAvailableThroughHours) ||
    !Number.isFinite(rightAvailableThroughHours) ||
    requestedTimeHours < 0 ||
    leftAvailableThroughHours < 0 ||
    rightAvailableThroughHours < 0
  ) {
    throw new RangeError('Compare cursor times must be finite and non-negative')
  }

  const leftTimeHours = Math.min(requestedTimeHours, leftAvailableThroughHours)
  const rightTimeHours = Math.min(requestedTimeHours, rightAvailableThroughHours)

  return {
    requestedTimeHours,
    leftTimeHours,
    rightTimeHours,
    isClamped: leftTimeHours !== requestedTimeHours || rightTimeHours !== requestedTimeHours,
  }
}

/**
 * Produces deltas only for exactly shared sample times. Interpolation belongs to
 * a chart adapter and must be labelled if introduced later.
 */
export function sharedTrajectoryDeltas(
  left: readonly TrajectorySample[],
  right: readonly TrajectorySample[],
): readonly TrajectoryDelta[] {
  const rightByTime = new Map<number, TrajectorySample>()
  for (const sample of right) rightByTime.set(sample.simulationTimeHours, sample)

  const deltas: TrajectoryDelta[] = []
  for (const sample of left) {
    const counterpart = rightByTime.get(sample.simulationTimeHours)
    if (!counterpart) continue
    deltas.push({
      simulationTimeHours: sample.simulationTimeHours,
      populationDelta: sample.population - counterpart.population,
      activeLineageDelta: sample.activeLineages - counterpart.activeLineages,
    })
  }
  return deltas
}
