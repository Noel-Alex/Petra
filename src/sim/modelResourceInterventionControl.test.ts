import { describe, expect, it } from 'vitest'

import {
  MODEL_RESOURCE_CONTROL_SCHEMA_VERSION,
  projectModelResourceInterventionControl,
  resolveBundledFlagshipModelResourceControl,
} from './modelResourceInterventionControl'

const fixtureMetadata = {
  schemaVersion: MODEL_RESOURCE_CONTROL_SCHEMA_VERSION,
  tool: 'resource',
  protocolCommand: 'apply-model-resource',
  resourceContextVersion: 'fixture-model-resource-v1',
  parameter: {
    key: 'limiting-resource',
    label: 'Limiting resource',
    unit: 'model-resource',
    minimum: 0,
    maximum: 16,
    defaultValue: 8,
    precision: 2,
  },
  supportedGeometries: ['global', 'radial', 'stripe', 'paint'],
  supportedBlendModes: ['set', 'add'],
  provenance: {
    classification: 'engineering',
    physicalBindingStatus: 'unbound',
    context: 'Fixture-only model-resource command guardrail.',
    limitation:
      'Fixture metadata is not a physical substrate concentration or bundled-product authority.',
  },
} as const

describe('model-resource intervention control metadata', () => {
  it('projects exact fixture-only model-unit command guardrails', () => {
    expect(
      projectModelResourceInterventionControl(
        fixtureMetadata,
        'fixture-model-resource-v1',
      ),
    ).toEqual({
      toolAuthority: {
        schemaVersion: 1,
        tool: 'resource',
        protocolCommand: 'apply-model-resource',
        resourceContextVersion: 'fixture-model-resource-v1',
        parameter: {
          key: 'limiting-resource',
          label: 'Limiting resource',
          unit: 'model-resource',
          minimum: 0,
          maximum: 16,
          defaultValue: 8,
          precision: 2,
        },
        supportedGeometries: ['global', 'radial', 'stripe', 'paint'],
        supportedBlendModes: ['set', 'add'],
      },
      provenance: {
        classification: 'engineering',
        physicalBindingStatus: 'unbound',
        context: 'Fixture-only model-resource command guardrail.',
        limitation:
          'Fixture metadata is not a physical substrate concentration or bundled-product authority.',
      },
    })
  })

  it('requires exact model-resource units and exact resource-context identity', () => {
    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          parameter: { ...fixtureMetadata.parameter, unit: 'g/L' },
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/unit must be model-resource/)

    expect(() =>
      projectModelResourceInterventionControl(
        fixtureMetadata,
        'another-resource-context',
      ),
    ).toThrow(/resource context version mismatch/)
  })

  it('refuses invalid bounds/defaults and values outside Float32 field storage', () => {
    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          parameter: {
            ...fixtureMetadata.parameter,
            minimum: 20,
            maximum: 16,
          },
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/minimum cannot exceed maximum/)

    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          parameter: {
            ...fixtureMetadata.parameter,
            defaultValue: 17,
          },
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/default must lie within bounds/)

    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          parameter: {
            ...fixtureMetadata.parameter,
            maximum: Number.MAX_VALUE,
          },
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/finite Float32 field storage/)
  })

  it('requires explicit supported geometry/blend subsets without aliases or duplicates', () => {
    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          supportedGeometries: ['global', 'point'],
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/supportedGeometries\[1\] is unsupported/)

    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          supportedBlendModes: ['set', 'replace'],
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/supportedBlendModes\[1\] is unsupported/)

    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          supportedBlendModes: ['add', 'add'],
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/duplicate .*supportedBlendModes/)
  })

  it('keeps physical binding explicitly unbound and engineering-classified', () => {
    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          provenance: {
            ...fixtureMetadata.provenance,
            classification: 'measured',
          },
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/provenance must be engineering/)

    expect(() =>
      projectModelResourceInterventionControl(
        {
          ...fixtureMetadata,
          provenance: {
            ...fixtureMetadata.provenance,
            physicalBindingStatus: 'bound',
          },
        },
        'fixture-model-resource-v1',
      ),
    ).toThrow(/physical binding status must remain unbound/)
  })

  it('keeps the bundled flagship resource product control unavailable until scenario metadata exists', () => {
    const resolution = resolveBundledFlagshipModelResourceControl()

    expect(resolution).toMatchObject({
      status: 'unavailable',
      reason: 'scenario-control-metadata-absent',
      resourceContextVersion: 'unbound-model-resource-v1',
      unit: 'model-resource',
    })
    expect('projection' in resolution).toBe(false)
  })
})
