import { describe, expect, it } from 'vitest'

import {
  createComposedState,
  stepComposedState,
} from '../../src/sim/authoritative'
import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
} from '../../src/sim/ciprofloxacinIntervention'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import { buildFlagshipComposedRunPlan } from '../../src/sim/flagshipComposition'

const initialization = {
  seed: 0x5eed1234,
  initialResourceLevel: 8,
  inocula: [{ lineageId: 'founder-wt', x: 80, y: 80, biomass: 1 }],
}

function requireWtMic(): number {
  const plan = buildFlagshipComposedRunPlan(initialization)
  const wtMic = plan.config.ciprofloxacin?.genotypeMicMgPerL.find(
    (entry) => entry.genotypeId === 'WT',
  )?.micMgPerL

  expect(wtMic).toBeDefined()
  expect(wtMic).toBeGreaterThan(0)
  return wtMic!
}

describe('integrated flagship ciprofloxacin validation', () => {
  it('preserves zero-drug ecology with or without explicit PD authority', () => {
    const plan = buildFlagshipComposedRunPlan(initialization)
    const withPd = plan.config
    const withoutPd = { ...plan.config, ciprofloxacin: null }
    const withPdState = createComposedState(withPd)
    const withoutPdState = createComposedState(withoutPd)

    const withPdMetrics = stepComposedState(withPdState, withPd)
    const withoutPdMetrics = stepComposedState(withoutPdState, withoutPd)

    expect(withPdState.resource).toEqual(withoutPdState.resource)
    expect(withPdState.lineageBiomass).toEqual(withoutPdState.lineageBiomass)
    expect(withPdMetrics).toEqual(withoutPdMetrics)
  })

  it('changes the integrated response monotonically across WT-MIC-derived configured concentrations', () => {
    const plan = buildFlagshipComposedRunPlan(initialization)
    const wtMic = requireWtMic()

    const responses = [0, wtMic, wtMic * 2].map((concentration) => {
      const config = {
        ...plan.config,
        ciprofloxacinConcentrationMgPerL: plan.config.mask.map((inside) =>
          inside === 1 ? concentration : 0,
        ),
      }
      const state = createComposedState(config)
      return stepComposedState(state, config)
    })

    // Require a real integrated response, not merely non-violation of order:
    // an accidentally ignored/zeroed concentration field must fail this test.
    expect(responses[1]!.totalBiomass).toBeLessThan(
      responses[0]!.totalBiomass,
    )
    expect(responses[2]!.totalBiomass).toBeLessThan(
      responses[1]!.totalBiomass,
    )
    expect(responses[1]!.deathBiomass).toBeGreaterThan(
      responses[0]!.deathBiomass,
    )
    expect(responses[2]!.deathBiomass).toBeGreaterThan(
      responses[1]!.deathBiomass,
    )
  })

  it('preserves the monotone response when WT-MIC-derived exposure enters through the authoritative intervention command path', () => {
    const wtMic = requireWtMic()

    const responses = [0, wtMic, wtMic * 2].map((concentration, index) => {
      const plan = buildFlagshipComposedRunPlan(initialization)
      const engine = new ComposedSimulationEngine(plan.identity, plan.config)
      const before = engine.snapshot()
      const command = {
        id: `integrated-cipro-${index}`,
        type: 'apply-ciprofloxacin' as const,
        intervention: {
          schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
          concentrationMgPerL: concentration,
          concentrationUnit: 'mg/L' as const,
          blendMode: 'set' as const,
          geometry: { kind: 'global' as const },
        },
      }

      const applied = engine.execute(command)

      expect(applied.checkpoint.tick).toBe(before.checkpoint.tick)
      expect(applied.checkpoint.simulationTimeHours).toBe(
        before.checkpoint.simulationTimeHours,
      )
      expect(applied.checkpoint.commandCount).toBe(
        before.checkpoint.commandCount + 1,
      )
      expect(applied.events.at(-1)).toEqual({
        sequence: before.events.length,
        tick: before.checkpoint.tick,
        simulationTimeHours: before.checkpoint.simulationTimeHours,
        type: 'ciprofloxacin-applied',
        commandId: command.id,
        intervention: command.intervention,
      })

      const storedConcentration = Math.fround(concentration)
      for (let cell = 0; cell < plan.config.mask.length; cell += 1) {
        expect(
          applied.checkpoint.composedState.ciprofloxacinConcentrationMgPerL[
            cell
          ],
        ).toBe(plan.config.mask[cell] === 1 ? storedConcentration : 0)
      }

      const advanced = engine.execute({
        id: `integrated-cipro-advance-${index}`,
        type: 'advance',
        ticks: 1,
      })
      expect(advanced.checkpoint.tick).toBe(before.checkpoint.tick + 1)
      return advanced.checkpoint.metrics
    })

    expect(responses[1]!.totalBiomass).toBeLessThan(
      responses[0]!.totalBiomass,
    )
    expect(responses[2]!.totalBiomass).toBeLessThan(
      responses[1]!.totalBiomass,
    )
    expect(responses[1]!.deathBiomass).toBeGreaterThan(
      responses[0]!.deathBiomass,
    )
    expect(responses[2]!.deathBiomass).toBeGreaterThan(
      responses[1]!.deathBiomass,
    )
  })
})
