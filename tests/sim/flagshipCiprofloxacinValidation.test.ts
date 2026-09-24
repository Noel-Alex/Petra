import { describe, expect, it } from 'vitest'

import {
  createComposedState,
  stepComposedState,
} from '../../src/sim/authoritative'
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

    expect(responses[1]!.totalBiomass).toBeLessThanOrEqual(
      responses[0]!.totalBiomass,
    )
    expect(responses[2]!.totalBiomass).toBeLessThanOrEqual(
      responses[1]!.totalBiomass,
    )
    expect(responses[1]!.deathBiomass).toBeGreaterThanOrEqual(
      responses[0]!.deathBiomass,
    )
    expect(responses[2]!.deathBiomass).toBeGreaterThanOrEqual(
      responses[1]!.deathBiomass,
    )
  })
})
