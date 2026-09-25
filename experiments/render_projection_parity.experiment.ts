import assert from 'node:assert/strict'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import { projectAuthoritativeComposedDishSnapshot } from '../src/app/composedDishProjection'
import type { DishRenderSnapshot, RenderField } from '../src/render/model'
import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
} from '../src/sim/ciprofloxacinIntervention'
import { ComposedSimulationEngine } from '../src/sim/composedEngine'
import { buildFlagshipComposedRunPlan } from '../src/sim/flagshipComposition'
import {
  renderProjectionAuthorityFromComposedSnapshot,
  verifyRenderProjectionParity,
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
  readonly snapshot: ReturnType<ComposedSimulationEngine['snapshot']>
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
    id: 'render-parity-ciprofloxacin',
    type: 'apply-ciprofloxacin',
    intervention: {
      schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
      concentrationMgPerL: wtMic,
      concentrationUnit: 'mg/L',
      blendMode: 'set',
      geometry: { kind: 'global' },
    },
  })

  const snapshot = engine.execute({
    id: 'render-parity-advance',
    type: 'advance',
    ticks: 1,
  })
  const projected = projectAuthoritativeComposedDishSnapshot(
    snapshot,
    RUN_BRANCH_IDENTITY,
  )

  return { plan, snapshot, projected }
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
  snapshot: ReturnType<ComposedSimulationEngine['snapshot']>,
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
      negativeCases: [
        'one-cell-resource-channel-drift',
        'lineage-identity-drift',
        'resource-unit-drift',
        'dish-mask-drift',
        'biological-time-drift',
        'runtime-sampling-identity-drift',
        'snapshot-identity-drift',
      ],
      limitations: [
        'This establishes product render-projection integrity for the tested authoritative keyframe, not biological validation or physical calibration.',
        'Renderer Float32 quantization is explicit evidence and is not fed back into simulation authority.',
        'Render transfer-domain semantics remain owned by the renderer range contract and are not redefined here.',
        'Spatial intervention footprint semantics remain owned by the accepted-event footprint contract and are not redefined here.',
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
  })
})
