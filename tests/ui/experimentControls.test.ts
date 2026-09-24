import { describe, expect, it } from 'vitest'
import { PROTOCOL_VERSION, createRunIdentity } from '../../src/sim/protocol'
import {
  createExperimentControlState,
  planExperimentControlAction,
  recordAcceptedCommand,
  schedulerAdvanceTicks,
} from '../../src/ui/experimentControls'
import { actionForShortcut } from '../../src/ui/keyboard'

const identity = createRunIdentity({
  scenarioId: 'ui-fixture',
  scenarioVersion: '1',
  parameterSetId: 'ui-fixture',
  parameterSetVersion: '1',
  seed: 42,
})

function idFactory(...ids: string[]): () => string {
  let index = 0
  return () => ids[index++] ?? `generated-${index}`
}

describe('experiment control planning', () => {
  it('keeps pause and speed changes in UI state without mutating simulation authority', () => {
    const initial = createExperimentControlState(identity)
    const playing = planExperimentControlAction(initial, { type: 'play' }, idFactory()).state
    const spedUp = planExperimentControlAction(playing, { type: 'set-speed', speed: 16 }, idFactory())

    expect(spedUp.state.playing).toBe(true)
    expect(spedUp.state.speed).toBe(16)
    expect(spedUp.effect).toEqual({ type: 'none' })
    expect(schedulerAdvanceTicks(16)).toBe(16)
  })

  it('turns a manual step into one typed worker command', () => {
    const result = planExperimentControlAction(
      createExperimentControlState(identity),
      { type: 'step', ticks: 4 },
      idFactory('step-1'),
    )

    expect(result.effect).toEqual({
      type: 'worker-requests',
      requests: [{
        protocolVersion: PROTOCOL_VERSION,
        type: 'command',
        command: { id: 'step-1', type: 'advance', ticks: 4 },
      }],
    })
  })

  it('replays accepted commands from the same run identity in original order', () => {
    const initial = createExperimentControlState(identity)
    const withFirst = recordAcceptedCommand(initial, { id: 'a', type: 'advance', ticks: 2 })
    const withSecond = recordAcceptedCommand(withFirst, { id: 'b', type: 'synthetic-pulse', magnitude: 3 })
    const result = planExperimentControlAction(withSecond, { type: 'replay' }, idFactory())

    expect(result.state.playing).toBe(false)
    expect(result.effect.type).toBe('worker-requests')
    if (result.effect.type !== 'worker-requests') throw new Error('expected worker requests')
    expect(result.effect.requests.map((request) => request.type)).toEqual(['initialize', 'command', 'command'])
    expect(result.effect.requests[0]).toMatchObject({ type: 'initialize', identity })
    expect(result.effect.requests[1]).toMatchObject({ type: 'command', command: { id: 'a' } })
    expect(result.effect.requests[2]).toMatchObject({ type: 'command', command: { id: 'b' } })
  })

  it('changing seed starts a fresh deterministic run rather than mutating the old one', () => {
    const state = recordAcceptedCommand(
      createExperimentControlState(identity),
      { id: 'a', type: 'advance', ticks: 2 },
    )
    const result = planExperimentControlAction(state, { type: 'set-seed', seed: 99 }, idFactory())

    expect(result.state.identity.seed).toBe(99)
    expect(result.state.acceptedCommands).toEqual([])
    expect(result.effect).toMatchObject({
      type: 'worker-requests',
      requests: [{ type: 'initialize', identity: { seed: 99 } }],
    })
  })
})

describe('keyboard shortcuts', () => {
  it('maps accessible playback shortcuts', () => {
    expect(actionForShortcut(' ', { editableTarget: false })).toEqual({ type: 'toggle-play' })
    expect(actionForShortcut('.', { editableTarget: false })).toEqual({ type: 'step', ticks: 1 })
    expect(actionForShortcut('3', { editableTarget: false })).toEqual({ type: 'set-speed', speed: 16 })
  })

  it('does not hijack typing controls', () => {
    expect(actionForShortcut(' ', { editableTarget: true })).toBeNull()
    expect(actionForShortcut('1', { editableTarget: true })).toBeNull()
  })
})
