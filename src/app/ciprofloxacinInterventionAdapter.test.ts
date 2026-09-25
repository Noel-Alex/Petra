import { describe, expect, it } from 'vitest'

import {
  CIPROFLOXACIN_INTENT_ADAPTER_SCHEMA_VERSION,
  planCiprofloxacinInterventionCommand,
  type CiprofloxacinIntentAuthority,
} from './ciprofloxacinInterventionAdapter'
import type { InterventionCommitIntent } from '../ui/interventionPreview'

const authority: CiprofloxacinIntentAuthority = {
  schemaVersion: CIPROFLOXACIN_INTENT_ADAPTER_SCHEMA_VERSION,
  concentrationParameterKey: 'concentration',
  concentrationUnit: 'mg/L',
  minimumMgPerL: 0,
  maximumMgPerL: 2,
  blendMode: 'set',
}

function intent(
  overrides: Partial<InterventionCommitIntent> = {},
): InterventionCommitIntent {
  return {
    type: 'apply-intervention',
    intentId: 'dose-1',
    tool: 'antibiotic',
    geometry: {
      kind: 'radial',
      center: { x: 0.25, y: 0.75 },
      radiusFraction: 0.2,
    },
    parameters: [{ key: 'concentration', value: 0.125, unit: 'mg/L' }],
    ...overrides,
  }
}

describe('protocol-v6 ciprofloxacin intent adapter', () => {
  it('preserves authoritative concentration and radial geometry in one typed command', () => {
    expect(planCiprofloxacinInterventionCommand(intent(), authority)).toEqual({
      id: 'dose-1',
      type: 'apply-ciprofloxacin',
      intervention: {
        schemaVersion: 1,
        concentrationMgPerL: 0.125,
        concentrationUnit: 'mg/L',
        blendMode: 'set',
        geometry: {
          kind: 'radial',
          center: { x: 0.25, y: 0.75 },
          radiusFraction: 0.2,
        },
      },
    })
  })

  it('uses explicit caller-supplied add semantics rather than inventing a default', () => {
    const command = planCiprofloxacinInterventionCommand(intent(), {
      ...authority,
      blendMode: 'add',
    })

    expect(command.intervention.blendMode).toBe('add')
  })

  it.each([
    [{ kind: 'global' } as const, { kind: 'global' } as const],
    [
      {
        kind: 'stripe',
        axis: 'x',
        centerFraction: 0.4,
        widthFraction: 0.2,
      } as const,
      {
        kind: 'stripe',
        axis: 'x',
        centerFraction: 0.4,
        widthFraction: 0.2,
      } as const,
    ],
    [
      {
        kind: 'paint',
        samples: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
        ],
        brushRadiusFraction: 0.05,
      } as const,
      {
        kind: 'paint',
        samples: [
          { x: 0.1, y: 0.2 },
          { x: 0.3, y: 0.4 },
        ],
        brushRadiusFraction: 0.05,
      } as const,
    ],
  ])('preserves supported preview geometry %#', (geometry, expected) => {
    const command = planCiprofloxacinInterventionCommand(
      intent({ geometry }),
      authority,
    )
    expect(command.intervention.geometry).toEqual(expected)
  })

  it('refuses preview-only point geometry instead of inventing a dose radius', () => {
    expect(() =>
      planCiprofloxacinInterventionCommand(
        intent({
          geometry: { kind: 'point', point: { x: 0.5, y: 0.5 } },
        }),
        authority,
      ),
    ).toThrow(/point geometry is preview-only/)
  })

  it('refuses unsupported tools instead of substituting ciprofloxacin authority', () => {
    expect(() =>
      planCiprofloxacinInterventionCommand(
        intent({ tool: 'nutrient' }),
        authority,
      ),
    ).toThrow(/only antibiotic intents/)
  })

  it('refuses missing, extra, wrong-key, and wrong-unit parameters', () => {
    expect(() =>
      planCiprofloxacinInterventionCommand(
        intent({ parameters: [] }),
        authority,
      ),
    ).toThrow(/exactly one authoritative parameter/)

    expect(() =>
      planCiprofloxacinInterventionCommand(
        intent({
          parameters: [
            { key: 'concentration', value: 0.125, unit: 'mg/L' },
            { key: 'extra', value: 1, unit: 'model-unit' },
          ],
        }),
        authority,
      ),
    ).toThrow(/exactly one authoritative parameter/)

    expect(() =>
      planCiprofloxacinInterventionCommand(
        intent({
          parameters: [{ key: 'dose', value: 0.125, unit: 'mg/L' }],
        }),
        authority,
      ),
    ).toThrow(/key does not match authority/)

    expect(() =>
      planCiprofloxacinInterventionCommand(
        intent({
          parameters: [{ key: 'concentration', value: 0.125, unit: 'ug/mL' }],
        }),
        authority,
      ),
    ).toThrow(/unit does not match authority/)
  })

  it('revalidates authoritative bounds at dispatch planning time', () => {
    expect(() =>
      planCiprofloxacinInterventionCommand(
        intent({
          parameters: [{ key: 'concentration', value: 2.1, unit: 'mg/L' }],
        }),
        authority,
      ),
    ).toThrow(/outside authoritative intervention bounds/)
  })

  it('fails closed on malformed authority metadata', () => {
    expect(() =>
      planCiprofloxacinInterventionCommand(intent(), {
        ...authority,
        minimumMgPerL: 3,
        maximumMgPerL: 2,
      }),
    ).toThrow(/minimum cannot exceed maximum/)

    expect(() =>
      planCiprofloxacinInterventionCommand(intent(), {
        ...authority,
        concentrationParameterKey: ' concentration ',
      }),
    ).toThrow(/canonical non-empty string/)
  })
})
