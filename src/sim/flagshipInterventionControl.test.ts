import { describe, expect, it } from 'vitest'

import {
  FLAGSHIP_CIPROFLOXACIN_CONTROL_SCHEMA_VERSION,
  projectFlagshipCiprofloxacinControl,
} from './flagshipInterventionControl'

const metadata = {
  schemaVersion: FLAGSHIP_CIPROFLOXACIN_CONTROL_SCHEMA_VERSION,
  tool: 'antibiotic',
  protocolCommand: 'apply-ciprofloxacin',
  parameter: {
    key: 'ciprofloxacin-concentration',
    label: 'Ciprofloxacin concentration',
    unit: 'mg/L',
    minimum: 0,
    maximum: 2,
    defaultValue: 0,
    precision: 3,
  },
  supportedGeometries: ['global', 'radial', 'stripe', 'paint'],
  blendMode: 'set',
  provenance: {
    classification: 'transferred',
    citation: 'regoes_2004',
    context: 'Escherichia coli CAB1 (O18:K1:H7), LB, 37 C',
    sourceTestedRangeMgPerL: {
      minimum: 0,
      maximum: 2,
    },
    defaultClassification: 'engineering',
    defaultRationale:
      '0 mg/L is the exact neutral initial flagship state, not an effective dose.',
    transferNote:
      'The CAB1 source domain is used as a conservative MG1655 product guardrail.',
    limitation:
      'This is a model concentration-field edit, not physical delivery or clinical guidance.',
  },
} as const

describe('flagship ciprofloxacin intervention control', () => {
  it('projects the exact source-domain guardrail separately from provenance', () => {
    const projected = projectFlagshipCiprofloxacinControl(metadata)

    expect(projected.toolAuthority).toEqual({
      schemaVersion: 1,
      tool: 'antibiotic',
      protocolCommand: 'apply-ciprofloxacin',
      parameter: {
        key: 'ciprofloxacin-concentration',
        label: 'Ciprofloxacin concentration',
        unit: 'mg/L',
        minimum: 0,
        maximum: 2,
        defaultValue: 0,
        precision: 3,
      },
      supportedGeometries: ['global', 'radial', 'stripe', 'paint'],
      blendMode: 'set',
    })
    expect(projected.provenance).toMatchObject({
      classification: 'transferred',
      citation: 'regoes_2004',
      sourceTestedRangeMgPerL: { minimum: 0, maximum: 2 },
      defaultClassification: 'engineering',
    })
  })

  it('refuses a product range that drifts outside the declared source-tested range', () => {
    expect(() =>
      projectFlagshipCiprofloxacinControl({
        ...metadata,
        parameter: {
          ...metadata.parameter,
          maximum: 32,
        },
      }),
    ).toThrow(/bounds must exactly match the declared source-tested range/)
  })

  it('refuses malformed defaults, unsupported geometry, and unknown metadata', () => {
    expect(() =>
      projectFlagshipCiprofloxacinControl({
        ...metadata,
        parameter: {
          ...metadata.parameter,
          defaultValue: 3,
        },
      }),
    ).toThrow(/default must lie within bounds/)

    expect(() =>
      projectFlagshipCiprofloxacinControl({
        ...metadata,
        supportedGeometries: ['global', 'point'],
      }),
    ).toThrow(/supportedGeometries\[1\] is unsupported/)

    expect(() =>
      projectFlagshipCiprofloxacinControl({
        ...metadata,
        undocumented: true,
      }),
    ).toThrow(/unknown field "undocumented"/)
  })

  it('requires the neutral default to remain explicitly engineering-classified', () => {
    expect(() =>
      projectFlagshipCiprofloxacinControl({
        ...metadata,
        provenance: {
          ...metadata.provenance,
          defaultClassification: 'measured',
        },
      }),
    ).toThrow(/default must be classified as engineering/)
  })
})
