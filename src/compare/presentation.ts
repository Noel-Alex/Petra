export type CompareLayout = 'side-by-side' | 'swipe'
export type MotionMode = 'full' | 'reduced' | 'off'
export type DivergenceKind = 'none' | 'intervention' | 'seed' | 'mixed'

export interface CompareBranchRef {
  runId: string
  forkSnapshotId: string
  seed: number
  commandStreamHash: string
}

export interface CompareCamera {
  centerX: number
  centerY: number
  zoom: number
}

export interface CompareViewState {
  simulationTimeHours: number
  camera: CompareCamera
}

export interface ComparePresentation {
  left: CompareBranchRef
  right: CompareBranchRef
  layout: CompareLayout
  swipePosition: number
  linkTime: boolean
  linkCamera: boolean
  divergence: DivergenceKind
}

export interface TransitionSpec {
  kind: 'transform-opacity' | 'opacity' | 'none'
  durationMs: number
}

export function classifyDivergence(left: CompareBranchRef, right: CompareBranchRef): DivergenceKind {
  const sameSeed = left.seed === right.seed
  const sameCommands = left.commandStreamHash === right.commandStreamHash

  if (sameSeed && sameCommands) return 'none'
  if (!sameSeed && !sameCommands) return 'mixed'
  if (!sameSeed) return 'seed'
  return 'intervention'
}

export function createComparePresentation(input: {
  left: CompareBranchRef
  right: CompareBranchRef
  layout?: CompareLayout
  swipePosition?: number
  linkTime?: boolean
  linkCamera?: boolean
}): ComparePresentation {
  return {
    left: input.left,
    right: input.right,
    layout: input.layout ?? 'side-by-side',
    swipePosition: clampSwipePosition(input.swipePosition ?? 0.5),
    linkTime: input.linkTime ?? true,
    linkCamera: input.linkCamera ?? true,
    divergence: classifyDivergence(input.left, input.right),
  }
}

export function clampSwipePosition(value: number): number {
  if (!Number.isFinite(value)) return 0.5
  return Math.min(1, Math.max(0, value))
}

export function transitionForMotion(mode: MotionMode): TransitionSpec {
  switch (mode) {
    case 'full':
      return { kind: 'transform-opacity', durationMs: 260 }
    case 'reduced':
      return { kind: 'opacity', durationMs: 120 }
    case 'off':
      return { kind: 'none', durationMs: 0 }
  }
}

export function synchronizeView(
  source: CompareViewState,
  target: CompareViewState,
  options: Pick<ComparePresentation, 'linkTime' | 'linkCamera'>,
): CompareViewState {
  return {
    simulationTimeHours: options.linkTime ? source.simulationTimeHours : target.simulationTimeHours,
    camera: options.linkCamera ? { ...source.camera } : { ...target.camera },
  }
}

export function divergenceLabel(kind: DivergenceKind): string {
  switch (kind) {
    case 'none':
      return 'Same seed and intervention stream'
    case 'intervention':
      return 'Different interventions from the same seed'
    case 'seed':
      return 'Different stochastic seed with matching intervention stream'
    case 'mixed':
      return 'Different seed and intervention stream'
  }
}
