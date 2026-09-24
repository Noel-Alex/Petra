import { describe, expect, it } from 'vitest'
import { createComposedState, type ComposedSimulationConfig } from '../../src/sim/authoritative'
import type { CuratedMutationGraph } from '../../src/sim/evolution/graph'
import { inspectAuthoritativeRegion, selectedRegionCellIndices } from '../../src/sim/regionInspector'

const evolutionGraph: CuratedMutationGraph = {
  scenarioId: 'region-test',
  scenarioVersion: '1',
  genotypes: [
    { id: 'WT', relativeFitness: 1, sourceOrder: 0 },
    { id: 'VAR', relativeFitness: 1, sourceOrder: 1 },
  ],
  transitions: [],
}

const config: ComposedSimulationConfig = {
  width: 3,
  height: 2,
  mask: [1, 1, 1, 1, 0, 1],
  initialResource: [1, 2, 3, 4, 0, 6],
  initialLineageBiomass: [
    [1, 2, 3, 4, 0, 6],
    [6, 5, 4, 3, 0, 1],
  ],
  growth: {
    maxDivisionRate: 1,
    halfSaturation: 1,
    biomassYield: 1,
    localCapacity: 100,
    spreadRate: 0,
  },
  evolutionGraph,
  evolutionScenario: { scenarioId: 'region-test', scenarioVersion: '1' },
  lineages: [
    { id: 'ancestor', genotypeId: 'WT', deathHazardPerHour: 0 },
    { id: 'variant', genotypeId: 'VAR', deathHazardPerHour: 0 },
  ],
  hoursPerTick: 0.01,
}

describe('authoritative region inspector', () => {
  it('uses cell-centred normalized coordinates and respects the simulation mask', () => {
    const state = createComposedState(config)
    expect(selectedRegionCellIndices(state, {
      id: 'center',
      centerX: 0.5,
      centerY: 0.5,
      radius: 0.3,
    })).toEqual([1])

    // Cell 4 is geometrically closest to the centre but masked out, so it is
    // never included even when the radius grows to contain both centre cells.
    expect(selectedRegionCellIndices(state, {
      id: 'masked-center',
      centerX: 0.5,
      centerY: 0.75,
      radius: 0.2,
    })).toEqual([])
  })

  it('aggregates only authoritative state and preserves explicit abstract units', () => {
    const state = createComposedState(config)
    const inspection = inspectAuthoritativeRegion(state, {
      id: 'upper-row',
      centerX: 0.5,
      centerY: 0.25,
      radius: 0.4,
    })

    if (inspection.kind !== 'measured') {
      throw new Error('expected a measured authoritative region inspection')
    }
    expect(inspection.selectedCellCount).toBe(3)
    expect(inspection.totalResource).toBe(6)
    expect(inspection.totalBiomass).toBe(21)
    expect(inspection.lineageBiomass).toEqual([
      {
        lineageId: 'ancestor',
        genotypeId: 'WT',
        biomass: 6,
        fractionOfRegionBiomass: 6 / 21,
      },
      {
        lineageId: 'variant',
        genotypeId: 'VAR',
        biomass: 15,
        fractionOfRegionBiomass: 15 / 21,
      },
    ])
    expect(inspection.biomassUnit).toBe('model-biomass')
    expect(inspection.resourceUnit).toBe('model-resource')
    expect(inspection.configurationFingerprint).toBe(state.configurationFingerprint)
  })

  it('keeps masked cells outside whole-grid scientific readout', () => {
    const state = createComposedState(config)
    // Deliberately corrupt only the masked cell after valid state creation.
    // The simulator rejects this state if stepped; the read-only inspector must
    // still exclude masked cells rather than exposing sentinel values.
    state.resource[4] = 99
    state.lineageBiomass[0]![4] = 99
    state.lineageBiomass[1]![4] = 99

    const inspection = inspectAuthoritativeRegion(state, {
      id: 'whole-grid',
      centerX: 0.5,
      centerY: 0.5,
      radius: 1,
    })
    if (inspection.kind !== 'measured') {
      throw new Error('expected a measured whole-grid inspection')
    }
    expect(inspection.selectedCellCount).toBe(5)
    expect(inspection.totalResource).toBe(16)
    expect(inspection.totalBiomass).toBe(35)
  })

  it('returns an explicit no-grid-coverage outcome instead of measured zeroes', () => {
    const state = createComposedState(config)
    const inspection = inspectAuthoritativeRegion(state, {
      id: 'masked-center',
      centerX: 0.5,
      centerY: 0.75,
      radius: 0.2,
    })

    expect(inspection).toEqual({
      kind: 'no-grid-coverage',
      selectionId: 'masked-center',
      stateVersion: state.version,
      configurationFingerprint: state.configurationFingerprint,
    })
    expect('selectedCellCount' in inspection).toBe(false)
    expect('totalBiomass' in inspection).toBe(false)
    expect('totalResource' in inspection).toBe(false)
  })

  it('preserves a real measured zero when at least one authoritative grid cell is covered', () => {
    const state = createComposedState({
      ...config,
      initialResource: [0, 2, 3, 4, 0, 6],
      initialLineageBiomass: [
        [0, 2, 3, 4, 0, 6],
        [0, 5, 4, 3, 0, 1],
      ],
    })
    const inspection = inspectAuthoritativeRegion(state, {
      id: 'covered-zero',
      centerX: 1 / 6,
      centerY: 0.25,
      radius: 0.05,
    })

    if (inspection.kind !== 'measured') {
      throw new Error('expected covered zero region to remain a measurement')
    }
    expect(inspection.selectedCellCount).toBe(1)
    expect(inspection.totalResource).toBe(0)
    expect(inspection.totalBiomass).toBe(0)
    expect(inspection.lineageBiomass).toEqual([
      {
        lineageId: 'ancestor',
        genotypeId: 'WT',
        biomass: 0,
        fractionOfRegionBiomass: 0,
      },
      {
        lineageId: 'variant',
        genotypeId: 'VAR',
        biomass: 0,
        fractionOfRegionBiomass: 0,
      },
    ])
  })

  it('fails closed when authoritative lineage and genotype identities are misaligned', () => {
    const state = createComposedState(config)
    state.genotypeIds.pop()

    expect(() =>
      inspectAuthoritativeRegion(state, {
        id: 'whole-grid',
        centerX: 0.5,
        centerY: 0.5,
        radius: 1,
      }),
    ).toThrow(/lineage ids, genotype ids, and channels must align/)
  })

  it('rejects invalid selection geometry rather than clamping or inventing it', () => {
    const state = createComposedState(config)
    expect(() => selectedRegionCellIndices(state, {
      id: 'bad', centerX: -0.01, centerY: 0.5, radius: 0.1,
    })).toThrow(/centerX/)
    expect(() => selectedRegionCellIndices(state, {
      id: 'bad', centerX: 0.5, centerY: 0.5, radius: 0,
    })).toThrow(/radius/)
  })
})
