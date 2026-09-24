/**
 * Numerical-only tolerance for summing non-negative Float32 lineage channels.
 *
 * A binary32 value rounded to nearest differs from its exact normal value by at
 * most 2^-24 relatively; subnormal values use an absolute half-ULP bound of
 * 2^-150. If the unrounded channel total was <= localCapacity, the stored
 * channel sum may therefore exceed it by at most this aggregate bound.
 *
 * This is storage/representation policy, not biological slack.
 */
const FLOAT32_UNIT_ROUNDOFF = 2 ** -24
const FLOAT32_HALF_MIN_SUBNORMAL = 2 ** -150

export function localCapacityRepresentationTolerance(
  localCapacity: number,
  lineageCount: number,
): number {
  if (!Number.isFinite(localCapacity) || localCapacity <= 0) {
    throw new Error('localCapacity must be positive and finite')
  }
  if (!Number.isSafeInteger(lineageCount) || lineageCount < 0) {
    throw new Error('lineageCount must be a non-negative safe integer')
  }

  return (
    localCapacity * FLOAT32_UNIT_ROUNDOFF +
    lineageCount * FLOAT32_HALF_MIN_SUBNORMAL
  )
}

export function assertLocalBiomassWithinCapacity(
  totalBiomass: number,
  localCapacity: number,
  lineageCount: number,
  context: string,
): void {
  if (!Number.isFinite(totalBiomass) || totalBiomass < 0) {
    throw new Error(context + ' total biomass must be finite and non-negative')
  }
  if (totalBiomass <= localCapacity) return

  const tolerance = localCapacityRepresentationTolerance(
    localCapacity,
    lineageCount,
  )
  const excess = totalBiomass - localCapacity
  if (excess > tolerance) {
    throw new Error(
      context +
        ' total biomass exceeds localCapacity beyond Float32 representation tolerance',
    )
  }
}
