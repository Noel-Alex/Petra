export interface GrowthParameters {
  /** Maximum division-biomass production rate (1 / time). Scenario-owned and provenance-required. */
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

export type SpatialDeathHazard = number | Float32Array | Float64Array

export interface LineageEcologyParameters {
  /** Dimensionless genotype/lineage fitness multiplier applied to division demand. */
  relativeFitness: number
  /**
   * First-order loss hazard (1 / time), either uniform or one value per grid cell.
   * The caller owns its mechanism/provenance; this kernel does not infer drug action.
   */
  deathHazardPerTime: SpatialDeathHazard
}

export interface EcologyFluxLedger {
  /**
   * Continuous biomass produced by division/growth per lineage and cell this step.
   * This is NOT an integer division-event count and must not be passed directly to
   * the exact mutation sampler.
   */
  divisionBiomass: Float64Array[]
  /** Continuous biomass removed by first-order loss per lineage and cell this step. */
  deathBiomass: Float64Array[]
}

export interface EcologyMetrics {
  divisionBiomass: number
  deathBiomass: number
  resourceConsumed: number
  totalBiomass: number
  occupiedCells: number
}

export interface EcologyStepResult {
  metrics: EcologyMetrics
  fluxes: EcologyFluxLedger
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be finite and non-negative`)
}

export function monod(resource: number, halfSaturation: number): number {
  finiteNonNegative('resource', resource)
  if (!Number.isFinite(halfSaturation) || halfSaturation <= 0) throw new Error('halfSaturation must be positive and finite')
  return resource === 0 ? 0 : resource / (halfSaturation + resource)
}

function deathHazardAt(hazard: SpatialDeathHazard, index: number): number {
  return typeof hazard === 'number' ? hazard : hazard[index]!
}

function validate(
  state: EcologyState,
  p: GrowthParameters,
  lineageParameters: readonly LineageEcologyParameters[],
  dt: number,
): void {
  if (!Number.isSafeInteger(state.width) || !Number.isSafeInteger(state.height) || state.width <= 0 || state.height <= 0) {
    throw new Error('invalid ecology dimensions')
  }

  const n = state.width * state.height
  if (state.mask.length !== n || state.resource.length !== n || state.lineages.some((lineage) => lineage.length !== n)) {
    throw new Error('ecology arrays must match grid dimensions')
  }
  if (lineageParameters.length !== state.lineages.length) {
    throw new Error('lineageParameters must contain one entry per lineage channel')
  }

  finiteNonNegative('dt', dt)
  finiteNonNegative('maxDivisionRate', p.maxDivisionRate)
  if (!Number.isFinite(p.halfSaturation) || p.halfSaturation <= 0) throw new Error('halfSaturation must be positive and finite')
  if (!Number.isFinite(p.biomassYield) || p.biomassYield <= 0) throw new Error('biomassYield must be positive and finite')
  if (!Number.isFinite(p.localCapacity) || p.localCapacity <= 0) throw new Error('localCapacity must be positive and finite')
  finiteNonNegative('spreadRate', p.spreadRate)
  if (p.spreadRate * dt > 0.25) {
    throw new Error('spreadRate * dt must be <= 0.25 for the four-neighbour explicit spread step')
  }

  for (let lineageIndex = 0; lineageIndex < lineageParameters.length; lineageIndex += 1) {
    const parameters = lineageParameters[lineageIndex]!
    finiteNonNegative(`relativeFitness[${lineageIndex}]`, parameters.relativeFitness)
    const hazard = parameters.deathHazardPerTime
    if (typeof hazard === 'number') {
      finiteNonNegative(`deathHazardPerTime[${lineageIndex}]`, hazard)
      if (!Number.isFinite(hazard * dt)) throw new Error(`deathHazardPerTime[${lineageIndex}] * dt must be finite`)
      continue
    }
    if (hazard.length !== n) {
      throw new Error(`deathHazardPerTime[${lineageIndex}] field must match grid dimensions`)
    }
    for (let index = 0; index < n; index += 1) {
      const value = hazard[index]!
      finiteNonNegative(`deathHazardPerTime[${lineageIndex}][${index}]`, value)
      if (!Number.isFinite(value * dt)) {
        throw new Error(`deathHazardPerTime[${lineageIndex}][${index}] * dt must be finite`)
      }
    }
  }
}

/**
 * Deterministic ecology flux step.
 *
 * Division demand and death loss are both computed from the same pre-step
 * lineage biomass. Shared resource/capacity limits then scale division biomass
 * proportionally across lineages, so iteration order cannot award first access.
 *
 * Death uses the exact constant-hazard survival fraction over the step:
 *   removed_fraction = 1 - exp(-hazard * dt)
 * which is bounded to [0, 1) for finite non-negative hazard and dt.
 *
 * The returned division ledger is continuous biomass production, not a count of
 * discrete birth events. A separate reviewed stochastic bridge must convert
 * aggregate division biomass into mutation-event opportunities when the chosen
 * population units make that conversion scientifically defined.
 */
export function stepEcology(
  state: EcologyState,
  p: GrowthParameters,
  lineageParameters: readonly LineageEcologyParameters[],
  dt: number,
): EcologyStepResult {
  validate(state, p, lineageParameters, dt)
  const n = state.width * state.height
  const lineageCount = state.lineages.length
  const divisionBiomass = Array.from({ length: lineageCount }, () => new Float64Array(n))
  const deathBiomass = Array.from({ length: lineageCount }, () => new Float64Array(n))

  let totalDivisionBiomass = 0
  let totalDeathBiomass = 0
  let resourceConsumed = 0

  for (let index = 0; index < n; index += 1) {
    if (state.mask[index] === 0) continue

    const resource = state.resource[index]!
    finiteNonNegative('resource concentration', resource)

    let biomass = 0
    for (let lineageIndex = 0; lineageIndex < lineageCount; lineageIndex += 1) {
      const amount = state.lineages[lineageIndex]![index]!
      finiteNonNegative('lineage biomass', amount)
      biomass += amount

      const hazard = deathHazardAt(lineageParameters[lineageIndex]!.deathHazardPerTime, index)
      const removedFraction = -Math.expm1(-hazard * dt)
      const removed = amount * removedFraction
      if (!Number.isFinite(removed) || removed < 0 || removed > amount) {
        throw new Error('death flux became invalid')
      }
      deathBiomass[lineageIndex]![index] = removed
      totalDeathBiomass += removed
    }

    if (resource === 0 || biomass === 0 || biomass >= p.localCapacity || dt === 0) continue

    const response = monod(resource, p.halfSaturation)
    let potential = 0
    for (let lineageIndex = 0; lineageIndex < lineageCount; lineageIndex += 1) {
      const amount = state.lineages[lineageIndex]![index]!
      const relativeFitness = lineageParameters[lineageIndex]!.relativeFitness
      const produced = amount * p.maxDivisionRate * relativeFitness * response * dt
      if (!Number.isFinite(produced) || produced < 0) throw new Error('division demand became invalid')
      divisionBiomass[lineageIndex]![index] = produced
      potential += produced
    }
    if (!Number.isFinite(potential)) throw new Error('total division demand became non-finite')
    if (potential === 0) continue

    const allowed = Math.min(potential, resource * p.biomassYield, p.localCapacity - biomass)
    const scale = allowed / potential
    for (let lineageIndex = 0; lineageIndex < lineageCount; lineageIndex += 1) {
      const channel = divisionBiomass[lineageIndex]!
      channel[index] = channel[index]! * scale
    }

    const consumed = allowed / p.biomassYield
    state.resource[index] = Math.max(0, resource - consumed)
    totalDivisionBiomass += allowed
    resourceConsumed += consumed
  }

  for (let lineageIndex = 0; lineageIndex < lineageCount; lineageIndex += 1) {
    const lineage = state.lineages[lineageIndex]!
    const births = divisionBiomass[lineageIndex]!
    const deaths = deathBiomass[lineageIndex]!
    for (let index = 0; index < n; index += 1) {
      lineage[index] = lineage[index]! + births[index]! - deaths[index]!
    }
  }

  if (p.spreadRate > 0 && dt > 0) spread(state, p.spreadRate * dt, p.localCapacity)

  let totalBiomass = 0
  let occupiedCells = 0
  for (let index = 0; index < n; index += 1) {
    if (state.mask[index] === 0) continue
    let local = 0
    for (const lineage of state.lineages) local += lineage[index]!
    totalBiomass += local
    if (local > 0) occupiedCells += 1
  }

  return {
    metrics: {
      divisionBiomass: totalDivisionBiomass,
      deathBiomass: totalDeathBiomass,
      resourceConsumed,
      totalBiomass,
      occupiedCells,
    },
    fluxes: { divisionBiomass, deathBiomass },
  }
}

/**
 * Conservative coarse colony-front spread with a strict local-capacity budget.
 *
 * Capacity is evaluated from the pre-spread snapshot. Every destination accepts
 * the same proportional fraction of all proposed incoming source/lineage flows;
 * rejected flux stays at its source. This keeps the operator conservative and
 * lineage-order independent without post-hoc clipping or hidden rerouting.
 *
 * This is still a coarse engineering/calibrated front-spread approximation,
 * not literal single-cell motility.
 */
function spread(
  state: EcologyState,
  fractionPerNeighbour: number,
  localCapacity: number,
): void {
  const { width, height, mask, lineages } = state
  const n = width * height
  const capacityTolerance = Math.max(1e-7, localCapacity * 1e-6)
  const lineageSources = lineages.map((lineage) => Float64Array.from(lineage))
  const localBiomass = new Float64Array(n)
  const proposedIncoming = new Float64Array(n)
  const acceptance = new Float64Array(n)
  const lineageScratch = new Float64Array(lineages.length)

  for (let index = 0; index < n; index += 1) {
    if (mask[index] === 0) continue
    const total = stableCellBiomass(lineageSources, index, lineageScratch)
    if (total > localCapacity + capacityTolerance) {
      throw new Error('pre-spread biomass exceeds localCapacity')
    }
    localBiomass[index] = total
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x
      if (mask[index] === 0 || localBiomass[index] === 0) continue
      const proposed = localBiomass[index]! * fractionPerNeighbour
      forEachNeighbour(width, height, mask, x, y, (neighbourIndex) => {
        proposedIncoming[neighbourIndex] =
          proposedIncoming[neighbourIndex]! + proposed
      })
    }
  }

  for (let index = 0; index < n; index += 1) {
    if (mask[index] === 0) continue
    const incoming = proposedIncoming[index]!
    if (incoming === 0) {
      acceptance[index] = 0
      continue
    }
    const freeCapacity = Math.max(0, localCapacity - localBiomass[index]!)
    acceptance[index] = Math.min(1, freeCapacity / incoming)
  }

  for (let lineageIndex = 0; lineageIndex < lineages.length; lineageIndex += 1) {
    const source = lineageSources[lineageIndex]!
    const outgoing = new Float64Array(n)
    const incoming = new Float64Array(n)

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = y * width + x
        const amount = source[index]!
        if (mask[index] === 0 || amount === 0) continue

        const proposed = amount * fractionPerNeighbour
        forEachNeighbour(width, height, mask, x, y, (neighbourIndex) => {
          const accepted = proposed * acceptance[neighbourIndex]!
          outgoing[index] = outgoing[index]! + accepted
          incoming[neighbourIndex] = incoming[neighbourIndex]! + accepted
        })
      }
    }

    const lineage = lineages[lineageIndex]!
    for (let index = 0; index < n; index += 1) {
      const sent = outgoing[index]!
      if (sent > source[index]! + capacityTolerance) {
        throw new Error('spread outgoing flux exceeds source biomass')
      }
      const next = source[index]! - sent + incoming[index]!
      if (!Number.isFinite(next) || next < -capacityTolerance) {
        throw new Error('spread produced invalid lineage biomass')
      }
      lineage[index] = next
    }
  }

  for (let index = 0; index < n; index += 1) {
    if (mask[index] === 0) continue
    const total = stableCellBiomass(
      lineages.map((lineage) => Float64Array.from(lineage)),
      index,
      lineageScratch,
    )
    if (total > localCapacity + capacityTolerance) {
      throw new Error('spread exceeded localCapacity')
    }
  }
}

function stableCellBiomass(
  lineages: readonly Float64Array[],
  index: number,
  scratch: Float64Array,
): number {
  for (let lineageIndex = 0; lineageIndex < lineages.length; lineageIndex += 1) {
    scratch[lineageIndex] = lineages[lineageIndex]![index]!
  }
  scratch.sort()

  let total = 0
  for (let lineageIndex = 0; lineageIndex < scratch.length; lineageIndex += 1) {
    total += scratch[lineageIndex]!
  }
  return total
}

function forEachNeighbour(
  width: number,
  height: number,
  mask: Uint8Array,
  x: number,
  y: number,
  visit: (index: number) => void,
): void {
  const neighbours = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ] as const

  for (const [nx, ny] of neighbours) {
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
    const neighbourIndex = ny * width + nx
    if (mask[neighbourIndex] === 0) continue
    visit(neighbourIndex)
  }
}
