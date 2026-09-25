import { describe, expect, it } from 'vitest'

import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import { SimulationEngine } from '../../src/sim/engine'
import {
  EXPERIMENT_BUNDLE_SCHEMA_VERSION,
  createExperimentBundle,
  parseExperimentBundle,
  replayExperimentBundle,
  serializeExperimentBundle,
} from '../../src/sim/experimentBundle'
import { buildFlagshipComposedRunPlan } from '../../src/sim/flagshipComposition'
import {
  PROTOCOL_VERSION,
  createRunIdentity,
  type SimulationCommand,
} from '../../src/sim/protocol'
import {
  parseWorkerRequest,
  parseWorkerResponse,
} from '../../src/sim/protocolRuntime'
import {
  MODEL_RESOURCE_INTERVENTION_SCHEMA_VERSION,
  MODEL_RESOURCE_UNIT,
} from '../../src/sim/resourceIntervention'
import { buildScientificTimeline } from '../../src/ui/timeline'

const INITIALIZATION = Object.freeze({
  seed: 0x9182026,
  initialResourceLevel: 8,
  inocula: Object.freeze([
    Object.freeze({
      lineageId: 'founder-wt',
      x: 80,
      y: 80,
      biomass: 1,
    }),
  ]),
})

function resourceCommand(
  id = 'resource-global-set',
): Extract<SimulationCommand, { type: 'apply-model-resource' }> {
  return {
    id,
    type: 'apply-model-resource',
    intervention: {
      schemaVersion: MODEL_RESOURCE_INTERVENTION_SCHEMA_VERSION,
      resourceValue: 2,
      resourceUnit: MODEL_RESOURCE_UNIT,
      blendMode: 'set',
      geometry: { kind: 'global' },
    },
  }
}

describe('model-resource protocol and replay integration', () => {
  it('accepts one authoritative resource command without advancing biology', () => {
    const plan = buildFlagshipComposedRunPlan(INITIALIZATION)
    const engine = new ComposedSimulationEngine(plan.identity, plan.config)
    const before = engine.snapshot()
    const command = resourceCommand()

    const after = engine.execute(command)

    expect(after.checkpoint.tick).toBe(before.checkpoint.tick)
    expect(after.checkpoint.simulationTimeHours).toBe(
      before.checkpoint.simulationTimeHours,
    )
    expect(after.checkpoint.commandCount).toBe(
      before.checkpoint.commandCount + 1,
    )
    expect(after.checkpoint.rngState).toEqual(before.checkpoint.rngState)
    expect(after.checkpoint.metrics.totalBiomass).toBe(
      before.checkpoint.metrics.totalBiomass,
    )
    expect(after.ecologyObservation).toBeUndefined()

    let inMaskCells = 0
    for (let index = 0; index < plan.config.mask.length; index += 1) {
      const value = after.checkpoint.composedState.resource[index]
      if (plan.config.mask[index] === 1) {
        inMaskCells += 1
        expect(value).toBe(2)
      } else {
        expect(value).toBe(0)
      }
    }
    expect(after.checkpoint.metrics.totalResource).toBe(2 * inMaskCells)

    expect(after.events.at(-1)).toEqual({
      sequence: before.events.length,
      tick: before.checkpoint.tick,
      simulationTimeHours: before.checkpoint.simulationTimeHours,
      type: 'model-resource-applied',
      commandId: command.id,
      resourceIntervention: command.intervention,
    })

    expect(buildScientificTimeline(after).at(-1)).toMatchObject({
      kind: 'intervention',
      commandId: command.id,
      label: 'Resource set 2 model-resource (global)',
    })
  })

  it('rejects malformed resource commands as exact replay no-ops', () => {
    const plan = buildFlagshipComposedRunPlan(INITIALIZATION)
    const engine = new ComposedSimulationEngine(plan.identity, plan.config)
    const before = engine.snapshot()

    expect(() =>
      engine.execute({
        ...resourceCommand('resource-overflow'),
        intervention: {
          ...resourceCommand().intervention,
          resourceValue: Number.MAX_VALUE,
        },
      }),
    ).toThrow(/model-resource|Float32|finite/i)

    expect(engine.snapshot()).toEqual(before)
  })

  it('promotes the command/event through protocol v9 and refuses false units', () => {
    const plan = buildFlagshipComposedRunPlan(INITIALIZATION)
    const command = resourceCommand('resource-protocol')

    const request = parseWorkerRequest({
      protocolVersion: PROTOCOL_VERSION,
      type: 'command',
      command,
    })
    expect(request.ok).toBe(true)

    const invalid = parseWorkerRequest({
      protocolVersion: PROTOCOL_VERSION,
      type: 'command',
      command: {
        ...command,
        intervention: {
          ...command.intervention,
          resourceUnit: 'glucose',
        },
      },
    })
    expect(invalid.ok).toBe(false)
    if (!invalid.ok) {
      expect(invalid.commandId).toBe(command.id)
      expect(invalid.error).toMatch(/model-resource/i)
    }

    const engine = new ComposedSimulationEngine(plan.identity, plan.config)
    const snapshot = engine.execute(command)
    const response = parseWorkerResponse({
      protocolVersion: PROTOCOL_VERSION,
      type: 'snapshot',
      commandId: command.id,
      snapshot,
    })
    expect(response.ok).toBe(true)
  })

  it('restores, continues, and experiment-bundle replays resource authority exactly', () => {
    const plan = buildFlagshipComposedRunPlan(INITIALIZATION)
    const command = resourceCommand('resource-replay')
    const direct = new ComposedSimulationEngine(plan.identity, plan.config)
    const origin = direct.snapshot()
    const applied = direct.execute(command)
    const checkpoint = structuredClone(applied.checkpoint)

    const suffix = {
      id: 'resource-replay-advance',
      type: 'advance' as const,
      ticks: 1,
    }
    const expected = direct.execute(suffix).checkpoint

    const restored = new ComposedSimulationEngine(plan.identity, plan.config)
    restored.execute({
      id: 'resource-replay-restore',
      type: 'restore',
      checkpoint,
    })
    const continued = restored.execute(suffix).checkpoint
    expect(continued).toEqual(expected)

    const bundleCommands = [command, suffix] as const
    const bundle = createExperimentBundle({
      originCheckpoint: origin.checkpoint,
      commands: bundleCommands,
      composedConfig: plan.config,
      events: applied.events,
    })
    expect(bundle.schemaVersion).toBe(EXPERIMENT_BUNDLE_SCHEMA_VERSION)

    const parsed = parseExperimentBundle(serializeExperimentBundle(bundle))
    const replayed = replayExperimentBundle(parsed)

    const expectedReplay = new ComposedSimulationEngine(plan.identity, plan.config)
    expectedReplay.execute({
      id: 'expected-bundle-restore',
      type: 'restore',
      checkpoint: structuredClone(origin.checkpoint),
    })
    for (const replayCommand of bundleCommands) {
      expectedReplay.execute(structuredClone(replayCommand))
    }
    expect(replayed.checkpoint).toEqual(expectedReplay.snapshot().checkpoint)
  })

  it('keeps model-resource commands out of synthetic fixture authority', () => {
    const identity = createRunIdentity({
      scenarioId: 'resource-synthetic-refusal',
      scenarioVersion: '1',
      parameterSetId: 'none',
      parameterSetVersion: '1',
      seed: 918,
    })
    const engine = new SimulationEngine(identity)
    const before = engine.snapshot()

    expect(() => engine.execute(resourceCommand('resource-synthetic'))).toThrow(
      /not available in the synthetic fixture engine/i,
    )
    expect(engine.snapshot()).toEqual(before)
  })
})
