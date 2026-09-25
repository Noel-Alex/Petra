import { describe, expect, it } from 'vitest'
import { createRunIdentity, type SimulationSnapshot } from '../../src/sim/protocol'
import { buildScientificTimeline, updateScientificTimeline } from '../../src/ui/timeline'

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
      {
        sequence: 3,
        tick: 120,
        simulationTimeHours: 2,
        type: 'ciprofloxacin-applied',
        commandId: 'dose-1',
        intervention: {
          schemaVersion: 1,
          concentrationMgPerL: 0.125,
          concentrationUnit: 'mg/L',
          blendMode: 'set',
          geometry: { kind: 'global' },
        },
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
      {
        id: 'event-3',
        sequence: 3,
        tick: 120,
        simulationTimeHours: 2,
        kind: 'intervention',
        label: 'Ciprofloxacin set 0.125 mg/L (global)',
        commandId: 'dose-1',
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
  it('appends only the new suffix for a long retained history', () => {
    const previousEvents = Array.from({ length: 1_000 }, (_, sequence) => ({
      sequence,
      tick: sequence,
      simulationTimeHours: sequence / 10,
      type: 'advanced' as const,
      commandId: `advance-${sequence}`,
      value: 1,
    }))
    const previousSnapshot = snapshotWith(previousEvents)
    const previousTimeline = buildScientificTimeline(previousSnapshot)
    const appended = {
      sequence: 1_000,
      tick: 1_000,
      simulationTimeHours: 100,
      type: 'advanced' as const,
      commandId: 'advance-1000',
      value: 1,
    }

    const update = updateScientificTimeline({
      previousTimeline,
      previousEvents,
      nextEvents: [...previousEvents, appended],
    })

    expect(update.rebuilt).toBe(false)
    expect(update.appendedEvents).toEqual([appended])
    expect(update.timeline).toHaveLength(1_001)
    expect(update.timeline.slice(0, 1_000)).toEqual(previousTimeline)
    expect(update.timeline.at(-1)).toMatchObject({
      sequence: 1_000,
      commandId: 'advance-1000',
    })
  })

  it('reuses the existing timeline when a snapshot adds no event', () => {
    const events = [
      { sequence: 0, tick: 0, simulationTimeHours: 0, type: 'initialized' as const },
    ]
    const previousTimeline = buildScientificTimeline(snapshotWith(events))
    const update = updateScientificTimeline({
      previousTimeline,
      previousEvents: events,
      nextEvents: [...events],
    })

    expect(update.rebuilt).toBe(false)
    expect(update.appendedEvents).toEqual([])
    expect(update.timeline).toBe(previousTimeline)
  })

  it('rebuilds fail-closed when the retained boundary was rewritten', () => {
    const previousEvents = [
      { sequence: 0, tick: 0, simulationTimeHours: 0, type: 'initialized' as const },
      {
        sequence: 1,
        tick: 1,
        simulationTimeHours: 0.1,
        type: 'advanced' as const,
        commandId: 'old',
        value: 1,
      },
    ]
    const previousTimeline = buildScientificTimeline(snapshotWith(previousEvents))
    const rewritten = [
      previousEvents[0]!,
      {
        sequence: 1,
        tick: 1,
        simulationTimeHours: 0.1,
        type: 'advanced' as const,
        commandId: 'rewritten',
        value: 1,
      },
      {
        sequence: 2,
        tick: 2,
        simulationTimeHours: 0.2,
        type: 'advanced' as const,
        commandId: 'new',
        value: 1,
      },
    ]

    const update = updateScientificTimeline({
      previousTimeline,
      previousEvents,
      nextEvents: rewritten,
    })

    expect(update.rebuilt).toBe(true)
    expect(update.appendedEvents).toEqual(rewritten)
    expect(update.timeline.map((entry) => entry.commandId)).toEqual([
      undefined,
      'rewritten',
      'new',
    ])
  })

  it('validates only the appended sequence frontier and refuses duplicates', () => {
    const previousEvents = [
      { sequence: 0, tick: 0, simulationTimeHours: 0, type: 'initialized' as const },
      { sequence: 4, tick: 4, simulationTimeHours: 0.4, type: 'advanced' as const },
    ]
    const previousTimeline = buildScientificTimeline(snapshotWith(previousEvents))

    expect(() =>
      updateScientificTimeline({
        previousTimeline,
        previousEvents,
        nextEvents: [
          ...previousEvents,
          { sequence: 4, tick: 5, simulationTimeHours: 0.5, type: 'advanced' },
        ],
      }),
    ).toThrow(/duplicate authoritative event sequence: 4/)
  })

})
