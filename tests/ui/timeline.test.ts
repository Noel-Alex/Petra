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

function snapshotWith(events: SimulationSnapshot['events']): SimulationSnapshot {
  return {
    checkpoint: {
      identity,
      tick: 600,
      simulationTimeHours: 10,
      syntheticPopulation: 1_000,
      rngState: [1, 2, 3, 4],
      commandCount: 2,
    },
    events,
    traceHash: 'fixture',
  }
}

describe('scientific timeline projection', () => {
  it('preserves event ordering, ticks, command identity, and exact simulation time', () => {
    const snapshot = snapshotWith([
      { sequence: 0, tick: 0, simulationTimeHours: 0, type: 'initialized' },
      {
        sequence: 1,
        tick: 60,
        simulationTimeHours: 1,
        type: 'advanced',
        commandId: 'advance-1',
        value: 60,
      },
      {
        sequence: 2,
        tick: 120,
        simulationTimeHours: 2,
        type: 'synthetic-pulse',
        commandId: 'pulse-1',
        value: 10,
      },
    ])

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

  it('preserves valid non-contiguous authoritative sequence identities', () => {
    const timeline = buildScientificTimeline(
      snapshotWith([
        { sequence: 0, tick: 0, simulationTimeHours: 0, type: 'initialized' },
        { sequence: 2, tick: 30, simulationTimeHours: 0.5, type: 'advanced' },
        { sequence: 9, tick: 60, simulationTimeHours: 1, type: 'advanced' },
      ]),
    )

    expect(timeline.map((entry) => entry.sequence)).toEqual([0, 2, 9])
    expect(timeline.map((entry) => entry.id)).toEqual([
      'event-0',
      'event-2',
      'event-9',
    ])
  })

  it('rejects duplicate authoritative event sequence identity', () => {
    expect(() =>
      buildScientificTimeline(
        snapshotWith([
          { sequence: 0, tick: 0, simulationTimeHours: 0, type: 'initialized' },
          { sequence: 0, tick: 1, simulationTimeHours: 0.1, type: 'advanced' },
        ]),
      ),
    ).toThrow(/duplicate authoritative event sequence: 0/)
  })

  it('rejects decreasing authoritative event sequences instead of sorting them', () => {
    expect(() =>
      buildScientificTimeline(
        snapshotWith([
          { sequence: 4, tick: 0, simulationTimeHours: 0, type: 'initialized' },
          { sequence: 3, tick: 1, simulationTimeHours: 0.1, type: 'advanced' },
        ]),
      ),
    ).toThrow(/event sequences must be strictly increasing/)
  })

  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid authoritative event sequence %s',
    (sequence) => {
      expect(() =>
        buildScientificTimeline(
          snapshotWith([
            {
              sequence,
              tick: 0,
              simulationTimeHours: 0,
              type: 'initialized',
            },
          ]),
        ),
      ).toThrow(/event sequence must be a non-negative safe integer/)
    },
  )

  it('never reinterprets an older event from the latest checkpoint ratio', () => {
    const timeline = buildScientificTimeline(
      snapshotWith([
        {
          sequence: 0,
          tick: 30,
          simulationTimeHours: 1.25,
          type: 'advanced',
          commandId: 'non-proportional',
          value: 30,
        },
      ]),
    )

    expect(timeline[0]?.simulationTimeHours).toBe(1.25)
  })

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0.01])(
    'rejects invalid authoritative event time %s',
    (simulationTimeHours) => {
      expect(() =>
        buildScientificTimeline(
          snapshotWith([
            {
              sequence: 0,
              tick: 0,
              simulationTimeHours,
              type: 'initialized',
            },
          ]),
        ),
      ).toThrow(/simulationTimeHours must be finite and non-negative/)
    },
  )
})
