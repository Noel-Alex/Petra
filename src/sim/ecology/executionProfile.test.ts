import { describe, expect, it } from 'vitest'

import flagshipScenario from '../../../data/presets/ecoli_ciprofloxacin_v1.json'
import { stepEcology, type EcologyState } from './growth'
import {
  ecologyExecutionProfileIdentity,
  parseEcologyExecutionProfile,
  projectEcologyExecutionProfile,
  REQUIRED_ECOLOGY_EXECUTION_TARGETS,
} from './executionProfile'

function oneLineageState(
  width: number,
  resource: readonly number[],
  biomass: readonly number[],
): EcologyState {
  return {
    width,
    height: 1,
    mask: new Uint8Array(width).fill(1),
    resource: Float32Array.from(resource),
    lineages: [Float32Array.from(biomass)],
  }
}

const lineageParameters = [
  { relativeFitness: 1, deathHazardPerTime: 0 },
] as const

describe('flagship engineering ecology execution profile', () => {
  it('strictly parses the selected model-unit profile and binds it to scenario/resource identity', () => {
    const profile = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )

    expect(profile.scenarioId).toBe(flagshipScenario.id)
    expect(profile.scenarioVersion).toBe(flagshipScenario.version)
    expect(profile.resourceContextVersion).toBe(
      flagshipScenario.environment.resourceContext.version,
    )
    expect(profile.classification).toBe('engineering')
    expect(profile.units).toEqual({
      time: 'hour',
      resource: 'model-resource',
      biomass: 'model-biomass',
    })
    expect(profile.behaviorTargets).toEqual(
      REQUIRED_ECOLOGY_EXECUTION_TARGETS,
    )
    expect(profile.provenance.limitation).toContain(
      'Science-Mode physical growth parameters remain UNBOUND',
    )
  })

  it('has deterministic identity and projects only explicit kernel inputs', () => {
    const first = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const second = parseEcologyExecutionProfile(
      structuredClone(flagshipScenario.executionProfile),
    )
    expect(ecologyExecutionProfileIdentity(first)).toBe(
      ecologyExecutionProfileIdentity(second),
    )

    const projection = projectEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    expect(projection).toMatchObject({
      profileId: 'ecoli-ciprofloxacin-ecology-engineering',
      profileVersion: '1.0.0',
      scenarioId: flagshipScenario.id,
      scenarioVersion: flagshipScenario.version,
      resourceContextVersion:
        flagshipScenario.environment.resourceContext.version,
      hoursPerTick: 0.02,
      growth: {
        maxDivisionRate: 0.8,
        halfSaturation: 1,
        biomassYield: 1,
        localCapacity: 32,
        spreadRate: 0.05,
      },
    })
  })

  it('changes execution identity when versioned engineering authority changes', () => {
    const baseline = parseEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const changed = parseEcologyExecutionProfile({
      ...flagshipScenario.executionProfile,
      version: '1.0.1',
      growth: {
        ...flagshipScenario.executionProfile.growth,
        localCapacity:
          flagshipScenario.executionProfile.growth.localCapacity + 1,
      },
    })

    expect(ecologyExecutionProfileIdentity(changed)).not.toBe(
      ecologyExecutionProfileIdentity(baseline),
    )
  })

  it('fails closed on physical-unit relabeling, unknown fields, and unstable spread stepping', () => {
    expect(() =>
      parseEcologyExecutionProfile({
        ...flagshipScenario.executionProfile,
        units: {
          ...flagshipScenario.executionProfile.units,
          resource: 'mg/L',
        },
      }),
    ).toThrow(/hour\/model-resource\/model-biomass/)

    expect(() =>
      parseEcologyExecutionProfile({
        ...flagshipScenario.executionProfile,
        hiddenFallback: 7,
      }),
    ).toThrow(/unknown field/)

    expect(() =>
      parseEcologyExecutionProfile({
        ...flagshipScenario.executionProfile,
        hoursPerTick: 1,
        growth: {
          ...flagshipScenario.executionProfile.growth,
          spreadRate: 0.3,
        },
      }),
    ).toThrow(/spreadRate \* hoursPerTick/)
  })

  it('meets the declared positive-growth and resource-depletion targets in model units', () => {
    const { growth, hoursPerTick } = projectEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const state = oneLineageState(1, [8], [1])

    for (let step = 0; step < 50; step += 1) {
      stepEcology(state, growth, lineageParameters, hoursPerTick)
    }

    expect(state.lineages[0]![0]).toBeGreaterThan(1)
    expect(state.lineages[0]![0]).toBeLessThan(growth.localCapacity)
    expect(state.resource[0]).toBeLessThan(8)
    expect(state.resource[0]).toBeGreaterThanOrEqual(0)
  })

  it('meets zero-resource and capacity bounds without hidden growth', () => {
    const { growth, hoursPerTick } = projectEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )

    const zeroResource = oneLineageState(1, [0], [1])
    const zeroResult = stepEcology(
      zeroResource,
      growth,
      lineageParameters,
      hoursPerTick,
    )
    expect(zeroResource.lineages[0]![0]).toBe(1)
    expect(zeroResult.metrics.divisionBiomass).toBe(0)

    const atCapacity = oneLineageState(
      1,
      [100],
      [growth.localCapacity],
    )
    const capacityResult = stepEcology(
      atCapacity,
      growth,
      lineageParameters,
      hoursPerTick,
    )
    expect(atCapacity.lineages[0]![0]).toBe(growth.localCapacity)
    expect(atCapacity.resource[0]).toBe(100)
    expect(capacityResult.metrics.divisionBiomass).toBe(0)
  })

  it('meets conservative neighbour-spread behavior in model biomass units', () => {
    const { growth, hoursPerTick } = projectEcologyExecutionProfile(
      flagshipScenario.executionProfile,
    )
    const state = oneLineageState(2, [0, 0], [1, 0])

    stepEcology(state, growth, lineageParameters, hoursPerTick)

    const left = state.lineages[0]![0]!
    const right = state.lineages[0]![1]!
    expect(left).toBeLessThan(1)
    expect(right).toBeGreaterThan(0)
    expect(left + right).toBeCloseTo(1, 6)
  })
})
