import { describe, expect, it } from 'vitest'

import runPresetData from '../../data/run_presets/ecoli_ciprofloxacin_baseline_v1.json'
import {
  buildDefaultFlagshipRun,
  parseFlagshipRunPreset,
} from './flagshipRunPreset'

describe('flagship engineering run preset', () => {
  it('resolves the repository preset against current composed authority', () => {
    const resolved = buildDefaultFlagshipRun()

    expect(resolved.preset.classification).toBe('engineering')
    expect(resolved.preset.version).toBe('1.1.0')
    expect(resolved.plan.identity.scenarioId).toBe(resolved.preset.scenarioId)
    expect(resolved.plan.identity.scenarioVersion).toBe(
      resolved.preset.scenarioVersion,
    )
    expect(resolved.plan.identity.parameterSetId).toBe(
      resolved.preset.parameterSetId,
    )
    expect(resolved.plan.identity.parameterSetVersion).toBe(
      resolved.preset.parameterSetVersion,
    )
    expect(resolved.plan.identity.seed).toBe(resolved.preset.seed)
    expect(resolved.plan.config.initialResource.some((value) => value > 0)).toBe(
      true,
    )
    expect(
      resolved.plan.config.initialLineageBiomass.some((channel) =>
        channel.some((value) => value > 0),
      ),
    ).toBe(true)
  })

  it('rejects unknown fields and non-engineering classification', () => {
    expect(() =>
      parseFlagshipRunPreset({
        ...runPresetData,
        unexpected: true,
      }),
    ).toThrow(/unknown field/)

    expect(() =>
      parseFlagshipRunPreset({
        ...runPresetData,
        classification: 'measured',
      }),
    ).toThrow(/classification must be "engineering"/)
  })

  it('rejects malformed run-state inputs before composition', () => {
    expect(() =>
      parseFlagshipRunPreset({
        ...runPresetData,
        seed: 4294967296,
      }),
    ).toThrow()

    expect(() =>
      parseFlagshipRunPreset({
        ...runPresetData,
        inocula: [
          {
            ...runPresetData.inocula[0],
            x: -1,
          },
        ],
      }),
    ).toThrow(/non-negative safe integer/)

    expect(() =>
      parseFlagshipRunPreset({
        ...runPresetData,
        inocula: [
          {
            ...runPresetData.inocula[0],
            biomass: 0,
          },
        ],
      }),
    ).toThrow(/positive and finite/)
  })
})
