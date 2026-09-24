/**
 * One relative spacing for IEEE-754 binary32 values at a given magnitude.
 *
 * Ecology biomass channels are stored in Float32Array. This tolerance is a
 * numerical representation allowance only; it is not biological capacity
 * slack and must never be used to admit deliberate over-capacity state.
 */
export const FLOAT32_RELATIVE_SPACING = 2 ** -23

/** Smallest positive binary32 subnormal value. */
export const FLOAT32_MIN_SUBNORMAL = 2 ** -149

export function ecologyCapacityRepresentationTolerance(
  localCapacity: number,
  lineageCount: number,
): number {
  positiveFinite('localCapacity', localCapacity)
  if (!Number.isSafeInteger(lineageCount) || lineageCount < 0) {
    throw new Error('lineageCount must be a non-negative safe integer')
  }

  const relativeSpacing = localCapacity * FLOAT32_RELATIVE_SPACING
  // Near zero, binary32 spacing is absolute rather than relative. Summing
  // non-negative channels can accumulate at most one minimum-subnormal-sized
  // representation unit per channel under this conservative envelope.
  const subnormalEnvelope =
    Math.max(1, lineageCount) * FLOAT32_MIN_SUBNORMAL

  return Math.max(relativeSpacing, subnormalEnvelope)
}

export function assertEcologyLocalCapacity(
  totalBiomass: number,
  localCapacity: number,
  lineageCount: number,
  cellIndex?: number,
): void {
  finiteNonNegative('totalBiomass', totalBiomass)
  const tolerance = ecologyCapacityRepresentationTolerance(
    localCapacity,
    lineageCount,
  )
  const excess = totalBiomass - localCapacity

  if (excess > tolerance) {
    const suffix =
      cellIndex === undefined ? '' : ` at cell ${cellIndex}`
    throw new Error(
      `ecology biomass exceeds localCapacity beyond Float32 representation tolerance${suffix}`,
    )
  }
}

function positiveFinite(name: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`)
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
}
