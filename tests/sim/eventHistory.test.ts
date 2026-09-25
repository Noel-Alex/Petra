import { describe, expect, it } from 'vitest'

import {
  EMPTY_SIMULATION_EVENT_HISTORY,
  appendSimulationEventHistory,
} from '../../src/sim/eventHistory'

describe('immutable simulation event history', () => {
  it('clones and deeply freezes each new event once', () => {
    const source = {
      sequence: 0,
      tick: 0,
      simulationTimeHours: 0,
      type: 'ciprofloxacin-applied' as const,
      commandId: 'dose',
      intervention: {
        schemaVersion: 1 as const,
        concentrationMgPerL: 0.5,
        concentrationUnit: 'mg/L' as const,
        blendMode: 'set' as const,
        geometry: {
          kind: 'radial' as const,
          center: { x: 0.5, y: 0.5 },
          radius: 0.25,
        },
      },
    }

    const history = appendSimulationEventHistory(
      EMPTY_SIMULATION_EVENT_HISTORY,
      source,
    )
    const stored = history[0]!

    expect(stored).not.toBe(source)
    expect(Object.isFrozen(history)).toBe(true)
    expect(Object.isFrozen(stored)).toBe(true)
    expect(Object.isFrozen(stored.intervention)).toBe(true)
    expect(Object.isFrozen(stored.intervention?.geometry)).toBe(true)

    source.intervention.concentrationMgPerL = 9
    expect(stored.intervention?.concentrationMgPerL).toBe(0.5)
  })

  it('copy-on-write appends reuse the frozen prefix without mutating old history', () => {
    const first = appendSimulationEventHistory(
      EMPTY_SIMULATION_EVENT_HISTORY,
      {
        sequence: 0,
        tick: 0,
        simulationTimeHours: 0,
        type: 'initialized',
      },
    )
    const second = appendSimulationEventHistory(first, {
      sequence: 1,
      tick: 2,
      simulationTimeHours: 0.04,
      type: 'advanced',
      commandId: 'advance',
      value: 2,
    })

    expect(first).toHaveLength(1)
    expect(second).toHaveLength(2)
    expect(second).not.toBe(first)
    expect(second[0]).toBe(first[0])
  })

  it('refuses a non-append sequence instead of silently renumbering it', () => {
    expect(() =>
      appendSimulationEventHistory(EMPTY_SIMULATION_EVENT_HISTORY, {
        sequence: 4,
        tick: 0,
        simulationTimeHours: 0,
        type: 'initialized',
      }),
    ).toThrow(/sequence must equal the append-only history length/)
  })
})
