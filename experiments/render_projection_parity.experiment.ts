import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import { projectAuthoritativeComposedDishSnapshot } from '../src/app/composedDishProjection'
import type { RuntimeEcologyObservation } from '../src/app/experimentRuntime'
import { projectRuntimeEcologyNetGrowthField } from '../src/app/runtimeEcologyRenderField'
import { ECOLOGY_NET_GROWTH_RENDER_FIELD_ID } from '../src/render/ecologyFluxField'
import type { DishRenderSnapshot, RenderField } from '../src/render/model'
import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
} from '../src/sim/ciprofloxacinIntervention'
import { ComposedSimulationEngine } from '../src/sim/composedEngine'
import { buildFlagshipComposedRunPlan } from '../src/sim/flagshipComposition'
import type { ComposedSimulationSnapshot } from '../src/sim/protocol'
import {
  renderProjectionAuthorityFromComposedSnapshot,
  verifyRenderProjectionParity,
  verifyRuntimeEcologyNetGrowthParity,
  type RenderProjectionParityContract,
} from './render_projection_parity'

const EXPERIMENT_ID = 'render-projection-parity'
const RUN_BRANCH_IDENTITY = 'render-projection-parity:generation-0'
const SEED = 0x5eed717

const INITIALIZATION = Object.freeze({
  seed: SEED,
  initialResourceLevel: 8,
  inocula: Object.freeze([
    Object.freeze({
      lineageId: 'founder-wt',
      x: 80,
      y: 80,
      biomass: 1,
    }),
  ]),
})

const CONTRACT: RenderProjectionParityContract = Object.freeze({
  expectedSamplingIdentity: `runtime-branch:${RUN_BRANCH_IDENTITY}`,
  resourceFieldId: 'authoritative-resource',
  ciprofloxacinFieldId: 'authoritative-ciprofloxacin',
  biomassFieldId: 'authoritative-biomass',
})

function writeCompactResult(result: unknown): void {
  const output = process.env.PETRA_LOCAL_RESULT_JSON
  if (output === undefined || output.trim() === '') return

  mkdirSync(dirname(output), { recursive: true })
  const temporary = output + '.tmp'
  writeFileSync(
    temporary,
    JSON.stringify(result, null, 2) + '\n',
    'utf8',
  )
  renameSync(temporary, output)
}

function buildProductProjection(): {
  readonly plan: ReturnType<typeof buildFlagshipComposedRunPlan>
  readonly snapshot: ComposedSimulationSnapshot
  readonly runtimeObservation: RuntimeEcologyObservation
  readonly projected: DishRenderSnapshot
} {
  const plan = buildFlagshipComposedRunPlan(INITIALIZATION)
  const engine = new ComposedSimulationEngine(plan.identity, plan.config)

  const wtMic = plan.config.ciprofloxacin?.genotypeMicMgPerL.find(
    (entry) => entry.genotypeId === 'WT',
  )?.micMgPerL
  assert.ok(
    wtMic !== undefined && Number.isFinite(wtMic) && wtMic > 0,
    'render projection parity requires positive source-backed WT MIC authority',
  )

  engine.execute({
    id: 'render-parity-ciprofloxacin-radial-set',
    type: 'apply-ciprofloxacin',
    intervention: {
      schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
      concentrationMgPerL: wtMic,
      concentrationUnit: 'mg/L',
      blendMode: 'set',
      geometry: {
        kind: 'radial',
        center: { x: 0.45, y: 0.5 },
        radiusFraction: 0.22,
      },
    },
  })
  engine.execute({
    id: 'render-parity-ciprofloxacin-paint-add',
    type: 'apply-ciprofloxacin',
    intervention: {
      schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
      concentrationMgPerL: 0,
      concentrationUnit: 'mg/L',
      blendMode: 'add',
      geometry: {
        kind: 'paint',
        samples: [
          { x: 0.25, y: 0.3 },
          { x: 0.72, y: 0.68 },
        ],
        brushRadiusFraction: 0.04,
      },
    },
  })

  const snapshot = engine.execute({
    id: 'render-parity-advance',
    type: 'advance',
    ticks: 1,
  })
  assert.ok(
    snapshot.ecologyObservation !== undefined,
    'accepted ecology advance must expose its exact step-local observation',
  )
  const runtimeObservation: RuntimeEcologyObservation = {
    runBranchIdentity: RUN_BRANCH_IDENTITY,
    envelope: snapshot.ecologyObservation,
  }
  const projected = projectAuthoritativeComposedDishSnapshot(
    snapshot,
    RUN_BRANCH_IDENTITY,
    runtimeObservation,
  )

  return { plan, snapshot, runtimeObservation, projected }
}

function cloneProjection(
  snapshot: DishRenderSnapshot,
): DishRenderSnapshot {
  return {
    ...snapshot,
    dishMask: Uint8Array.from(snapshot.dishMask),
    biomass: Float32Array.from(snapshot.biomass),
    fields: snapshot.fields.map((field) => ({
      ...field,
      values: Float32Array.from(field.values),
    })),
    lineages: snapshot.lineages.map((lineage) => ({
      ...lineage,
      density: Float32Array.from(lineage.density),
    })),
    acceptedInterventionFootprints:
      snapshot.acceptedInterventionFootprints?.map((footprint) =>
        structuredClone(footprint),
      ),
    events: snapshot.events.map((event) => ({ ...event })),
  }
}

function replaceField(
  snapshot: DishRenderSnapshot,
  id: string,
  update: (field: RenderField) => RenderField,
): DishRenderSnapshot {
  return {
    ...snapshot,
    fields: snapshot.fields.map((field) =>
      field.id === id ? update(field) : field,
    ),
  }
}

function parity(
  projected: DishRenderSnapshot,
  snapshot: ComposedSimulationSnapshot,
) {
  return verifyRenderProjectionParity(
    renderProjectionAuthorityFromComposedSnapshot(snapshot),
    projected,
    {
      ...CONTRACT,
      expectedSnapshotId: `composed-trace:${snapshot.traceHash}`,
    },
  )
}

describe('authoritative composed-to-dish render projection parity', () => {
  it('projects the real flagship composed state through the product adapter without scientific channel drift', () => {
    const { plan, snapshot, projected } = buildProductProjection()
    const evidence = parity(projected, snapshot)

    expect(evidence.classification).toBe(
      'render-projection-integrity-not-biological-validation',
    )
    expect(evidence.exactChecks).toEqual({
      dimensions: true,
      dishMask: true,
      simulationTime: true,
      samplingIdentity: true,
      lineageOrder: true,
      projectedFloat32Channels: true,
      aggregateFloat32Policy: true,
      acceptedInterventionFootprints: true,
    })
    expect(evidence.acceptedInterventionFootprints).toEqual({
      count: 2,
      exact: true,
    })
    expect(evidence.units).toEqual({
      resource: 'model-resource',
      ciprofloxacin: 'mg/L',
      biomass: 'model-biomass',
    })
    expect(evidence.simulationTimeHours).toBe(
      snapshot.checkpoint.simulationTimeHours,
    )
    expect(evidence.projectedSnapshotId).toBe(
      `composed-trace:${snapshot.traceHash}`,
    )
    expect(evidence.samplingIdentity).toBe(
      `runtime-branch:${RUN_BRANCH_IDENTITY}`,
    )

    const netGrowthField = projected.fields.find(
      (field) => field.id === ECOLOGY_NET_GROWTH_RENDER_FIELD_ID,
    )
    assert.ok(
      netGrowthField !== undefined,
      'combined product projection must include the runtime-bound net-growth field',
    )
    assert.ok(
      snapshot.ecologyObservation !== undefined,
      'net-growth parity requires the accepted ecology observation',
    )
    const netGrowthEvidence = verifyRuntimeEcologyNetGrowthParity(
      snapshot.ecologyObservation.observation,
      netGrowthField,
    )
    expect(netGrowthEvidence.unit).toBe('model-biomass/hour')
    expect(netGrowthEvidence.rangeMode).toBe('snapshot-extrema')

    writeCompactResult({
      experimentId: EXPERIMENT_ID,
      status: 'pass',
      classification:
        'render-projection-integrity-not-biological-validation',
      runIdentity: plan.identity,
      configurationFingerprint:
        snapshot.checkpoint.composedState.configurationFingerprint,
      checkpoint: {
        tick: snapshot.checkpoint.tick,
        simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
        commandCount: snapshot.checkpoint.commandCount,
        traceHash: snapshot.traceHash,
      },
      renderBranchIdentity: RUN_BRANCH_IDENTITY,
      evidence,
      netGrowthEvidence,
      negativeCases: [
        'one-cell-resource-channel-drift',
        'lineage-identity-drift',
        'resource-unit-drift',
        'dish-mask-drift',
        'biological-time-drift',
        'runtime-sampling-identity-drift',
        'snapshot-identity-drift',
        'accepted-intervention-command-drift',
        'accepted-intervention-geometry-drift',
        'runtime-ecology-cross-branch-drift',
        'net-growth-one-cell-drift',
      ],
      limitations: [
        'This establishes product render-projection integrity for the tested authoritative keyframe, not biological validation or physical calibration.',
        'Renderer Float32 quantization is explicit evidence and is not fed back into simulation authority.',
        'Render transfer-domain semantics remain owned by the renderer range contract and are not redefined here.',
        'Accepted intervention footprint parity proves exact event-to-render geometry transport; it does not prove biological efficacy beyond the authoritative simulator state.',
        'Runtime net-growth parity proves the product adapter preserves the accepted step-local rate field; it does not prove that the current Pixi/UI selection visibly displays that overlay.',
        'Browser/GPU visual correctness and performance remain separate local acceptance gates.',
      ],
    })
  })

  it('rejects scientific channel, unit, mask, time, identity and lineage-order drift', () => {
    const { snapshot, projected } = buildProductProjection()

    const wrongResource = replaceField(
      cloneProjection(projected),
      CONTRACT.resourceFieldId,
      (field) => {
        const values = Float32Array.from(field.values)
        values[0] = Math.fround(values[0]! + 0.25)
        return { ...field, values }
      },
    )
    expect(() => parity(wrongResource, snapshot)).toThrow(
      /model resource differs/i,
    )

    const wrongLineageIdentity = cloneProjection(projected)
    const firstLineage = wrongLineageIdentity.lineages[0]
    assert.ok(firstLineage !== undefined, 'flagship projection must contain a lineage')
    expect(() =>
      parity(
        {
          ...wrongLineageIdentity,
          lineages: [
            {
              ...firstLineage,
              id: firstLineage.id + '-wrong',
            },
            ...wrongLineageIdentity.lineages.slice(1),
          ],
        },
        snapshot,
      ),
    ).toThrow(/lineage id/i)

    const wrongUnit = replaceField(
      cloneProjection(projected),
      CONTRACT.resourceFieldId,
      (field) => ({ ...field, unit: 'mg/L' }),
    )
    expect(() => parity(wrongUnit, snapshot)).toThrow(/unit/i)

    const wrongMask = cloneProjection(projected)
    wrongMask.dishMask[0] = wrongMask.dishMask[0] === 1 ? 0 : 1
    expect(() => parity(wrongMask, snapshot)).toThrow(/dish mask differs/i)

    expect(() =>
      parity(
        {
          ...cloneProjection(projected),
          simulationTimeHours:
            projected.simulationTimeHours + 1,
        },
        snapshot,
      ),
    ).toThrow(/simulationTimeHours/i)

    expect(() =>
      parity(
        {
          ...cloneProjection(projected),
          samplingIdentity: 'runtime-branch:wrong-generation',
        },
        snapshot,
      ),
    ).toThrow(/samplingIdentity/i)

    expect(() =>
      parity(
        {
          ...cloneProjection(projected),
          snapshotId: 'composed-trace:wrong',
        },
        snapshot,
      ),
    ).toThrow(/snapshotId/i)

    const firstFootprint = projected.acceptedInterventionFootprints?.[0]
    assert.ok(
      firstFootprint !== undefined,
      'parity fixture must include an accepted intervention footprint',
    )
    expect(() =>
      parity(
        {
          ...cloneProjection(projected),
          acceptedInterventionFootprints: [
            { ...structuredClone(firstFootprint), commandId: 'wrong-command' },
            ...(projected.acceptedInterventionFootprints?.slice(1).map(
              (footprint) => structuredClone(footprint),
            ) ?? []),
          ],
        },
        snapshot,
      ),
    ).toThrow(/footprint commandId/i)

    assert.equal(firstFootprint.intervention.geometry.kind, 'radial')
    if (firstFootprint.intervention.geometry.kind !== 'radial') {
      throw new Error('first parity intervention must be radial')
    }
    expect(() =>
      parity(
        {
          ...cloneProjection(projected),
          acceptedInterventionFootprints: [
            {
              ...structuredClone(firstFootprint),
              intervention: {
                ...structuredClone(firstFootprint.intervention),
                geometry: {
                  ...firstFootprint.intervention.geometry,
                  radiusFraction:
                    firstFootprint.intervention.geometry.radiusFraction + 0.01,
                },
              },
            },
            ...(projected.acceptedInterventionFootprints?.slice(1).map(
              (footprint) => structuredClone(footprint),
            ) ?? []),
          ],
        },
        snapshot,
      ),
    ).toThrow(/footprint intervention differs/i)

    const { runtimeObservation } = buildProductProjection()
    expect(() =>
      projectRuntimeEcologyNetGrowthField(
        snapshot,
        'render-projection-parity:wrong-generation',
        runtimeObservation,
      ),
    ).toThrow(/different runtime history generation/i)

    assert.ok(
      snapshot.ecologyObservation !== undefined,
      'net-growth drift test requires ecology observation authority',
    )
    const netGrowth = projected.fields.find(
      (field) => field.id === ECOLOGY_NET_GROWTH_RENDER_FIELD_ID,
    )
    assert.ok(netGrowth !== undefined, 'net-growth field must exist')
    const driftedValues = Float32Array.from(netGrowth.values)
    const inMaskCell = snapshot.ecologyObservation.observation.mask.findIndex(
      (value) => value === 1,
    )
    assert.ok(inMaskCell >= 0, 'net-growth source mask must contain cells')
    driftedValues[inMaskCell] = Math.fround(
      driftedValues[inMaskCell]! + 0.001,
    )
    expect(() =>
      verifyRuntimeEcologyNetGrowthParity(
        snapshot.ecologyObservation!.observation,
        { ...netGrowth, values: driftedValues },
      ),
    ).toThrow(/net-growth rate differs/i)
  })
})
