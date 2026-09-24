import { describe, expect, it } from 'vitest'

import {
  PARAMETER_COMPATIBILITY_SCHEMA_VERSION,
  ParameterCompatibilityError,
  assessParameterCompatibility,
  assertParameterCompatibility,
  parameterCompatibilityDecisionIdentity,
  type ParameterCompatibilityComposition,
} from '../../src/sim/parameterCompatibility'

function baseComposition(): ParameterCompatibilityComposition {
  return {
    schemaVersion: PARAMETER_COMPATIBILITY_SCHEMA_VERSION,
    target: {
      compatibilityGroupId: 'fixture:mg1655-m9-37c-aerobic',
      context: {
        organismBackground: 'E. coli MG1655',
        mediumSubstrate: 'M9-glucose',
        temperatureC: 37,
        pH: 7,
        oxygenRegime: 'aerobic',
        assayConvention: 'fixture-growth-rate',
        modelConvention: 'fixture-biomass-v1',
      },
    },
    requiredFields: [
      'organismBackground',
      'mediumSubstrate',
      'temperatureC',
      'pH',
      'oxygenRegime',
      'assayConvention',
      'modelConvention',
    ],
    records: [
      {
        recordId: 'fixture:growth',
        sourceKey: 'fixture-growth-source',
        compatibilityGroupId: 'fixture:mg1655-m9-37c-aerobic',
        context: {
          organismBackground: 'E. coli MG1655',
          mediumSubstrate: 'M9-glucose',
          temperatureC: 37,
          pH: 7,
          oxygenRegime: 'aerobic',
          assayConvention: 'fixture-growth-rate',
          modelConvention: 'fixture-biomass-v1',
        },
      },
    ],
    transfers: [],
  }
}

describe('parameter compatibility authority', () => {
  it('accepts exact machine-readable compatibility without a transfer', () => {
    const composition = baseComposition()
    expect(assessParameterCompatibility(composition)).toEqual({
      schemaVersion: PARAMETER_COMPATIBILITY_SCHEMA_VERSION,
      compatible: true,
      conflicts: [],
    })
    expect(() => assertParameterCompatibility(composition)).not.toThrow()
  })

  it('reports exact group and context conflicts without numeric reconciliation', () => {
    const composition = baseComposition()
    const incompatible: ParameterCompatibilityComposition = {
      ...composition,
      records: [
        {
          ...composition.records[0]!,
          compatibilityGroupId: 'fixture:k12-lb-30c-aerobic',
          context: {
            ...composition.records[0]!.context,
            mediumSubstrate: 'LB',
            temperatureC: 30,
          },
        },
      ],
    }

    const assessment = assessParameterCompatibility(incompatible)
    expect(assessment.compatible).toBe(false)
    expect(assessment.conflicts).toEqual([
      expect.objectContaining({
        recordId: 'fixture:growth',
        sourceKey: 'fixture-growth-source',
        dimension: 'compatibilityGroupId',
        reason: 'compatibility-group-mismatch',
      }),
      expect.objectContaining({
        dimension: 'mediumSubstrate',
        reason: 'context-mismatch',
        recordValue: 'LB',
        targetValue: 'M9-glucose',
      }),
      expect.objectContaining({
        dimension: 'temperatureC',
        reason: 'context-mismatch',
        recordValue: 30,
        targetValue: 37,
      }),
    ])

    try {
      assertParameterCompatibility(incompatible)
      throw new Error('expected compatibility refusal')
    } catch (error) {
      expect(error).toBeInstanceOf(ParameterCompatibilityError)
      expect((error as Error).message).toContain('fixture:growth')
      expect((error as Error).message).toContain('temperatureC')
      expect((error as Error).message).not.toContain('average')
    }
  })

  it('accepts only an explicit field-scoped transfer/calibration decision', () => {
    const composition = baseComposition()
    const transferred: ParameterCompatibilityComposition = {
      ...composition,
      records: [
        {
          ...composition.records[0]!,
          compatibilityGroupId: 'fixture:k12-lb-30c-aerobic',
          context: {
            ...composition.records[0]!.context,
            mediumSubstrate: 'LB',
            temperatureC: 30,
          },
        },
      ],
      transfers: [
        {
          recordId: 'fixture:growth',
          policyId: 'fixture:cross-medium-transfer',
          policyVersion: '1',
          classification: 'transferred',
          fromCompatibilityGroupId: 'fixture:k12-lb-30c-aerobic',
          toCompatibilityGroupId: 'fixture:mg1655-m9-37c-aerobic',
          dimensions: [
            'compatibilityGroupId',
            'mediumSubstrate',
            'temperatureC',
          ],
          limitation:
            'Fixture-only transfer used to exercise explicit compatibility policy.',
        },
      ],
    }

    expect(assessParameterCompatibility(transferred).compatible).toBe(true)

    const missingScope: ParameterCompatibilityComposition = {
      ...transferred,
      transfers: [
        {
          ...transferred.transfers[0]!,
          dimensions: ['compatibilityGroupId', 'mediumSubstrate'],
        },
      ],
    }
    expect(assessParameterCompatibility(missingScope).conflicts).toEqual([
      expect.objectContaining({
        dimension: 'temperatureC',
        reason: 'transfer-scope-missing',
      }),
    ])
  })

  it('does not allow a transfer declaration to waive missing context', () => {
    const composition = baseComposition()
    const missingTemperature: ParameterCompatibilityComposition = {
      ...composition,
      records: [
        {
          ...composition.records[0]!,
          compatibilityGroupId: 'fixture:other-group',
          context: {
            organismBackground: 'E. coli MG1655',
            mediumSubstrate: 'M9-glucose',
            pH: 7,
            oxygenRegime: 'aerobic',
            assayConvention: 'fixture-growth-rate',
            modelConvention: 'fixture-biomass-v1',
          },
        },
      ],
      transfers: [
        {
          recordId: 'fixture:growth',
          policyId: 'fixture:group-transfer',
          policyVersion: '1',
          classification: 'calibrated',
          fromCompatibilityGroupId: 'fixture:other-group',
          toCompatibilityGroupId: 'fixture:mg1655-m9-37c-aerobic',
          dimensions: ['compatibilityGroupId'],
          limitation: 'Fixture-only compatibility calibration.',
        },
      ],
    }

    expect(assessParameterCompatibility(missingTemperature).conflicts).toEqual([
      expect.objectContaining({
        dimension: 'temperatureC',
        reason: 'missing-record-context',
        recordValue: null,
        targetValue: 37,
      }),
    ])
  })

  it('rejects overbroad or malformed transfer declarations', () => {
    const composition = baseComposition()
    expect(() =>
      assessParameterCompatibility({
        ...composition,
        transfers: [
          {
            recordId: 'fixture:growth',
            policyId: 'fixture:unneeded',
            policyVersion: '1',
            classification: 'transferred',
            fromCompatibilityGroupId: 'fixture:mg1655-m9-37c-aerobic',
            toCompatibilityGroupId: 'fixture:mg1655-m9-37c-aerobic',
            dimensions: ['temperatureC'],
            limitation: 'This transfer should be rejected because nothing differs.',
          },
        ],
      }),
    ).toThrow(/non-conflicting dimension/)

    expect(() =>
      assessParameterCompatibility({
        ...composition,
        records: [
          {
            ...composition.records[0]!,
            compatibilityGroupId: 'fixture:other-group',
          },
        ],
        transfers: [
          {
            recordId: 'fixture:growth',
            policyId: 'fixture:missing-limitation',
            policyVersion: '1',
            classification: 'transferred',
            fromCompatibilityGroupId: 'fixture:other-group',
            toCompatibilityGroupId: 'fixture:mg1655-m9-37c-aerobic',
            dimensions: ['compatibilityGroupId'],
            limitation: '',
          },
        ],
      }),
    ).toThrow(/limitation/)
  })

  it('canonicalizes declaration ordering but changes identity when the decision changes', () => {
    const composition = baseComposition()
    const secondRecord = {
      ...composition.records[0]!,
      recordId: 'fixture:resource',
      sourceKey: 'fixture-resource-source',
    }
    const twoRecords: ParameterCompatibilityComposition = {
      ...composition,
      requiredFields: [...composition.requiredFields].reverse(),
      records: [secondRecord, composition.records[0]!],
    }
    const reordered: ParameterCompatibilityComposition = {
      ...composition,
      records: [composition.records[0]!, secondRecord],
    }

    expect(parameterCompatibilityDecisionIdentity(twoRecords)).toBe(
      parameterCompatibilityDecisionIdentity(reordered),
    )

    const changedTarget: ParameterCompatibilityComposition = {
      ...reordered,
      target: {
        ...reordered.target,
        context: {
          ...reordered.target.context,
          temperatureC: 36,
        },
      },
      records: reordered.records.map((record) => ({
        ...record,
        context: {
          ...record.context,
          temperatureC: 36,
        },
      })),
    }

    expect(parameterCompatibilityDecisionIdentity(changedTarget)).not.toBe(
      parameterCompatibilityDecisionIdentity(reordered),
    )
  })
})
