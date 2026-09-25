import type { DishRenderSnapshot, RenderField } from '../src/render/model'
import type { ComposedSimulationSnapshot } from '../src/sim/protocol'

export const RENDER_PROJECTION_PARITY_SCHEMA_VERSION = 1 as const
export const RENDER_FLOAT32_STORAGE_POLICY =
  'math-fround-source-channels-and-fround-lineage-aggregate-v1' as const

export interface RenderProjectionAuthority {
  readonly traceHash: string
  readonly simulationTimeHours: number
  readonly width: number
  readonly height: number
  readonly mask: readonly number[]
  readonly resource: readonly number[]
  readonly ciprofloxacinConcentrationMgPerL: readonly number[]
  readonly lineages: readonly {
    readonly id: string
    readonly biomass: readonly number[]
  }[]
}

export interface RenderProjectionParityContract {
  readonly expectedSamplingIdentity: string
  readonly expectedSnapshotId?: string
  readonly resourceFieldId: string
  readonly ciprofloxacinFieldId: string
  readonly biomassFieldId: string
}

export interface QuantizationEvidence {
  readonly samples: number
  readonly maxAbsoluteError: number
  readonly maxRelativeError: number
}

export interface RenderProjectionParityEvidence {
  readonly schemaVersion: typeof RENDER_PROJECTION_PARITY_SCHEMA_VERSION
  readonly classification: 'render-projection-integrity-not-biological-validation'
  readonly sourceTraceHash: string
  readonly projectedSnapshotId: string
  readonly samplingIdentity: string
  readonly simulationTimeHours: number
  readonly grid: {
    readonly width: number
    readonly height: number
    readonly cells: number
  }
  readonly lineageIds: readonly string[]
  readonly fieldIds: {
    readonly resource: string
    readonly ciprofloxacin: string
    readonly biomass: string
  }
  readonly units: {
    readonly resource: 'model-resource'
    readonly ciprofloxacin: 'mg/L'
    readonly biomass: 'model-biomass'
  }
  readonly storagePolicy: typeof RENDER_FLOAT32_STORAGE_POLICY
  readonly exactChecks: {
    readonly dimensions: true
    readonly dishMask: true
    readonly simulationTime: true
    readonly samplingIdentity: true
    readonly lineageOrder: true
    readonly projectedFloat32Channels: true
    readonly aggregateFloat32Policy: true
  }
  readonly quantization: {
    readonly resource: QuantizationEvidence
    readonly ciprofloxacin: QuantizationEvidence
    readonly lineageBiomass: QuantizationEvidence
    readonly aggregateBiomassAgainstAuthoritativeSum: QuantizationEvidence
  }
  readonly exclusions: readonly [
    'render-field-transfer-domain-semantics',
    'spatial-event-footprint-semantics',
    'biological-validation',
  ]
}

export function renderProjectionAuthorityFromComposedSnapshot(
  snapshot: ComposedSimulationSnapshot,
): RenderProjectionAuthority {
  if (snapshot.checkpoint.authority !== 'composed') {
    throw new Error('render projection parity requires composed authority')
  }

  const state = snapshot.checkpoint.composedState
  if (
    state.lineageIds.length !== state.lineageBiomass.length ||
    state.lineageIds.length !== state.genotypeIds.length
  ) {
    throw new Error(
      'authoritative composed lineage/genotype/biomass channels must stay aligned',
    )
  }

  return {
    traceHash: snapshot.traceHash,
    simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
    width: state.width,
    height: state.height,
    mask: state.mask,
    resource: state.resource,
    ciprofloxacinConcentrationMgPerL:
      state.ciprofloxacinConcentrationMgPerL,
    lineages: state.lineageIds.map((id, index) => {
      const biomass = state.lineageBiomass[index]
      if (biomass === undefined) {
        throw new Error('missing authoritative lineage biomass for ' + id)
      }
      return { id, biomass }
    }),
  }
}

export function verifyRenderProjectionParity(
  authority: RenderProjectionAuthority,
  projected: DishRenderSnapshot,
  contract: RenderProjectionParityContract,
): RenderProjectionParityEvidence {
  assertNonEmpty('authority.traceHash', authority.traceHash)
  assertNonEmpty(
    'contract.expectedSamplingIdentity',
    contract.expectedSamplingIdentity,
  )
  assertNonEmpty('contract.resourceFieldId', contract.resourceFieldId)
  assertNonEmpty(
    'contract.ciprofloxacinFieldId',
    contract.ciprofloxacinFieldId,
  )
  assertNonEmpty('contract.biomassFieldId', contract.biomassFieldId)

  if (
    new Set([
      contract.resourceFieldId,
      contract.ciprofloxacinFieldId,
      contract.biomassFieldId,
    ]).size !== 3
  ) {
    throw new Error('render projection parity field ids must be distinct')
  }

  if (
    !Number.isSafeInteger(authority.width) ||
    !Number.isSafeInteger(authority.height) ||
    authority.width <= 0 ||
    authority.height <= 0
  ) {
    throw new Error('authoritative render grid dimensions must be positive safe integers')
  }
  const cells = authority.width * authority.height
  if (!Number.isSafeInteger(cells)) {
    throw new Error('authoritative render grid cell count must be a safe integer')
  }
  if (
    authority.mask.length !== cells ||
    authority.resource.length !== cells ||
    authority.ciprofloxacinConcentrationMgPerL.length !== cells
  ) {
    throw new Error('authoritative render channels must match the source grid')
  }
  if (
    !Number.isFinite(authority.simulationTimeHours) ||
    authority.simulationTimeHours < 0
  ) {
    throw new Error('authoritative simulation time must be finite and non-negative')
  }

  requireEqual(
    'projected gridWidth',
    projected.gridWidth,
    authority.width,
  )
  requireEqual(
    'projected gridHeight',
    projected.gridHeight,
    authority.height,
  )
  requireEqual(
    'projected simulationTimeHours',
    projected.simulationTimeHours,
    authority.simulationTimeHours,
  )
  requireEqual(
    'projected samplingIdentity',
    projected.samplingIdentity,
    contract.expectedSamplingIdentity,
  )
  if (contract.expectedSnapshotId !== undefined) {
    requireEqual(
      'projected snapshotId',
      projected.snapshotId,
      contract.expectedSnapshotId,
    )
  } else {
    assertNonEmpty('projected snapshotId', projected.snapshotId)
  }

  if (!(projected.dishMask instanceof Uint8Array)) {
    throw new Error('projected dishMask must use Uint8Array presentation storage')
  }
  requireEqual(
    'projected dishMask length',
    projected.dishMask.length,
    authority.mask.length,
  )
  for (let index = 0; index < authority.mask.length; index += 1) {
    const sourceValue = authority.mask[index]
    if (sourceValue !== 0 && sourceValue !== 1) {
      throw new Error(
        'authoritative dish mask contains a non-binary value at index ' +
          String(index),
      )
    }
    if (projected.dishMask[index] !== sourceValue) {
      throw new Error(
        'projected dish mask differs from authority at index ' +
          String(index),
      )
    }
  }

  if (projected.lineages.length !== authority.lineages.length) {
    throw new Error('projected lineage count differs from authority')
  }

  const expectedAggregate = new Float32Array(cells)
  const authoritativeAggregate = new Float64Array(cells)
  let lineageQuantization = emptyQuantization()

  for (let lineageIndex = 0; lineageIndex < authority.lineages.length; lineageIndex += 1) {
    const sourceLineage = authority.lineages[lineageIndex]
    const renderLineage = projected.lineages[lineageIndex]
    if (sourceLineage === undefined || renderLineage === undefined) {
      throw new Error('projected lineage ordering is incomplete')
    }
    requireEqual(
      'projected lineage id at index ' + String(lineageIndex),
      renderLineage.id,
      sourceLineage.id,
    )
    if (sourceLineage.biomass.length !== cells) {
      throw new Error(
        'authoritative lineage biomass does not match the source grid for ' +
          sourceLineage.id,
      )
    }

    const quantization = assertProjectedFloat32Channel(
      'lineage ' + sourceLineage.id + ' biomass',
      sourceLineage.biomass,
      renderLineage.density,
    )
    lineageQuantization = mergeQuantization(
      lineageQuantization,
      quantization,
    )

    for (let cell = 0; cell < cells; cell += 1) {
      const sourceValue = requireFiniteNonNegative(
        'authoritative lineage biomass',
        sourceLineage.biomass[cell],
      )
      const projectedLineageValue = Math.fround(sourceValue)
      authoritativeAggregate[cell] += sourceValue
      expectedAggregate[cell] = Math.fround(
        expectedAggregate[cell] + projectedLineageValue,
      )
    }
  }

  assertExactFloat32Channel(
    'aggregate biomass',
    expectedAggregate,
    projected.biomass,
  )

  const resourceField = requireField(
    projected,
    contract.resourceFieldId,
    'nutrient',
    'model-resource',
  )
  const ciprofloxacinField = requireField(
    projected,
    contract.ciprofloxacinFieldId,
    'antibiotic',
    'mg/L',
  )
  const biomassField = requireField(
    projected,
    contract.biomassFieldId,
    'biomass',
    'model-biomass',
  )

  const resourceQuantization = assertProjectedFloat32Channel(
    'model resource',
    authority.resource,
    resourceField.values,
  )
  const ciprofloxacinQuantization = assertProjectedFloat32Channel(
    'ciprofloxacin concentration',
    authority.ciprofloxacinConcentrationMgPerL,
    ciprofloxacinField.values,
  )
  assertExactFloat32Channel(
    'biomass field',
    projected.biomass,
    biomassField.values,
  )

  const aggregateQuantization = quantizationAgainstFloat32(
    authoritativeAggregate,
    expectedAggregate,
  )

  return {
    schemaVersion: RENDER_PROJECTION_PARITY_SCHEMA_VERSION,
    classification: 'render-projection-integrity-not-biological-validation',
    sourceTraceHash: authority.traceHash,
    projectedSnapshotId: projected.snapshotId,
    samplingIdentity: projected.samplingIdentity,
    simulationTimeHours: projected.simulationTimeHours,
    grid: {
      width: projected.gridWidth,
      height: projected.gridHeight,
      cells,
    },
    lineageIds: authority.lineages.map((lineage) => lineage.id),
    fieldIds: {
      resource: resourceField.id,
      ciprofloxacin: ciprofloxacinField.id,
      biomass: biomassField.id,
    },
    units: {
      resource: 'model-resource',
      ciprofloxacin: 'mg/L',
      biomass: 'model-biomass',
    },
    storagePolicy: RENDER_FLOAT32_STORAGE_POLICY,
    exactChecks: {
      dimensions: true,
      dishMask: true,
      simulationTime: true,
      samplingIdentity: true,
      lineageOrder: true,
      projectedFloat32Channels: true,
      aggregateFloat32Policy: true,
    },
    quantization: {
      resource: resourceQuantization,
      ciprofloxacin: ciprofloxacinQuantization,
      lineageBiomass: lineageQuantization,
      aggregateBiomassAgainstAuthoritativeSum: aggregateQuantization,
    },
    exclusions: [
      'render-field-transfer-domain-semantics',
      'spatial-event-footprint-semantics',
      'biological-validation',
    ],
  }
}

function requireField(
  snapshot: DishRenderSnapshot,
  id: string,
  kind: RenderField['kind'],
  unit: string,
): RenderField {
  const matches = snapshot.fields.filter((field) => field.id === id)
  if (matches.length !== 1) {
    throw new Error(
      'render projection must contain exactly one field with id ' + id,
    )
  }
  const field = matches[0]
  if (field === undefined) {
    throw new Error('missing render field ' + id)
  }
  requireEqual('render field kind for ' + id, field.kind, kind)
  requireEqual('render field unit for ' + id, field.unit, unit)
  requireEqual('render field width for ' + id, field.width, snapshot.gridWidth)
  requireEqual(
    'render field height for ' + id,
    field.height,
    snapshot.gridHeight,
  )
  return field
}

function assertProjectedFloat32Channel(
  name: string,
  source: ArrayLike<number>,
  projected: Float32Array,
): QuantizationEvidence {
  if (!(projected instanceof Float32Array)) {
    throw new Error(name + ' must use Float32Array presentation storage')
  }
  requireEqual(name + ' length', projected.length, source.length)

  let maxAbsoluteError = 0
  let maxRelativeError = 0
  for (let index = 0; index < source.length; index += 1) {
    const sourceValue = requireFiniteNonNegative(name, source[index])
    const expected = Math.fround(sourceValue)
    if (!Number.isFinite(expected)) {
      throw new Error(
        name + ' does not fit finite Float32 storage at index ' + String(index),
      )
    }
    if (projected[index] !== expected) {
      throw new Error(
        name +
          ' differs from explicit Float32 projection at index ' +
          String(index),
      )
    }
    const absoluteError = Math.abs(sourceValue - expected)
    maxAbsoluteError = Math.max(maxAbsoluteError, absoluteError)
    if (sourceValue !== 0) {
      maxRelativeError = Math.max(
        maxRelativeError,
        absoluteError / Math.abs(sourceValue),
      )
    }
  }

  return {
    samples: source.length,
    maxAbsoluteError,
    maxRelativeError,
  }
}

function assertExactFloat32Channel(
  name: string,
  expected: Float32Array,
  actual: Float32Array,
): void {
  if (!(actual instanceof Float32Array)) {
    throw new Error(name + ' must use Float32Array presentation storage')
  }
  requireEqual(name + ' length', actual.length, expected.length)
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(
        name + ' differs at index ' + String(index),
      )
    }
  }
}

function quantizationAgainstFloat32(
  source: ArrayLike<number>,
  projected: Float32Array,
): QuantizationEvidence {
  requireEqual('quantization source length', source.length, projected.length)
  let maxAbsoluteError = 0
  let maxRelativeError = 0
  for (let index = 0; index < source.length; index += 1) {
    const sourceValue = requireFiniteNonNegative(
      'authoritative aggregate biomass',
      source[index],
    )
    const projectedValue = requireFiniteNonNegative(
      'projected aggregate biomass',
      projected[index],
    )
    const absoluteError = Math.abs(sourceValue - projectedValue)
    maxAbsoluteError = Math.max(maxAbsoluteError, absoluteError)
    if (sourceValue !== 0) {
      maxRelativeError = Math.max(
        maxRelativeError,
        absoluteError / Math.abs(sourceValue),
      )
    }
  }
  return {
    samples: source.length,
    maxAbsoluteError,
    maxRelativeError,
  }
}

function emptyQuantization(): QuantizationEvidence {
  return {
    samples: 0,
    maxAbsoluteError: 0,
    maxRelativeError: 0,
  }
}

function mergeQuantization(
  left: QuantizationEvidence,
  right: QuantizationEvidence,
): QuantizationEvidence {
  return {
    samples: left.samples + right.samples,
    maxAbsoluteError: Math.max(
      left.maxAbsoluteError,
      right.maxAbsoluteError,
    ),
    maxRelativeError: Math.max(
      left.maxRelativeError,
      right.maxRelativeError,
    ),
  }
}

function requireFiniteNonNegative(
  name: string,
  value: number | undefined,
): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    throw new Error(name + ' must be finite and non-negative')
  }
  return value
}

function assertNonEmpty(name: string, value: string): void {
  if (value.trim() === '') {
    throw new Error(name + ' must be non-empty')
  }
}

function requireEqual(
  name: string,
  actual: string | number,
  expected: string | number,
): void {
  if (actual !== expected) {
    throw new Error(
      name +
        ' mismatch: expected ' +
        JSON.stringify(expected) +
        ', received ' +
        JSON.stringify(actual),
    )
  }
}
