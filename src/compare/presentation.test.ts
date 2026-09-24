import { describe, expect, it } from 'vitest'

import {
  classifyDivergence,
  clampSwipePosition,
  createComparePresentation,
  divergenceLabel,
  synchronizeView,
  transitionForMotion,
  type CompareBranchRef,
  type CompareViewState,
} from './presentation'

const base: CompareBranchRef = {
  runId: 'left',
  forkSnapshotId: 'snapshot-42',
  seed: 7,
  commandStreamHash: 'commands-a',
}

describe('compare presentation semantics', () => {
  it('classifies intervention and stochastic divergence separately', () => {
    expect(classifyDivergence(base, { ...base, runId: 'right' })).toBe('none')
    expect(classifyDivergence(base, { ...base, runId: 'right', commandStreamHash: 'commands-b' })).toBe('intervention')
    expect(classifyDivergence(base, { ...base, runId: 'right', seed: 8 })).toBe('seed')
    expect(
      classifyDivergence(base, {
        ...base,
        runId: 'right',
        seed: 8,
        commandStreamHash: 'commands-b',
      }),
    ).toBe('mixed')
  })

  it('keeps divergence explicit in accessible text', () => {
    expect(divergenceLabel('intervention')).toContain('interventions')
    expect(divergenceLabel('seed')).toContain('stochastic seed')
  })

  it('clamps swipe position and defaults invalid values safely', () => {
    expect(clampSwipePosition(-1)).toBe(0)
    expect(clampSwipePosition(2)).toBe(1)
    expect(clampSwipePosition(Number.NaN)).toBe(0.5)
  })

  it('uses linked view state as presentation-only synchronization', () => {
    const source: CompareViewState = {
      simulationTimeHours: 12,
      camera: { centerX: 0.25, centerY: 0.75, zoom: 2 },
    }
    const target: CompareViewState = {
      simulationTimeHours: 3,
      camera: { centerX: 0.5, centerY: 0.5, zoom: 1 },
    }

    expect(synchronizeView(source, target, { linkTime: true, linkCamera: false })).toEqual({
      simulationTimeHours: 12,
      camera: target.camera,
    })
    expect(synchronizeView(source, target, { linkTime: false, linkCamera: true })).toEqual({
      simulationTimeHours: 3,
      camera: source.camera,
    })
  })

  it('degrades layout motion without losing the state change', () => {
    expect(transitionForMotion('full')).toEqual({ kind: 'transform-opacity', durationMs: 260 })
    expect(transitionForMotion('reduced')).toEqual({ kind: 'opacity', durationMs: 120 })
    expect(transitionForMotion('off')).toEqual({ kind: 'none', durationMs: 0 })
  })

  it('defaults to linked views and side-by-side mode', () => {
    const right = { ...base, runId: 'right', commandStreamHash: 'commands-b' }
    expect(createComparePresentation({ left: base, right })).toMatchObject({
      layout: 'side-by-side',
      swipePosition: 0.5,
      linkTime: true,
      linkCamera: true,
      divergence: 'intervention',
    })
  })
})
