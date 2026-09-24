import { describe, expect, it } from 'vitest'

import {
  createComposedState,
  stepComposedState,
} from '../../src/sim/authoritative'
import { ComposedSimulationEngine } from '../../src/sim/composedEngine'
import { CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION } from '../../src/sim/ciprofloxacinIntervention'
import { buildFlagshipComposedRunPlan } from '../../src/sim/flagshipComposition'

const initialization = {
  seed: 0x5eed1234,
  initialResourceLevel: 8,
  inocula: [{ lineageId: 'founder-wt', x: 80, y: 80, biomass: 1 }],
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

  it('changes the integrated response monotonically across WT-MIC-derived concentrations', () => {
    const plan = buildFlagshipComposedRunPlan(initialization)
    const wtMic = plan.config.ciprofloxacin?.genotypeMicMgPerL.find(
      (entry) => entry.genotypeId === 'WT',
    )?.micMgPerL
    expect(wtMic).toBeDefined()

    const responses = [0, wtMic!, wtMic! * 2].map((concentration) => {
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
  it('preserves the strict concentration response through the authoritative intervention command path', () => {
    const plan = buildFlagshipComposedRunPlan(initialization)
    const ciprofloxacin = plan.config.ciprofloxacin
    if (ciprofloxacin === null) {
      throw new Error('flagship validation requires ciprofloxacin authority')
    }
    const wtMic = ciprofloxacin.genotypeMicMgPerL.find(
      (entry) => entry.genotypeId === 'WT',
    )?.micMgPerL
    if (wtMic === undefined) {
      throw new Error('flagship validation requires the scenario WT MIC')
    }

    expect(ciprofloxacin.concentrationUnit).toBe('mg/L')
    expect(plan.identity.seed).toBe(initialization.seed)
    expect(plan.identity.scenarioId).toBe(plan.config.evolutionScenario.scenarioId)
    expect(plan.identity.scenarioVersion).toBe(
      plan.config.evolutionScenario.scenarioVersion,
    )

    const responses = [0, wtMic, wtMic * 2].map((concentration, index) => {
      const engine = new ComposedSimulationEngine(plan.identity, plan.config)
      const before = engine.snapshot()
      const command = {
        id: `validation-ciprofloxacin-${index}`,
        type: 'apply-ciprofloxacin' as const,
        intervention: {
          schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
          concentrationMgPerL: concentration,
          concentrationUnit: ciprofloxacin.concentrationUnit,
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
      expect(applied.events.at(-1)).toMatchObject({
        type: 'ciprofloxacin-applied',
        commandId: command.id,
        intervention: command.intervention,
      })

      const insideIndex = applied.checkpoint.composedState.mask.findIndex(
        (inside) => inside === 1,
      )
      const outsideIndex = applied.checkpoint.composedState.mask.findIndex(
        (inside) => inside === 0,
      )
      expect(insideIndex).toBeGreaterThanOrEqual(0)
      expect(
        applied.checkpoint.composedState.ciprofloxacinConcentrationMgPerL[
          insideIndex
        ],
      ).toBe(Math.fround(concentration))
      if (outsideIndex >= 0) {
        expect(
          applied.checkpoint.composedState.ciprofloxacinConcentrationMgPerL[
            outsideIndex
          ],
        ).toBe(0)
      }

      return engine.execute({
        id: `validation-advance-${index}`,
        type: 'advance',
        ticks: 1,
      }).checkpoint.metrics
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
