import { describe, expect, it } from 'vitest'

import {
  REQUIRED_TWO_BACTERIUM_CONTROL_IDS,
  REQUIRED_TWO_BACTERIUM_LIMITATIONS,
  TWO_BACTERIUM_CONTENT_PACK_ID,
  TWO_BACTERIUM_CONTENT_PACK_UNBOUND_LIMITATION,
  TWO_BACTERIUM_CONTENT_PACK_VERSION,
  TWO_BACTERIUM_MECHANISM_SCOPE,
  TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
  TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
  assessTwoBacteriumSharedResourceValidationEvidence,
  validateTwoBacteriumSharedResourceValidationEvidence,
  type TwoBacteriumSharedResourceValidationEvidence,
} from './two_bacterium_shared_resource_validation'

function validEvidence(): TwoBacteriumSharedResourceValidationEvidence {
  return {
    schemaVersion: TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_SCHEMA_VERSION,
    experimentId: TWO_BACTERIUM_SHARED_RESOURCE_VALIDATION_EXPERIMENT_ID,
    mechanismScope: TWO_BACTERIUM_MECHANISM_SCOPE,
    scenario: {
      id: 'fixture:two-bacterium-shared-resource',
      version: '1.0.0',
    },
    contentPack: {
      id: TWO_BACTERIUM_CONTENT_PACK_ID,
      version: TWO_BACTERIUM_CONTENT_PACK_VERSION,
    },
    contentPackBinding: {
      status: 'bound',
      limitation: null,
    },
    configurationFingerprint: 'fixture-config-fingerprint',
    taxa: [
      {
        role: 'ecoli-mg1655',
        taxonId: 'taxon:ecoli-mg1655',
        taxonContentVersion: '1.0.0',
        scientificName: 'Escherichia coli',
        background: 'K-12 MG1655',
      },
      {
        role: 'bacillus-168-trp-plus-sigE-minus',
        taxonId: 'taxon:bacillus-subtilis-168-trp-plus-sigE-minus',
        taxonContentVersion: '1.0.0',
        scientificName: 'Bacillus subtilis',
        background: '168 trp+ sigE-',
      },
    ],
    lineageTaxonAssignments: [
      {
        lineageId: 'L1',
        taxonId: 'taxon:ecoli-mg1655',
        taxonContentVersion: '1.0.0',
      },
      {
        lineageId: 'L2',
        taxonId: 'taxon:bacillus-subtilis-168-trp-plus-sigE-minus',
        taxonContentVersion: '1.0.0',
      },
    ],
    units: {
      resource: 'model-resource',
      biomass: 'model-biomass',
    },
    seeds: [101, 102, 103],
    horizonTicks: 1024,
    samplingCadenceTicks: 64,
    controls: REQUIRED_TWO_BACTERIUM_CONTROL_IDS.map((id) => ({
      id,
      status: 'passed' as const,
      detail: `${id} fixture evidence`,
    })),
    limitations: [...REQUIRED_TWO_BACTERIUM_LIMITATIONS],
    runtime: {
      status: 'completed',
      durationSeconds: 12.5,
      peakRssBytes: 123_456_789,
      failures: [],
    },
  }
}

describe('two-bacterium shared-resource validation evidence contract', () => {
  it('accepts a complete exact-version evidence record', () => {
    const evidence = validEvidence()

    expect(
      validateTwoBacteriumSharedResourceValidationEvidence(evidence),
    ).toEqual([])
    expect(
      assessTwoBacteriumSharedResourceValidationEvidence(evidence),
    ).toEqual({
      accepted: true,
      mechanisticAccepted: true,
      provenanceComplete: true,
      structuralErrors: [],
      rejectionReasons: [],
      promotionBlockers: [],
    })
  })

  it('treats a failed required control as valid evidence but not passing evidence', () => {
    const evidence = validEvidence()
    const controls = evidence.controls.map((control) =>
      control.id === 'same-seed-replay'
        ? { ...control, status: 'failed' as const }
        : control,
    )
    const candidate = { ...evidence, controls }

    expect(
      validateTwoBacteriumSharedResourceValidationEvidence(candidate),
    ).toEqual([])
    expect(
      assessTwoBacteriumSharedResourceValidationEvidence(candidate),
    ).toEqual({
      accepted: false,
      mechanisticAccepted: false,
      provenanceComplete: true,
      structuralErrors: [],
      rejectionReasons: ['required control failed: same-seed-replay'],
      promotionBlockers: [],
    })
  })

  it('keeps mechanistic evidence usable while an exact content pack is explicitly unbound', () => {
    const evidence = validEvidence()
    const candidate: TwoBacteriumSharedResourceValidationEvidence = {
      ...evidence,
      contentPack: null,
      contentPackBinding: {
        status: 'unbound',
        limitation: TWO_BACTERIUM_CONTENT_PACK_UNBOUND_LIMITATION,
      },
    }

    expect(
      validateTwoBacteriumSharedResourceValidationEvidence(candidate),
    ).toEqual([])
    expect(
      assessTwoBacteriumSharedResourceValidationEvidence(candidate),
    ).toEqual({
      accepted: false,
      mechanisticAccepted: true,
      provenanceComplete: false,
      structuralErrors: [],
      rejectionReasons: [],
      promotionBlockers: ['content pack manifest is unbound'],
    })
  })

  it('refuses scenario-as-content-pack aliases and inconsistent binding states', () => {
    const evidence = validEvidence()
    const aliased = {
      ...evidence,
      contentPack: { ...evidence.scenario },
    }
    expect(
      validateTwoBacteriumSharedResourceValidationEvidence(aliased),
    ).toContain('contentPack identity must not alias scenario identity')

    const unboundWithPack = {
      ...evidence,
      contentPackBinding: {
        status: 'unbound',
        limitation: TWO_BACTERIUM_CONTENT_PACK_UNBOUND_LIMITATION,
      },
    }
    expect(
      validateTwoBacteriumSharedResourceValidationEvidence(unboundWithPack),
    ).toContain('unbound contentPackBinding requires contentPack to be null')

    const boundWithoutPack = {
      ...evidence,
      contentPack: null,
    }
    expect(
      validateTwoBacteriumSharedResourceValidationEvidence(boundWithoutPack),
    ).toContain('contentPack must be an object')

    const wrongBoundPack = {
      ...evidence,
      contentPack: {
        id: TWO_BACTERIUM_CONTENT_PACK_ID,
        version: '9.9.9',
      },
    }
    expect(
      validateTwoBacteriumSharedResourceValidationEvidence(wrongBoundPack),
    ).toContain(
      `bound contentPack must equal ${TWO_BACTERIUM_CONTENT_PACK_ID}@${TWO_BACTERIUM_CONTENT_PACK_VERSION}`,
    )
  })

  it('fails structurally when a required control or non-claim limitation is missing', () => {
    const evidence = validEvidence()
    const candidate = {
      ...evidence,
      controls: evidence.controls.filter(
        (control) => control.id !== 'checkpoint-restore-continuation',
      ),
      limitations: evidence.limitations.filter(
        (limitation) => limitation !== 'model-resource-is-not-glucose',
      ),
    }

    const errors =
      validateTwoBacteriumSharedResourceValidationEvidence(candidate)
    expect(errors).toContain(
      'missing required control: checkpoint-restore-continuation',
    )
    expect(errors).toContain(
      'missing required limitation: model-resource-is-not-glucose',
    )
    expect(
      assessTwoBacteriumSharedResourceValidationEvidence(candidate).accepted,
    ).toBe(false)
  })

  it('rejects duplicate controls and duplicate runtime lineage identity', () => {
    const evidence = validEvidence()
    const candidate = {
      ...evidence,
      controls: [...evidence.controls, evidence.controls[0]],
      lineageTaxonAssignments: [
        ...evidence.lineageTaxonAssignments,
        evidence.lineageTaxonAssignments[0],
      ],
    }

    const errors =
      validateTwoBacteriumSharedResourceValidationEvidence(candidate)
    expect(errors).toContain(
      `duplicate control id: ${evidence.controls[0]!.id}`,
    )
    expect(errors).toContain('duplicate runtime lineage id: L1')
  })

  it('rejects an unknown or stale taxon content revision in runtime lineage state', () => {
    const evidence = validEvidence()
    const candidate = {
      ...evidence,
      lineageTaxonAssignments: [
        evidence.lineageTaxonAssignments[0],
        {
          ...evidence.lineageTaxonAssignments[1],
          taxonContentVersion: '2.0.0',
        },
      ],
    }

    const errors =
      validateTwoBacteriumSharedResourceValidationEvidence(candidate)
    expect(errors).toContain(
      'lineageTaxonAssignments[1] references an unknown or stale taxon revision',
    )
    expect(errors).toContain(
      'runtime lineage assignments do not represent required taxon role: bacillus-168-trp-plus-sigE-minus',
    )
  })

  it('rejects physical-unit laundering and incomplete mixed-taxon state', () => {
    const evidence = validEvidence()
    const candidate = {
      ...evidence,
      units: {
        resource: 'g/L-glucose',
        biomass: 'gCDW',
      },
      lineageTaxonAssignments: [evidence.lineageTaxonAssignments[0]],
    }

    const errors =
      validateTwoBacteriumSharedResourceValidationEvidence(candidate)
    expect(errors).toContain('units.resource must remain model-resource')
    expect(errors).toContain('units.biomass must remain model-biomass')
    expect(errors).toContain(
      'runtime lineage assignments do not represent required taxon role: bacillus-168-trp-plus-sigE-minus',
    )
  })

  it('rejects malformed runtime accounting and duplicate seeds', () => {
    const evidence = validEvidence()
    const candidate = {
      ...evidence,
      seeds: [101, 101],
      runtime: {
        status: 'completed',
        durationSeconds: -1,
        peakRssBytes: -4,
        failures: ['worker failure', 'worker failure'],
      },
    }

    const errors =
      validateTwoBacteriumSharedResourceValidationEvidence(candidate)
    expect(errors).toContain('duplicate seed: 101')
    expect(errors).toContain(
      'runtime.durationSeconds must be finite and non-negative',
    )
    expect(errors).toContain(
      'runtime.peakRssBytes must be null or a non-negative safe integer',
    )
    expect(errors).toContain('duplicate runtime failure: worker failure')
  })
})
