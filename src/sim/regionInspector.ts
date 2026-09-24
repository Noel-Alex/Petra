import type { ComposedSimulationState } from './authoritative'

/**
 * A presentation-independent circular query in normalized dish coordinates.
 * Coordinates address the full simulation grid: (0,0) is its top-left edge and
 * (1,1) its bottom-right edge. Grid arrays are cell-centred finite volumes.
 */
export interface NormalizedRegionSelection {
  readonly id: string
  readonly centerX: number
  readonly centerY: number
  readonly radius: number
}

export interface RegionLineageBiomass {
  readonly lineageId: string
  readonly biomass: number
  readonly fractionOfRegionBiomass: number
}

interface AuthoritativeRegionInspectionIdentity {
  readonly selectionId: string
  readonly stateVersion: number
  readonly configurationFingerprint: string
}

export interface MeasuredAuthoritativeRegionInspection
  extends AuthoritativeRegionInspectionIdentity {
  readonly kind: 'measured'
  readonly selectedCellCount: number
  readonly totalBiomass: number
  readonly totalResource: number
  readonly biomassUnit: 'model-biomass'
  readonly resourceUnit: 'model-resource'
  readonly lineageBiomass: readonly RegionLineageBiomass[]
}

export interface NoGridCoverageRegionInspection
  extends AuthoritativeRegionInspectionIdentity {
  readonly kind: 'no-grid-coverage'
}

export type AuthoritativeRegionInspection =
  | MeasuredAuthoritativeRegionInspection
  | NoGridCoverageRegionInspection

function assertUnitInterval(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`${name} must be finite and within [0, 1]`)
  }
}

function validateSelection(selection: NormalizedRegionSelection): void {
  if (selection.id.trim().length === 0) {
    throw new Error('region selection id must be non-empty')
  }
  assertUnitInterval('region centerX', selection.centerX)
  assertUnitInterval('region centerY', selection.centerY)
  if (!Number.isFinite(selection.radius) || selection.radius <= 0 || selection.radius > 1) {
    throw new Error('region radius must be finite and within (0, 1]')
  }
}

/**
 * Returns authoritative grid cells whose cell centres lie inside the circular
 * selection. The simulation mask is respected: outside-dish cells never enter
 * an inspection. This helper never reads renderer snapshots or glyphs.
 */
export function selectedRegionCellIndices(
  state: Pick<ComposedSimulationState, 'width' | 'height' | 'mask'>,
  selection: NormalizedRegionSelection,
): number[] {
  validateSelection(selection)
  if (!Number.isSafeInteger(state.width) || !Number.isSafeInteger(state.height) || state.width <= 0 || state.height <= 0) {
    throw new Error('region inspection requires positive safe grid dimensions')
  }
  const cellCount = state.width * state.height
  if (!Number.isSafeInteger(cellCount) || state.mask.length !== cellCount) {
    throw new Error('region inspection mask must match grid dimensions')
  }

  const radiusSquared = selection.radius * selection.radius
  const indices: number[] = []
  for (let row = 0; row < state.height; row += 1) {
    const y = (row + 0.5) / state.height
    for (let column = 0; column < state.width; column += 1) {
      const index = row * state.width + column
      if (state.mask[index] !== 1) continue
      const x = (column + 0.5) / state.width
      const dx = x - selection.centerX
      const dy = y - selection.centerY
      if (dx * dx + dy * dy <= radiusSquared) indices.push(index)
    }
  }
  return indices
}

/**
 * Projects a region directly from authoritative composed state. Values retain
 * the engine's current abstract model units; this function deliberately does
 * not reinterpret biomass as cell count, concentration, area, or renderer
 * density. A later physical-units scenario may replace these labels only when
 * its authoritative state defines that bridge.
 */
export function inspectAuthoritativeRegion(
  state: ComposedSimulationState,
  selection: NormalizedRegionSelection,
): AuthoritativeRegionInspection {
  const indices = selectedRegionCellIndices(state, selection)
  if (state.resource.length !== state.width * state.height) {
    throw new Error('region inspection resource field must match grid dimensions')
  }
  if (state.lineageIds.length !== state.lineageBiomass.length) {
    throw new Error('region inspection lineage ids/channels must align')
  }
  if (state.lineageBiomass.some((channel) => channel.length !== state.width * state.height)) {
    throw new Error('region inspection lineage fields must match grid dimensions')
  }

  const identity: AuthoritativeRegionInspectionIdentity = {
    selectionId: selection.id,
    stateVersion: state.version,
    configurationFingerprint: state.configurationFingerprint,
  }

  if (indices.length === 0) {
    return {
      ...identity,
      kind: 'no-grid-coverage',
    }
  }

  const lineageTotals = state.lineageBiomass.map((channel) =>
    indices.reduce((sum, index) => sum + (channel[index] ?? 0), 0),
  )
  const totalBiomass = lineageTotals.reduce((sum, value) => sum + value, 0)
  const totalResource = indices.reduce((sum, index) => sum + (state.resource[index] ?? 0), 0)

  return {
    ...identity,
    kind: 'measured',
    selectedCellCount: indices.length,
    totalBiomass,
    totalResource,
    biomassUnit: 'model-biomass',
    resourceUnit: 'model-resource',
    lineageBiomass: state.lineageIds.map((lineageId, index) => ({
      lineageId,
      biomass: lineageTotals[index] ?? 0,
      fractionOfRegionBiomass: totalBiomass > 0 ? (lineageTotals[index] ?? 0) / totalBiomass : 0,
    })),
  }
}
