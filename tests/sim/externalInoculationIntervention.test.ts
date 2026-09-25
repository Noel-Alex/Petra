import { describe, expect, it } from 'vitest'

import {
  EXTERNAL_INOCULATION_AUTHORITY_REFERENCE_SCHEMA_VERSION,
  EXTERNAL_INOCULATION_INTERVENTION_SCHEMA_VERSION,
  assertExternalInoculationIntervention,
  assertExternalInoculationPlacementWithinGrid,
  type ExternalInoculationIntervention,
} from '../../src/sim/externalInoculationIntervention'
import {
  COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  type ComposedParameterSetBinding,
} from '../../src/sim/parameterSetBinding'

const provenanceBinding: ComposedParameterSetBinding = {
  schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  authority: 'provenance',
  parameterSetId: 'ecoli-bsubtilis-shared-resource-composed',
  parameterSetVersion: '1.0.0',
  configurationFingerprint: 'composed-config-fingerprint-v1',
}

function intervention(): ExternalInoculationIntervention {
  return {
    schemaVersion: EXTERNAL_INOCULATION_INTERVENTION_SCHEMA_VERSION,
    authority: {
      schemaVersion:
        EXTERNAL_INOCULATION_AUTHORITY_REFERENCE_SCHEMA_VERSION,
      scenarioId: 'ecoli-bsubtilis-shared-resource',
      scenarioVersion: '1.0.0-experimental',
      parameterSetBinding: provenanceBinding,
      lineageDefinitionId: 'bsubtilis-founder',
      genotypeId: 'bsubtilis-static',
      taxonId: 'bsubtilis-168-trp-plus-sige-minus',
      taxonContentVersion: 'tannler-2008-growth-context-v1',
    },
    placement: {
      kind: 'grid-cell',
      x: 1,
      y: 1,
    },
    biomass: {
      value: 0.5,
      unit: 'model-biomass',
    },
  }
}

const grid = {
  width: 3,
  height: 3,
  mask: [
    0, 1, 0,
    1, 1, 1,
    0, 1, 0,
  ],
} as const

describe('external inoculation intervention authority contract', () => {
  it('accepts an exact provenance reference and in-mask integer grid placement', () => {
    const value = intervention()

    expect(() => assertExternalInoculationIntervention(value)).not.toThrow()
    expect(() =>
      assertExternalInoculationPlacementWithinGrid(value, grid),
    ).not.toThrow()
  })

  it('refuses fixture parameter authority so product inoculation cannot self-certify ad-hoc biology', () => {
    const value = intervention()
    const fixture = {
      ...value,
      authority: {
        ...value.authority,
        parameterSetBinding: {
          ...value.authority.parameterSetBinding,
          authority: 'fixture',
          parameterSetId: 'fixture:external-inoculation',
        },
      },
    }

    expect(() => assertExternalInoculationIntervention(fixture)).toThrow(
      /requires a provenance parameter-set binding/,
    )
  })

  it('refuses raw caller biological parameters and non-model biomass units', () => {
    const value = intervention()
    const withBiology = {
      ...value,
      authority: {
        ...value.authority,
        baselineGrowthRateScale: 0.67 / 0.69,
      },
    }
    expect(() => assertExternalInoculationIntervention(withBiology)).toThrow(
      /unsupported field "baselineGrowthRateScale"/,
    )

    const physicalMass = {
      ...value,
      biomass: {
        value: 0.5,
        unit: 'gCDW',
      },
    }
    expect(() => assertExternalInoculationIntervention(physicalMass)).toThrow(
      /unit must be model-biomass/,
    )
  })

  it('requires positive finite Float32-storable model biomass', () => {
    const zero = intervention()
    expect(() =>
      assertExternalInoculationIntervention({
        ...zero,
        biomass: { ...zero.biomass, value: 0 },
      }),
    ).toThrow(/must be positive/)

    const overflow = intervention()
    expect(() =>
      assertExternalInoculationIntervention({
        ...overflow,
        biomass: { ...overflow.biomass, value: Number.MAX_VALUE },
      }),
    ).toThrow(/finite Float32 field storage/)
  })

  it('refuses normalized/fractional or out-of-mask placement instead of interpreting renderer coordinates', () => {
    const value = intervention()

    expect(() =>
      assertExternalInoculationIntervention({
        ...value,
        placement: { kind: 'grid-cell', x: 0.5, y: 0.5 },
      }),
    ).toThrow(/non-negative safe integer/)

    expect(() =>
      assertExternalInoculationPlacementWithinGrid(
        {
          ...value,
          placement: { kind: 'grid-cell', x: 0, y: 0 },
        },
        grid,
      ),
    ).toThrow(/inside the dish mask/)

    expect(() =>
      assertExternalInoculationPlacementWithinGrid(
        {
          ...value,
          placement: { kind: 'grid-cell', x: 3, y: 1 },
        },
        grid,
      ),
    ).toThrow(/inside grid bounds/)
  })

  it('fails closed on malformed authoritative grid masks', () => {
    const value = intervention()

    expect(() =>
      assertExternalInoculationPlacementWithinGrid(value, {
        width: 3,
        height: 3,
        mask: [1, 1, 1],
      }),
    ).toThrow(/mask length/)

    expect(() =>
      assertExternalInoculationPlacementWithinGrid(value, {
        width: 3,
        height: 3,
        mask: [
          0, 1, 0,
          1, 2, 1,
          0, 1, 0,
        ],
      }),
    ).toThrow(/mask values must be 0 or 1/)
  })

  it('requires exact versioned taxon and source-lineage identity with no unknown command fields', () => {
    const value = intervention()

    expect(() =>
      assertExternalInoculationIntervention({
        ...value,
        authority: {
          ...value.authority,
          taxonContentVersion: ' ',
        },
      }),
    ).toThrow(/taxon content version/)

    expect(() =>
      assertExternalInoculationIntervention({
        ...value,
        presentationToken: 'rod',
      }),
    ).toThrow(/unsupported field "presentationToken"/)
  })
})
