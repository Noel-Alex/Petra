import { describe, expect, it } from 'vitest'

import type { ComposedSimulationConfig } from '../../src/sim/authoritative'
import {
  EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION,
  resolveExternalInoculationAdmission,
} from '../../src/sim/externalInoculationAdmission'
import {
  EXTERNAL_INOCULATION_AUTHORITY_REFERENCE_SCHEMA_VERSION,
  EXTERNAL_INOCULATION_INTERVENTION_SCHEMA_VERSION,
  type ExternalInoculationIntervention,
} from '../../src/sim/externalInoculationIntervention'
import {
  CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
  FRACTIONAL_CARRY_POPULATION_POLICY,
} from '../../src/sim/populationAuthority'
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

describe('external inoculation scenario authority admission', () => {
  it('resolves the exact supported Bacillus static lineage from active composed authority', () => {
    const plan = mixedPlan()
    const admitted = resolveExternalInoculationAdmission(
      bacillusIntervention(),
      { identity: plan.identity, config: plan.config },
    )

    expect(admitted).toMatchObject({
      schemaVersion: EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION,
      scenarioId: 'ecoli-bsubtilis-shared-resource',
      scenarioVersion: '1.0.0-experimental',
      lineageDefinition: {
        id: 'bsubtilis-founder',
        genotypeId: 'bsubtilis-static',
        taxonId: 'bsubtilis-168-trp-plus-sige-minus',
        taxonContentVersion: 'tannler-2008-growth-context-v1',
        baselineGrowthRateScale: 0.67 / 0.69,
        deathHazardPerHour: 0,
      },
      taxon: {
        id: 'bsubtilis-168-trp-plus-sige-minus',
        contentVersion: 'tannler-2008-growth-context-v1',
        scientificName: 'Bacillus subtilis',
        background: '168 trp+ sigE-',
      },
    })
    expect(admitted.parameterSetBinding).toEqual(plan.parameterSetBinding)
    expect(admitted.lineageDefinition).not.toBe(plan.config.lineages[1])
    expect(Object.isFrozen(admitted)).toBe(true)
    expect(Object.isFrozen(admitted.parameterSetBinding)).toBe(true)
    expect(Object.isFrozen(admitted.lineageDefinition)).toBe(true)
    expect(Object.isFrozen(admitted.taxon)).toBe(true)
  })

  it('refuses scenario or parameter-set drift instead of borrowing compatible-looking biology', () => {
    const plan = mixedPlan()
    const value = bacillusIntervention()

    expect(() =>
      resolveExternalInoculationAdmission(
        {
          ...value,
          authority: {
            ...value.authority,
            scenarioVersion: 'different-scenario-version',
          },
        },
        { identity: plan.identity, config: plan.config },
      ),
    ).toThrow(/active scenario identity/)

    expect(() =>
      resolveExternalInoculationAdmission(
        {
          ...value,
          authority: {
            ...value.authority,
            parameterSetBinding: {
              ...value.authority.parameterSetBinding,
              configurationFingerprint: 'different-fingerprint',
            },
          },
        },
        { identity: plan.identity, config: plan.config },
      ),
    ).toThrow(/active parameter-set binding/)
  })

  it('refuses unknown or identity-drifted static lineage definitions', () => {
    const plan = mixedPlan()
    const value = bacillusIntervention()

    expect(() =>
      resolveExternalInoculationAdmission(
        {
          ...value,
          authority: {
            ...value.authority,
            lineageDefinitionId: 'not-a-configured-lineage',
          },
        },
        { identity: plan.identity, config: plan.config },
      ),
    ).toThrow(/resolve exactly once/)

    expect(() =>
      resolveExternalInoculationAdmission(
        {
          ...value,
          authority: {
            ...value.authority,
            genotypeId: 'ecoli-wt',
          },
        },
        { identity: plan.identity, config: plan.config },
      ),
    ).toThrow(/genotype does not match/)

    expect(() =>
      resolveExternalInoculationAdmission(
        {
          ...value,
          authority: {
            ...value.authority,
            taxonContentVersion: 'stale-bacillus-content',
          },
        },
        { identity: plan.identity, config: plan.config },
      ),
    ).toThrow(/taxon identity does not match/)
  })

  it('requires exact taxon registry authority instead of inferring taxon identity from lineage labels', () => {
    const plan = mixedPlan()
    const { taxonRegistry: _removed, ...configWithoutTaxon } = plan.config

    expect(() =>
      resolveExternalInoculationAdmission(
        bacillusIntervention(),
        {
          identity: plan.identity,
          config: configWithoutTaxon,
        },
      ),
    ).toThrow(/requires an authoritative taxon registry/)
  })

  it('keeps v1 fail-closed when discrete population authority is enabled', () => {
    const plan = mixedPlan()
    const populationEnabledConfig: ComposedSimulationConfig = {
      ...plan.config,
      populationAuthority: {
        calibration: {
          schemaVersion: CELL_EQUIVALENT_CALIBRATION_SCHEMA_VERSION,
          id: 'fixture-external-inoculation-population-scale',
          modelBiomassPerCellEquivalent: 0.01,
          provenance: {
            classification: 'engineering',
            sourceKeys: [],
            limitation:
              'Test-only scale proving external inoculation v1 remains fail-closed.',
          },
        },
        policy: FRACTIONAL_CARRY_POPULATION_POLICY,
      },
    }

    expect(() =>
      resolveExternalInoculationAdmission(
        bacillusIntervention(),
        {
          identity: plan.identity,
          config: populationEnabledConfig,
        },
      ),
    ).toThrow(/populationAuthority null/)
  })
})
