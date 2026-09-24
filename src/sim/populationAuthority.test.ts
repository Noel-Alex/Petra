import { describe, expect, it } from 'vitest'
import { sampleDivisionMutations } from './evolution/mutation'
import { resolveProductiveInfections } from './phage/infectionPolicy'
import { SimulationRng } from './rng'
import {
  CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
  FRACTIONAL_CARRY_POPULATION_POLICY,
  advanceDiscretePopulationAuthority,
  createDiscretePopulationAuthorityState,
  discretePopulationConfigurationIdentity,
  planDiscreteHostRemoval,
  restoreDiscretePopulationAuthorityState,
  type CellEquivalentCalibration,
  type DiscretePopulationAuthorityConfig,
} from './populationAuthority'

function calibration(
  overrides: Partial<CellEquivalentCalibration> = {},
): CellEquivalentCalibration {
  return {
    schemaVersion: CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
    id: 'fixture-biomass-cell-scale-v1',
    modelBiomassPerCellEquivalent: 2,
    provenance: {
      classification: 'calibrated',
      sourceKeys: ['fixture-source'],
      limitation: 'Test-only calibrated mapping.',
    },
    ...overrides,
  }
}

function config(
  overrides: Partial<DiscretePopulationAuthorityConfig> = {},
): DiscretePopulationAuthorityConfig {
  return {
    width: 2,
    height: 1,
    mask: [1, 1],
    lineageIds: ['L1'],
    calibration: calibration(),
    policy: FRACTIONAL_CARRY_POPULATION_POLICY,
    ...overrides,
  }
}

describe('shared discrete population authority', () => {
  it('decomposes standing biomass into integer hosts plus explicit residuals', () => {
    const state = createDiscretePopulationAuthorityState(
      config({ lineageIds: ['L1', 'L2'] }),
      [
        [5, 0],
        [1, 4],
      ],
    )

    expect(state.standingHostCounts).toEqual([
      [2, 0],
      [0, 2],
    ])
    expect(state.standingResidualCellEquivalents).toEqual([
      [0.5, 0],
      [0.5, 0],
    ])
    expect(state.divisionResidualCellEquivalents).toEqual([
      [0, 0],
      [0, 0],
    ])
  })

  it('returns zero biological opportunity for zero biomass and zero division flux', () => {
    const cfg = config()
    const initial = createDiscretePopulationAuthorityState(cfg, [[0, 0]])
    const result = advanceDiscretePopulationAuthority(initial, cfg, {
      currentLineageBiomass: [[0, 0]],
      divisionBiomass: [new Float64Array([0, 0])],
    })

    expect(result.totalStandingHosts).toBe(0)
    expect(result.totalDivisionOpportunities).toBe(0)
    expect(result.divisionOpportunities).toEqual([[0, 0]])
  })

  it('carries repeated fractional division flux without per-tick loss or double counting', () => {
    const cfg = config({ width: 1, mask: [1] })
    let biomass = 2
    let state = createDiscretePopulationAuthorityState(cfg, [[biomass]])
    let emitted = 0

    for (let step = 0; step < 8; step += 1) {
      biomass += 0.5
      const result = advanceDiscretePopulationAuthority(state, cfg, {
        currentLineageBiomass: [[biomass]],
        divisionBiomass: [new Float64Array([0.5])],
      })
      state = result.state
      emitted += result.totalDivisionOpportunities
    }

    expect(emitted).toBe(2)
    expect(state.divisionResidualCellEquivalents).toEqual([[0]])
    expect(state.standingHostCounts).toEqual([[3]])
  })

  it('preserves the cumulative division invariant over long repeated fractional steps', () => {
    const cfg = config({ width: 1, mask: [1] })
    let biomass = 2
    let state = createDiscretePopulationAuthorityState(cfg, [[biomass]])
    let emitted = 0

    for (let step = 0; step < 4_096; step += 1) {
      biomass += 0.125
      const result = advanceDiscretePopulationAuthority(state, cfg, {
        currentLineageBiomass: [[biomass]],
        divisionBiomass: [new Float64Array([0.125])],
      })
      state = result.state
      emitted += result.totalDivisionOpportunities
    }

    expect(emitted).toBe(256)
    expect(state.divisionResidualCellEquivalents).toEqual([[0]])
    expect(
      state.standingHostCounts[0]![0]! +
        state.standingResidualCellEquivalents[0]![0]!,
    ).toBe(biomass / cfg.calibration.modelBiomassPerCellEquivalent)
  })

  it('emits an exact integer opportunity at the calibrated boundary', () => {
    const cfg = config({ width: 1, mask: [1] })
    const initial = createDiscretePopulationAuthorityState(cfg, [[2]])
    const result = advanceDiscretePopulationAuthority(initial, cfg, {
      currentLineageBiomass: [[4]],
      divisionBiomass: [new Float64Array([2])],
    })

    expect(result.divisionOpportunities).toEqual([[1]])
    expect(result.state.divisionResidualCellEquivalents).toEqual([[0]])
    expect(result.state.standingHostCounts).toEqual([[2]])
  })

  it('moves standing authority with committed spatial biomass without inventing divisions', () => {
    const cfg = config()
    const initial = createDiscretePopulationAuthorityState(cfg, [[4, 0]])
    const moved = advanceDiscretePopulationAuthority(initial, cfg, {
      currentLineageBiomass: [[2, 2]],
      divisionBiomass: [new Float64Array([0, 0])],
    })

    expect(initial.standingHostCounts).toEqual([[2, 0]])
    expect(moved.state.standingHostCounts).toEqual([[1, 1]])
    expect(moved.totalStandingHosts).toBe(2)
    expect(moved.totalDivisionOpportunities).toBe(0)
  })

  it('replays the same future division opportunities after checkpoint restore', () => {
    const cfg = config({ width: 1, mask: [1] })
    const initial = createDiscretePopulationAuthorityState(cfg, [[2]])
    const first = advanceDiscretePopulationAuthority(initial, cfg, {
      currentLineageBiomass: [[2.5]],
      divisionBiomass: [new Float64Array([0.5])],
    })
    expect(first.totalDivisionOpportunities).toBe(0)
    expect(first.state.divisionResidualCellEquivalents).toEqual([[0.25]])

    const restored = restoreDiscretePopulationAuthorityState(
      first.state,
      cfg,
      [[2.5]],
    )
    const originalContinuation = advanceDiscretePopulationAuthority(
      first.state,
      cfg,
      {
        currentLineageBiomass: [[4]],
        divisionBiomass: [new Float64Array([1.5])],
      },
    )
    const restoredContinuation = advanceDiscretePopulationAuthority(
      restored,
      cfg,
      {
        currentLineageBiomass: [[4]],
        divisionBiomass: [new Float64Array([1.5])],
      },
    )

    expect(restoredContinuation).toEqual(originalContinuation)
    expect(restoredContinuation.divisionOpportunities).toEqual([[1]])
  })

  it('plans whole-host removal atomically and cannot remove one host twice', () => {
    const cfg = config({ width: 1, mask: [1] })
    const initial = createDiscretePopulationAuthorityState(cfg, [[5]])
    const removal = planDiscreteHostRemoval(initial, cfg, [[1]])

    expect(removal.totalRemovedHosts).toBe(1)
    expect(removal.modelBiomassToRemove).toEqual([[2]])
    expect(removal.state.standingHostCounts).toEqual([[1]])
    expect(removal.state.standingResidualCellEquivalents).toEqual([[0.5]])

    const committedBiomass = [[3]]
    expect(
      restoreDiscretePopulationAuthorityState(
        removal.state,
        cfg,
        committedBiomass,
      ),
    ).toEqual(removal.state)

    expect(() =>
      planDiscreteHostRemoval(removal.state, cfg, [[2]]),
    ).toThrow(/cannot exceed authoritative standing host count/)
  })

  it('restores valid typed-array checkpoint channels without requiring iterable state', () => {
    const cfg = config({ width: 1, mask: [1] })
    const state = createDiscretePopulationAuthorityState(cfg, [[5]])
    const serialized = {
      ...state,
      standingHostCounts: state.standingHostCounts.map((channel) =>
        Uint32Array.from(Array.from(channel)),
      ),
      standingResidualCellEquivalents:
        state.standingResidualCellEquivalents.map((channel) =>
          Float64Array.from(Array.from(channel)),
        ),
      divisionResidualCellEquivalents:
        state.divisionResidualCellEquivalents.map((channel) =>
          Float64Array.from(Array.from(channel)),
        ),
    }

    expect(
      restoreDiscretePopulationAuthorityState(serialized, cfg, [[5]]),
    ).toEqual(state)
  })

  it('fails restore closed on malformed residuals, biomass drift, and config mismatch', () => {
    const cfg = config({ width: 1, mask: [1] })
    const state = createDiscretePopulationAuthorityState(cfg, [[5]])

    const badResidual = structuredClone(state)
    ;(
      badResidual.standingResidualCellEquivalents as number[][]
    )[0]![0] = 1
    expect(() =>
      restoreDiscretePopulationAuthorityState(
        badResidual,
        cfg,
        [[5]],
      ),
    ).toThrow(/residuals/)

    expect(() =>
      restoreDiscretePopulationAuthorityState(state, cfg, [[7]]),
    ).toThrow(/does not match continuous biomass/)

    const changed = config({
      width: 1,
      mask: [1],
      calibration: calibration({
        id: 'other-calibration',
        modelBiomassPerCellEquivalent: 1,
      }),
    })
    expect(() =>
      restoreDiscretePopulationAuthorityState(state, changed, [[5]]),
    ).toThrow(/configuration identity mismatch/)
  })

  it('rejects sparse mask, lineage, and serialized channel containers', () => {
    const sparseMask = Array(1) as number[]
    expect(() =>
      createDiscretePopulationAuthorityState(
        config({ width: 1, mask: sparseMask }),
        [[2]],
      ),
    ).toThrow(/mask must be dense/)

    const sparseLineageIds = Array(1) as string[]
    expect(() =>
      createDiscretePopulationAuthorityState(
        config({ width: 1, mask: [1], lineageIds: sparseLineageIds }),
        [[2]],
      ),
    ).toThrow(/lineage ids must be dense/)

    const cfg = config({ width: 1, mask: [1] })
    const state = createDiscretePopulationAuthorityState(cfg, [[2]])
    const sparseCounts = {
      ...state,
      standingHostCounts: Array(1) as number[][],
    }
    expect(() =>
      restoreDiscretePopulationAuthorityState(sparseCounts, cfg, [[2]]),
    ).toThrow(/standing host counts channels must be dense/)
  })

  it('keeps masked cells outside both standing and division authority', () => {
    const cfg = config({ mask: [1, 0] })
    expect(() =>
      createDiscretePopulationAuthorityState(cfg, [[2, 1]]),
    ).toThrow(/zero outside population mask/)

    const state = createDiscretePopulationAuthorityState(cfg, [[2, 0]])
    expect(() =>
      advanceDiscretePopulationAuthority(state, cfg, {
        currentLineageBiomass: [[2, 0]],
        divisionBiomass: [new Float64Array([0, 1])],
      }),
    ).toThrow(/zero outside population mask/)
  })

  it('provides the exact integer seams required by mutation and phage infection', () => {
    const cfg = config({ width: 1, mask: [1] })
    const state = createDiscretePopulationAuthorityState(cfg, [[6]])
    const advanced = advanceDiscretePopulationAuthority(state, cfg, {
      currentLineageBiomass: [[10]],
      divisionBiomass: [new Float64Array([4])],
    })

    const mutationCounts = sampleDivisionMutations(
      advanced.divisionOpportunities[0]![0]!,
      [{ genotypeId: 'MUT', probabilityPerDivision: 1 }],
      new SimulationRng(7),
    )
    expect(mutationCounts).toEqual([{ genotypeId: 'MUT', count: 2 }])

    const infection = resolveProductiveInfections({
      adsorbedPfu: 5,
      susceptibleHostOpportunities:
        state.standingHostCounts[0]![0]!,
    })
    expect(infection.productiveInfections).toBe(3)
    expect(infection.nonProductiveAdsorptions).toBe(2)
  })

  it('binds calibration and discretization policy into replay configuration identity', () => {
    const first = config()
    const second = config({
      calibration: calibration({ id: 'fixture-biomass-cell-scale-v2' }),
    })

    expect(discretePopulationConfigurationIdentity(first)).not.toBe(
      discretePopulationConfigurationIdentity(second),
    )
  })
})
