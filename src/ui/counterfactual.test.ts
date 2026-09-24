import { describe, expect, it } from 'vitest'
import {
  describeComparison,
  sharedTrajectoryDeltas,
  synchronizeCompareCursor,
  type CounterfactualBranch,
  type ForkOrigin,
} from './counterfactual'

const origin: ForkOrigin = {
  sourceRunId: 'run-a',
  checkpointTraceHash: 'trace-at-fork',
  tick: 120,
  simulationTimeHours: 2,
  commandCount: 4,
}

function branch(overrides: Partial<CounterfactualBranch> = {}): CounterfactualBranch {
  return {
    branchId: 'left',
    label: 'Baseline',
    origin,
    seed: 42,
    interventionCommandIds: ['dose-1'],
    ...overrides,
  }
}

describe('counterfactual presentation semantics', () => {
  it('keeps branches identical until seed or intervention streams diverge', () => {
    expect(describeComparison(branch(), branch({ branchId: 'right' }))).toEqual({
      leftBranchId: 'left',
      rightBranchId: 'right',
      hasSharedOrigin: true,
      divergenceCause: 'none',
      firstDivergentCommandIndex: null,
    })

    expect(
      describeComparison(
        branch(),
        branch({ branchId: 'right', interventionCommandIds: ['dose-1', 'washout-2'] }),
      ),
    ).toMatchObject({
      divergenceCause: 'intervention',
      firstDivergentCommandIndex: 1,
    })
  })

  it('labels stochastic seed differences separately from intervention differences', () => {
    expect(describeComparison(branch(), branch({ branchId: 'right', seed: 99 }))).toMatchObject({
      divergenceCause: 'seed',
      firstDivergentCommandIndex: null,
    })

    expect(
      describeComparison(
        branch(),
        branch({ branchId: 'right', seed: 99, interventionCommandIds: ['dose-2'] }),
      ),
    ).toMatchObject({
      divergenceCause: 'seed-and-intervention',
      firstDivergentCommandIndex: 0,
    })
  })

  it('refuses to imply counterfactual ancestry across different fork states', () => {
    const right = branch({
      branchId: 'right',
      origin: { ...origin, checkpointTraceHash: 'different-state' },
    })
    expect(describeComparison(branch(), right)).toMatchObject({
      hasSharedOrigin: false,
      divergenceCause: 'incompatible-origin',
    })
  })

  it('synchronizes presentation time without inventing unavailable future state', () => {
    expect(synchronizeCompareCursor(8, 10, 6)).toEqual({
      requestedTimeHours: 8,
      leftTimeHours: 8,
      rightTimeHours: 6,
      isClamped: true,
    })
    expect(() => synchronizeCompareCursor(-1, 10, 10)).toThrow(RangeError)
  })

  it('computes deltas only at shared authoritative sample times', () => {
    expect(
      sharedTrajectoryDeltas(
        [
          { simulationTimeHours: 0, population: 10, activeLineages: 1 },
          { simulationTimeHours: 1, population: 25, activeLineages: 2 },
          { simulationTimeHours: 2, population: 40, activeLineages: 2 },
        ],
        [
          { simulationTimeHours: 0, population: 10, activeLineages: 1 },
          { simulationTimeHours: 2, population: 30, activeLineages: 3 },
        ],
      ),
    ).toEqual([
      { simulationTimeHours: 0, populationDelta: 0, activeLineageDelta: 0 },
      { simulationTimeHours: 2, populationDelta: 10, activeLineageDelta: -1 },
    ])
  })
})
