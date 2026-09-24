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

  // State arrays are caller-owned and mutable. Validate every in-domain value
  // before the step mutates resource or lineage channels so malformed input
  // cannot leave a partially applied scientific state behind after throwing.
  for (let index = 0; index < n; index += 1) {
    if (state.mask[index] === 0) continue
    finiteNonNegative('resource concentration', state.resource[index]!)
    for (let lineageIndex = 0; lineageIndex < state.lineages.length; lineageIndex += 1) {
      finiteNonNegative('lineage biomass', state.lineages[lineageIndex]![index]!)
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
  // Capacity reservation deliberately excludes same-step deaths: per the ecology
  // operator contract, loss does not create reusable growth/spread capacity until
  // the next step. Division biomass is added below as it is accepted.
  const capacityOccupancy = new Float64Array(n)

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
    capacityOccupancy[index] = biomass

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
    capacityOccupancy[index] = capacityOccupancy[index]! + allowed

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

  if (p.spreadRate > 0 && dt > 0) spread(state, p.spreadRate * dt, p.localCapacity, capacityOccupancy)

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

interface SpreadProposal {
  lineageIndex: number
  sourceIndex: number
  destinationIndex: number
  amount: number
}

/**
 * Conservative coarse colony-front spread. This is not single-cell motility.
 *
 * All source→destination proposals are formed from one frozen state. A
 * destination that cannot accept every proposal scales all incoming lineage and
 * source fluxes by the same factor. Rejected biomass therefore remains at its
 * source instead of being clipped, and no lineage receives first access merely
 * because its channel was iterated first.
 */
function spread(
  state: EcologyState,
  fractionPerNeighbour: number,
  localCapacity: number,
  capacityOccupancy: Float64Array,
): void {
  const { width, height, mask } = state
  const sources = state.lineages.map((lineage) => Float64Array.from(lineage))
  const incomingDemand = new Float64Array(mask.length)
  const proposals: SpreadProposal[] = []

  for (let lineageIndex = 0; lineageIndex < sources.length; lineageIndex += 1) {
    const source = sources[lineageIndex]!
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const sourceIndex = y * width + x
        if (mask[sourceIndex] === 0 || source[sourceIndex] === 0) continue
        const neighbours = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const
        for (const [nx, ny] of neighbours) {
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const destinationIndex = ny * width + nx
          if (mask[destinationIndex] === 0) continue
          const amount = source[sourceIndex]! * fractionPerNeighbour
          proposals.push({ lineageIndex, sourceIndex, destinationIndex, amount })
          incomingDemand[destinationIndex] = incomingDemand[destinationIndex]! + amount
        }
      }
    }
  }

  const acceptance = new Float64Array(mask.length)
  for (let index = 0; index < mask.length; index += 1) {
    const demand = incomingDemand[index]!
    if (demand === 0 || mask[index] === 0) continue
    const available = Math.max(0, localCapacity - capacityOccupancy[index]!)
    acceptance[index] = Math.min(1, available / demand)
  }

  const deltas = state.lineages.map((lineage) => new Float64Array(lineage.length))
  for (const proposal of proposals) {
    const accepted = proposal.amount * acceptance[proposal.destinationIndex]!
    const delta = deltas[proposal.lineageIndex]!
    delta[proposal.sourceIndex] = delta[proposal.sourceIndex]! - accepted
    delta[proposal.destinationIndex] = delta[proposal.destinationIndex]! + accepted
  }

  for (let lineageIndex = 0; lineageIndex < state.lineages.length; lineageIndex += 1) {
    const lineage = state.lineages[lineageIndex]!
    const source = sources[lineageIndex]!
    const delta = deltas[lineageIndex]!
    for (let index = 0; index < lineage.length; index += 1) {
      const next = source[index]! + delta[index]!
      if (!Number.isFinite(next) || next < 0) throw new Error('spread flux became invalid')
      lineage[index] = next
    }
  }
}
