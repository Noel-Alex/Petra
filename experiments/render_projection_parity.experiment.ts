import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { describe, expect, it } from 'vitest'

import { resolveLineageVisualIdentity } from '../src/design/lineageIdentity'
import type {
  DishRenderSnapshot,
  RenderField,
  RenderLineage,
} from '../src/render/model'
import type {
  RenderProjectionAuthority,
  RenderProjectionParityContract,
} from './render_projection_parity'
import {
  verifyRenderProjectionParity,
} from './render_projection_parity'

const EXPERIMENT_ID = 'render-projection-parity'
const SAMPLING_IDENTITY = 'runtime-branch-fixture:generation-1'
const SNAPSHOT_ID = 'fixture-snapshot:trace-v1'

const CONTRACT: RenderProjectionParityContract = Object.freeze({
  expectedSamplingIdentity: SAMPLING_IDENTITY,
  expectedSnapshotId: SNAPSHOT_ID,
  resourceFieldId: 'authoritative-resource',
  ciprofloxacinFieldId: 'authoritative-ciprofloxacin',
  biomassFieldId: 'authoritative-biomass',
})

const AUTHORITY: RenderProjectionAuthority = Object.freeze({
  traceHash: 'trace-v1',
  simulationTimeHours: 1.25,
  width: 2,
  height: 2,
  mask: Object.freeze([1, 1, 1, 0]),
  resource: Object.freeze([1 / 3, 2.0000001, 0.5, 0]),
  ciprofloxacinConcentrationMgPerL: Object.freeze([
    0.03,
    0.12500001,
    0.38,
    0,
  ]),
  lineages: Object.freeze([
    Object.freeze({
      id: 'lineage-a',
      biomass: Object.freeze([0.1, 0.2, 0.3, 0]),
    }),
    Object.freeze({
      id: 'lineage-b',
      biomass: Object.freeze([0.05, 0.125, 0.4, 0]),
    }),
  ]),
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

function referenceProjectionForHarnessOnly(
  authority: RenderProjectionAuthority,
): DishRenderSnapshot {
  const cells = authority.width * authority.height
  const dishMask = Uint8Array.from(authority.mask)
  const biomass = new Float32Array(cells)

  const lineages: RenderLineage[] = authority.lineages.map((lineage) => {
    const density = Float32Array.from(
      lineage.biomass,
      (value) => Math.fround(value),
    )
    for (let cell = 0; cell < cells; cell += 1) {
      biomass[cell] = Math.fround(
        biomass[cell]! + density[cell]!,
      )
    }
    const visual = resolveLineageVisualIdentity(lineage.id)
    return {
      id: lineage.id,
      label: lineage.id,
      appearanceToken: visual.appearanceToken,
      patternToken: visual.patternToken,
      density,
    }
  })

  const resource = Float32Array.from(
    authority.resource,
    (value) => Math.fround(value),
  )
  const ciprofloxacin = Float32Array.from(
    authority.ciprofloxacinConcentrationMgPerL,
    (value) => Math.fround(value),
  )

  return {
    snapshotId: SNAPSHOT_ID,
    samplingIdentity: SAMPLING_IDENTITY,
    simulationTimeHours: authority.simulationTimeHours,
    gridWidth: authority.width,
    gridHeight: authority.height,
    dishMask,
    biomass,
    fields: [
      createField(
        CONTRACT.resourceFieldId,
        'nutrient',
        'Limiting resource',
        'model-resource',
        resource,
        dishMask,
        authority.width,
        authority.height,
      ),
      createField(
        CONTRACT.ciprofloxacinFieldId,
        'antibiotic',
        'Ciprofloxacin',
        'mg/L',
        ciprofloxacin,
        dishMask,
        authority.width,
        authority.height,
      ),
      createField(
        CONTRACT.biomassFieldId,
        'biomass',
        'Total biomass',
        'model-biomass',
        biomass,
        dishMask,
        authority.width,
        authority.height,
      ),
    ],
    lineages,
    events: [],
  }
}

function createField(
  id: string,
  kind: RenderField['kind'],
  label: string,
  unit: string,
  values: Float32Array,
  mask: Uint8Array,
  width: number,
  height: number,
): RenderField {
  let minimum = Number.POSITIVE_INFINITY
  let maximum = Number.NEGATIVE_INFINITY
  for (let index = 0; index < values.length; index += 1) {
    if (mask[index] !== 1) continue
    minimum = Math.min(minimum, values[index]!)
    maximum = Math.max(maximum, values[index]!)
  }
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new Error('fixture field requires at least one in-mask value')
  }
  return {
    id,
    kind,
    label,
    unit,
    width,
    height,
    values,
    minimum,
    maximum,
  }
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

describe('prepared authoritative render-projection parity harness', () => {
  it('accepts the declared Float32 projection and records quantization explicitly', () => {
    const projected = referenceProjectionForHarnessOnly(AUTHORITY)
    const evidence = verifyRenderProjectionParity(
      AUTHORITY,
      projected,
      CONTRACT,
    )

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
    expect(evidence.quantization.resource.maxAbsoluteError).toBeGreaterThan(0)
    expect(
      evidence.quantization.lineageBiomass.maxAbsoluteError,
    ).toBeGreaterThan(0)

    writeCompactResult({
      experimentId: EXPERIMENT_ID,
      status: 'prepared-harness-self-test',
      blockedOnIssue: 457,
      evidence,
      negativeCases: [
        'one-cell-resource-channel-drift',
        'lineage-order-drift',
        'resource-unit-drift',
        'dish-mask-drift',
        'biological-time-drift',
        'runtime-sampling-identity-drift',
        'snapshot-identity-drift',
      ],
      limitations: [
        'This prepared test exercises the parity verifier against an experiment-owned reference projection only.',
        'It is not product-projector evidence until issue #457 lands and this experiment binds the real composed-to-dish adapter.',
        'Projection integrity is not biological validation or physical calibration.',
        'Render transfer-domain semantics are owned separately by the render-field range contract.',
        'Spatial intervention footprint semantics are owned separately by issue #822.',
      ],
    })
  })

  it('rejects scientific channel, unit, mask, time, identity and lineage-order drift', () => {
    const base = referenceProjectionForHarnessOnly(AUTHORITY)

    const wrongResource = replaceField(
      cloneProjection(base),
      CONTRACT.resourceFieldId,
      (field) => {
        const values = Float32Array.from(field.values)
        values[0] = Math.fround(values[0]! + 0.25)
        return { ...field, values }
      },
    )
    expect(() =>
      verifyRenderProjectionParity(AUTHORITY, wrongResource, CONTRACT),
    ).toThrow(/model resource differs/i)

    const wrongLineageOrder = cloneProjection(base)
    const reversed = [...wrongLineageOrder.lineages].reverse()
    expect(() =>
      verifyRenderProjectionParity(
        AUTHORITY,
        { ...wrongLineageOrder, lineages: reversed },
        CONTRACT,
      ),
    ).toThrow(/lineage id/i)

    const wrongUnit = replaceField(
      cloneProjection(base),
      CONTRACT.resourceFieldId,
      (field) => ({ ...field, unit: 'mg/L' }),
    )
    expect(() =>
      verifyRenderProjectionParity(AUTHORITY, wrongUnit, CONTRACT),
    ).toThrow(/unit/i)

    const wrongMask = cloneProjection(base)
    wrongMask.dishMask[0] = 0
    expect(() =>
      verifyRenderProjectionParity(AUTHORITY, wrongMask, CONTRACT),
    ).toThrow(/dish mask differs/i)

    expect(() =>
      verifyRenderProjectionParity(
        AUTHORITY,
        { ...cloneProjection(base), simulationTimeHours: 1.5 },
        CONTRACT,
      ),
    ).toThrow(/simulationTimeHours/i)

    expect(() =>
      verifyRenderProjectionParity(
        AUTHORITY,
        { ...cloneProjection(base), samplingIdentity: 'wrong-branch' },
        CONTRACT,
      ),
    ).toThrow(/samplingIdentity/i)

    expect(() =>
      verifyRenderProjectionParity(
        AUTHORITY,
        { ...cloneProjection(base), snapshotId: 'wrong-snapshot' },
        CONTRACT,
      ),
    ).toThrow(/snapshotId/i)
  })
})
