import { describe, expect, it } from 'vitest'
import { createRunIdentity, type SimulationSnapshot } from '../../src/sim/protocol'
import { buildScientificTimeline } from '../../src/ui/timeline'

const identity = createRunIdentity({
  scenarioId: 'timeline-fixture',
  scenarioVersion: '1',
  parameterSetId: 'timeline-fixture',
  parameterSetVersion: '1',
  seed: 7,
})

describe('scientific timeline projection', () => {
  it('preserves event ordering, ticks, command identity, and derived simulation time', () => {
    const snapshot: SimulationSnapshot = {
      checkpoint: {
        identity,
        tick: 120,
        simulationTimeHours: 2,
        syntheticPopulation: 1_000,
        rngState: [1, 2, 3, 4],
        commandCount: 2,
      },
      events: [
        { sequence: 0, tick: 0, type: 'initialized' },
        { sequence: 1, tick: 60, type: 'advanced', commandId: 'advance-1', value: 60 },
        { sequence: 2, tick: 120, type: 'synthetic-pulse', commandId: 'pulse-1', value: 10 },
      ],
      traceHash: 'fixture',
    }

    expect(buildScientificTimeline(snapshot)).toEqual([
      {
        id: 'event-0',
        sequence: 0,
        tick: 0,
        simulationTimeHours: 0,
        kind: 'run',
        label: 'Run initialized',
      },
      {
        id: 'event-1',
        sequence: 1,
        tick: 60,
        simulationTimeHours: 1,
        kind: 'advance',
        label: 'Advanced 60 tick(s)',
        commandId: 'advance-1',
        value: 60,
      },
      {
        id: 'event-2',
        sequence: 2,
        tick: 120,
        simulationTimeHours: 2,
        kind: 'intervention',
        label: 'Synthetic intervention',
        commandId: 'pulse-1',
        value: 10,
      },
    ])
  })
})
