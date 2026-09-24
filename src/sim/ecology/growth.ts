export interface GrowthParameters {
  /** Maximum division rate (1 / time). Scenario-owned and provenance-required. */
  maxDivisionRate: number
  /** Monod half-saturation resource concentration, same units as resource[]. */
  halfSaturation: number
  /** Biomass produced per resource unit consumed. */
  biomassYield: number
  /** Maximum total biomass represented by one spatial cell. */
  localCapacity: number
  /** Fraction moved to each available neighbour per unit time. Engineering/calibrated. */
  spreadRate: number
}

export interface EcologyState {
  width: number
  height: number
  mask: Uint8Array
  resource: Float32Array
  /** One dense biomass channel per active lineage. */
  lineages: Float32Array[]
}

export interface EcologyMetrics {
  divisions: number
  resourceConsumed: number
  totalBiomass: number
  occupiedCells: number
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`)
}

export function monod(resource: number, halfSaturation: number): number {
  finiteNonNegative('resource', resource)
  if (!Number.isFinite(halfSaturation) || halfSaturation <= 0) throw new Error('halfSaturation must be positive and finite')
  return resource === 0 ? 0 : resource / (halfSaturation + resource)
}

function validate(state: EcologyState, p: GrowthParameters, dt: number): void {
  if (!Number.isSafeInteger(state.width) || !Number.isSafeInteger(state.height) || state.width <= 0 || state.height <= 0) throw new Error('invalid ecology dimensions')
  const n = state.width * state.height
  if (state.mask.length !== n || state.resource.length !== n || state.lineages.some((x) => x.length !== n)) throw new Error('ecology arrays must match grid dimensions')
  finiteNonNegative('dt', dt)
  finiteNonNegative('maxDivisionRate', p.maxDivisionRate)
  if (!Number.isFinite(p.halfSaturation) || p.halfSaturation <= 0) throw new Error('halfSaturation must be positive and finite')
  if (!Number.isFinite(p.biomassYield) || p.biomassYield <= 0) throw new Error('biomassYield must be positive and finite')
  if (!Number.isFinite(p.localCapacity) || p.localCapacity <= 0) throw new Error('localCapacity must be positive and finite')
  finiteNonNegative('spreadRate', p.spreadRate)
  if (p.spreadRate * dt > 0.25) throw new Error('spreadRate * dt must be <= 0.25 for the four-neighbour explicit spread step')
}

/**
 * Deterministic ecological step used before stochastic mutation is layered on.
 * Potential lineage growth is computed from one shared pre-step state, then scaled
 * proportionally when either resource or local capacity is limiting. This makes
 * shared-resource allocation independent of lineage iteration order.
 */
export function stepEcology(state: EcologyState, p: GrowthParameters, dt: number): EcologyMetrics {
  validate(state, p, dt)
  const n = state.width * state.height
  const lineageCount = state.lineages.length
  const growth = Array.from({ length: lineageCount }, () => new Float64Array(n))
  let divisions = 0
  let resourceConsumed = 0

  for (let i = 0; i < n; i += 1) {
    if (state.mask[i] === 0) continue
    const resource = state.resource[i]!
    finiteNonNegative('resource concentration', resource)
    let biomass = 0
    for (const lineage of state.lineages) {
      const amount = lineage[i]!
      finiteNonNegative('lineage biomass', amount)
      biomass += amount
    }
    if (resource === 0 || biomass === 0 || biomass >= p.localCapacity || dt === 0) continue

    const response = monod(resource, p.halfSaturation)
    let potential = 0
    for (let l = 0; l < lineageCount; l += 1) {
      const amount = state.lineages[l]![i]!
      const g = amount * p.maxDivisionRate * response * dt
      growth[l]![i] = g
      potential += g
    }
    if (potential === 0) continue

    const allowed = Math.min(potential, resource * p.biomassYield, p.localCapacity - biomass)
    const scale = allowed / potential
    for (let l = 0; l < lineageCount; l += 1) {
      const channel = growth[l]!
      channel[i] = channel[i]! * scale
    }
    const consumed = allowed / p.biomassYield
    state.resource[i] = Math.max(0, resource - consumed)
    divisions += allowed
    resourceConsumed += consumed
  }

  for (let l = 0; l < lineageCount; l += 1) {
    const lineage = state.lineages[l]!
    const delta = growth[l]!
    for (let i = 0; i < n; i += 1) lineage[i] = lineage[i]! + delta[i]!
  }

  if (p.spreadRate > 0 && dt > 0) spread(state, p.spreadRate * dt)

  let totalBiomass = 0
  let occupiedCells = 0
  for (let i = 0; i < n; i += 1) {
    if (state.mask[i] === 0) continue
    let local = 0
    for (const lineage of state.lineages) local += lineage[i]!
    totalBiomass += local
    if (local > 0) occupiedCells += 1
  }
  return { divisions, resourceConsumed, totalBiomass, occupiedCells }
}

/** Conservative coarse colony-front spread. This is not single-cell motility. */
function spread(state: EcologyState, fractionPerNeighbour: number): void {
  const { width, height, mask } = state
  for (const lineage of state.lineages) {
    const source = Float64Array.from(lineage)
    const delta = new Float64Array(lineage.length)
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const i = y * width + x
        if (mask[i] === 0 || source[i] === 0) continue
        const neighbours = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const
        for (const [nx, ny] of neighbours) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const j = ny * width + nx
          if (mask[j] === 0) continue
          const moved = source[i]! * fractionPerNeighbour
          delta[i] = delta[i]! - moved
          delta[j] = delta[j]! + moved
        }
      }
    }
    for (let i = 0; i < lineage.length; i += 1) lineage[i] = Math.max(0, source[i]! + delta[i]!)
  }
}
