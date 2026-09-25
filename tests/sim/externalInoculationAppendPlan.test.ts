import { describe, expect, it } from 'vitest'

import {
  createComposedState,
  type ComposedSimulationState,
} from '../../src/sim/authoritative'
import {
  EXTERNAL_INOCULATION_APPEND_PLAN_SCHEMA_VERSION,
  planExternalInoculationAppend,
} from '../../src/sim/externalInoculationAppendPlan'
import {
  EXTERNAL_INOCULATION_AUTHORITY_REFERENCE_SCHEMA_VERSION,
  EXTERNAL_INOCULATION_INTERVENTION_SCHEMA_VERSION,
  type ExternalInoculationIntervention,
} from '../../src/sim/externalInoculationIntervention'
import { buildTwoBacteriumSharedResourceRunPlan } from '../../src/sim/twoBacteriumComposition'

function mixedPlan() {
  return buildTwoBacteriumSharedResourceRunPlan({
    seed: 20260925,
    initialResourceLevel: 1,
    inocula: [
      { lineageId: 'ecoli-founder', x: 76, y: 80, biomass: 1 },
      { lineageId: 'bsubtilis-founder', x: 84, y: 80, biomass: 1 },
    ],
  })
}

function bacillusIntervention(): ExternalInoculationIntervention {
  const plan = mixedPlan()
  const binding = plan.identity.parameterSetBinding
  if (binding === undefined) {
    throw new Error('two-bacterium plan must expose provenance binding')
  }

  return {
    schemaVersion: EXTERNAL_INOCULATION_INTERVENTION_SCHEMA_VERSION,
    authority: {
      schemaVersion:
        EXTERNAL_INOCULATION_AUTHORITY_REFERENCE_SCHEMA_VERSION,
      scenarioId: plan.identity.scenarioId,
      scenarioVersion: plan.identity.scenarioVersion,
      parameterSetBinding: binding,
      lineageDefinitionId: 'bsubtilis-founder',
      genotypeId: 'bsubtilis-static',
      taxonId: 'bsubtilis-168-trp-plus-sige-minus',
      taxonContentVersion: 'tannler-2008-growth-context-v1',
    },
    placement: {
      kind: 'grid-cell',
      x: 80,
      y: 80,
    },
    biomass: {
      value: 0.5,
      unit: 'model-biomass',
    },
  }
}

function setup() {
  const plan = mixedPlan()
  const state = createComposedState(plan.config)
  return {
    runPlan: plan,
    state,
    intervention: bacillusIntervention(),
  }
}

describe('external inoculation atomic append planning', () => {
  it('prepares one exact detached external-root channel without mutating live v1 state', () => {
    const { runPlan, state, intervention } = setup()
    const before = structuredClone(state)

    const planned = planExternalInoculationAppend({
      identity: runPlan.identity,
      config: runPlan.config,
      state,
      intervention,
      createdAtHours: 1.25,
    })

    expect(planned.schemaVersion).toBe(
      EXTERNAL_INOCULATION_APPEND_PLAN_SCHEMA_VERSION,
    )
    expect(planned).toMatchObject({
      lineageId: 'L3',
      lineageChannelIndex: 2,
      genotypeId: 'bsubtilis-static',
      taxonId: 'bsubtilis-168-trp-plus-sige-minus',
      taxonContentVersion: 'tannler-2008-growth-context-v1',
      createdAtHours: 1.25,
      baselineGrowthAuthority: {
        sourceLineageDefinitionId: 'bsubtilis-founder',
        explicitScale: 0.67 / 0.69,
      },
      deathHazardPerHour: 0,
      biomass: {
        unit: 'model-biomass',
        value: 0.5,
      },
    })

    expect(
      planned.lineageOriginCheckpoint.records.map((record) => [
        record.lineageId,
        record.originKind,
      ]),
    ).toEqual([
      ['L1', 'configured-founder'],
      ['L2', 'configured-founder'],
      ['L3', 'external-inoculation'],
    ])
    expect(
      planned.lineageOriginCheckpoint.records[2],
    ).toMatchObject({
      parentLineageId: null,
      genotypeId: 'bsubtilis-static',
      createdAtHours: 1.25,
      mutationClass: null,
    })
    expect(planned.lineageTaxonMap.lineageIds).toEqual(['L1', 'L2', 'L3'])
    expect(planned.lineageTaxonMap.taxonIds[2]).toBe(
      'bsubtilis-168-trp-plus-sige-minus',
    )
    expect(planned.lineageTaxonMap.taxonContentVersions[2]).toBe(
      'tannler-2008-growth-context-v1',
    )

    const nonZeroCells = planned.biomass.channel
      .map((value, index) => ({ value, index }))
      .filter(({ value }) => value !== 0)
    expect(nonZeroCells).toEqual([
      {
        value: 0.5,
        index: 80 * state.width + 80,
      },
    ])
    expect(planned.originCellIndex).toBe(80 * state.width + 80)

    expect(state).toEqual(before)
    expect(state.lineageRegistry.version).toBe(1)
    expect(Object.isFrozen(planned)).toBe(true)
    expect(Object.isFrozen(planned.biomass.channel)).toBe(true)
  })

  it('fails closed before planning when current composed channels are misaligned', () => {
    const { runPlan, state, intervention } = setup()
    const malformed: ComposedSimulationState = {
      ...state,
      lineageBiomass: state.lineageBiomass.slice(0, -1),
    }

    expect(() =>
      planExternalInoculationAppend({
        identity: runPlan.identity,
        config: runPlan.config,
        state: malformed,
        intervention,
        createdAtHours: 1,
      }),
    ).toThrow(/channels must stay aligned/)
  })

  it('refuses renderer-like or off-mask placement and leaves current state untouched', () => {
    const { runPlan, state, intervention } = setup()
    const before = structuredClone(state)

    expect(() =>
      planExternalInoculationAppend({
        identity: runPlan.identity,
        config: runPlan.config,
        state,
        intervention: {
          ...intervention,
          placement: { kind: 'grid-cell', x: 0, y: 0 },
        },
        createdAtHours: 1,
      }),
    ).toThrow(/inside the dish mask/)

    expect(state).toEqual(before)
  })

  it('requires an exact non-negative biological time for the prospective origin event', () => {
    const { runPlan, state, intervention } = setup()

    expect(() =>
      planExternalInoculationAppend({
        identity: runPlan.identity,
        config: runPlan.config,
        state,
        intervention,
        createdAtHours: Number.NaN,
      }),
    ).toThrow(/creation time must be finite and non-negative/)
  })

  it('keeps source definition identity attached to baseline growth authority', () => {
    const { runPlan, state, intervention } = setup()
    const planned = planExternalInoculationAppend({
      identity: runPlan.identity,
      config: runPlan.config,
      state,
      intervention,
      createdAtHours: 0,
    })

    expect(planned.baselineGrowthAuthority).toEqual({
      sourceLineageDefinitionId: 'bsubtilis-founder',
      explicitScale: 0.67 / 0.69,
    })
    expect(planned.admission.lineageDefinition.id).toBe(
      'bsubtilis-founder',
    )
  })
})
