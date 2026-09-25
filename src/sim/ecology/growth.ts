import {
  FLOAT32_MIN_SUBNORMAL,
  FLOAT32_RELATIVE_SPACING,
  assertEcologyLocalCapacity,
} from './capacity'

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

  // State arrays are caller-owned and mutable. Validate the complete scientific
  // domain before the step mutates resource or lineage channels so malformed
  // input cannot leave a partially applied state behind after throwing.
  //
  // The dish mask is binary authority, not a truthy/falsy presentation hint:
  // exactly 1 is in-domain and exactly 0 is outside the simulation domain.
  // Off-mask scientific channels must remain exactly zero, matching the
  // composed-state authority boundary rather than silently hiding caller data.
  for (let index = 0; index < n; index += 1) {
    const maskValue = state.mask[index]!
    if (maskValue !== 0 && maskValue !== 1) {
      throw new Error(`ecology mask must be binary 0 or 1 at cell ${index}`)
    }

    const resource = state.resource[index]!
    if (maskValue === 0) {
      if (resource !== 0) {
        throw new Error(
          `resource must be zero outside ecology mask at cell ${index}`,
        )
      }
      for (let lineageIndex = 0; lineageIndex < state.lineages.length; lineageIndex += 1) {
        if (state.lineages[lineageIndex]![index]! !== 0) {
          throw new Error(
            `lineage biomass must be zero outside ecology mask at cell ${index}`,
          )
        }
      }
      continue
    }

    finiteNonNegative('resource concentration', resource)
    let totalBiomass = 0
    for (let lineageIndex = 0; lineageIndex < state.lineages.length; lineageIndex += 1) {
      const amount = state.lineages[lineageIndex]![index]!
      finiteNonNegative('lineage biomass', amount)
      totalBiomass += amount
    }
    assertEcologyLocalCapacity(
      totalBiomass,
      p.localCapacity,
      state.lineages.length,
      index,
    )
  }
}

/**
 * Opaque handoff between the local ecology flux phase and conservative spread.
 *
 * Higher-level composition may use this boundary only to reassign already
 * produced lineage biomass between cohort channels (for example parent→child
 * mutation materialization). Resource, mask, dimensions, and total biomass per
 * spatial cell remain fixed across the interphase.
 */
export interface EcologyInterphaseStep {
  readonly fluxes: EcologyFluxLedger
}

interface EcologyInterphaseInternal {
  state: EcologyState
  width: number
  height: number
  maskAfterLocal: Uint8Array
  resourceAfterLocal: Float32Array
  postLocalBiomass: Float64Array
  capacityOccupancy: Float64Array
  localCapacity: number
  spreadFractionPerNeighbour: number
  originalLineageCount: number
  divisionBiomass: number
  deathBiomass: number
  resourceConsumed: number
  completed: boolean
}

const ecologyInterphaseInternals = new WeakMap<
  EcologyInterphaseStep,
  EcologyInterphaseInternal
>()

/**
 * Execute the validated local growth/death/resource phase without spatial
 * spread. Division demand and death loss are both computed from the same
 * pre-step lineage biomass. Shared resource/capacity limits then scale division
 * biomass proportionally across lineages, so iteration order cannot award first
 * access.
 *
 * The returned division ledger is continuous biomass production, not a count of
 * discrete birth events. Higher-level mutation composition must consume the
 * reviewed discrete opportunities from populationAuthority.ts instead.
 *
 * This function mutates the supplied state through the local flux commit. A
 * caller that can refuse during its interphase must therefore run the full
 * begin/interphase/complete transaction on detached authoritative state, as the
 * composed runtime does for mutating commands.
 */
export function beginEcologyStep(
  state: EcologyState,
  p: GrowthParameters,
  lineageParameters: readonly LineageEcologyParameters[],
  dt: number,
): EcologyInterphaseStep {
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

  const postLocalBiomass = new Float64Array(n)
  for (let index = 0; index < n; index += 1) {
    if (state.mask[index] === 0) continue
    let local = 0
    for (const lineage of state.lineages) local += lineage[index]!
    postLocalBiomass[index] = local
  }

  const step: EcologyInterphaseStep = {
    fluxes: { divisionBiomass, deathBiomass },
  }
  ecologyInterphaseInternals.set(step, {
    state,
    width: state.width,
    height: state.height,
    maskAfterLocal: state.mask.slice(),
    resourceAfterLocal: state.resource.slice(),
    postLocalBiomass,
    capacityOccupancy,
    localCapacity: p.localCapacity,
    spreadFractionPerNeighbour: p.spreadRate * dt,
    originalLineageCount: lineageCount,
    divisionBiomass: totalDivisionBiomass,
    deathBiomass: totalDeathBiomass,
    resourceConsumed,
    completed: false,
  })
  return step
}

function validateEcologyInterphase(
  state: EcologyState,
  internal: EcologyInterphaseInternal,
): void {
  if (state !== internal.state) {
    throw new Error('ecology interphase step must complete against its originating state')
  }
  if (state.width !== internal.width || state.height !== internal.height) {
    throw new Error('ecology dimensions cannot change during interphase')
  }

  const n = internal.width * internal.height
  if (state.mask.length !== n || state.resource.length !== n) {
    throw new Error('ecology arrays must match grid dimensions during interphase')
  }
  if (state.lineages.some((lineage) => lineage.length !== n)) {
    throw new Error('lineage arrays must match grid dimensions during interphase')
  }

  for (let index = 0; index < n; index += 1) {
    if (state.mask[index] !== internal.maskAfterLocal[index]) {
      throw new Error(`ecology mask cannot change during interphase at cell ${index}`)
    }
    if (state.resource[index] !== internal.resourceAfterLocal[index]) {
      throw new Error(`ecology resource cannot change during interphase at cell ${index}`)
    }

    let totalBiomass = 0
    for (let lineageIndex = 0; lineageIndex < state.lineages.length; lineageIndex += 1) {
      const amount = state.lineages[lineageIndex]![index]!
      finiteNonNegative(`interphase lineage biomass[${lineageIndex}][${index}]`, amount)
      if (state.mask[index] === 0 && amount !== 0) {
        throw new Error(`lineage biomass must remain zero outside ecology mask at cell ${index}`)
      }
      totalBiomass += amount
    }

    assertEcologyLocalCapacity(
      totalBiomass,
      internal.localCapacity,
      state.lineages.length,
      index,
    )

    const expected = internal.postLocalBiomass[index]!
    const channels = Math.max(
      1,
      internal.originalLineageCount,
      state.lineages.length,
    )
    const referenceMagnitude = Math.max(expected, totalBiomass)
    const representationTolerance = Math.max(
      referenceMagnitude * FLOAT32_RELATIVE_SPACING * channels,
      FLOAT32_MIN_SUBNORMAL * channels,
    )
    if (Math.abs(totalBiomass - expected) > representationTolerance) {
      throw new Error(
        `ecology interphase must conserve total biomass at cell ${index} within Float32 representation tolerance`,
      )
    }
  }
}

/**
 * Complete a previously started ecology step after an optional conservative
 * lineage-cohort reassignment. The local resource state and total biomass in
 * each spatial cell are checked before spread, and the pre-step capacity
 * reservation is reused so same-step deaths still do not free spread capacity.
 */
export function completeEcologyStep(
  state: EcologyState,
  step: EcologyInterphaseStep,
): EcologyStepResult {
  const internal = ecologyInterphaseInternals.get(step)
  if (internal === undefined) {
    throw new Error('unknown ecology interphase step')
  }
  if (internal.completed) {
    throw new Error('ecology interphase step has already been completed')
  }

  validateEcologyInterphase(state, internal)
  internal.completed = true

  if (internal.spreadFractionPerNeighbour > 0) {
    spread(
      state,
      internal.spreadFractionPerNeighbour,
      internal.localCapacity,
      internal.capacityOccupancy,
    )
  }

  let totalBiomass = 0
  let occupiedCells = 0
  for (let index = 0; index < state.mask.length; index += 1) {
    if (state.mask[index] === 0) continue
    let local = 0
    for (const lineage of state.lineages) local += lineage[index]!
    totalBiomass += local
    if (local > 0) occupiedCells += 1
  }

  return {
    metrics: {
      divisionBiomass: internal.divisionBiomass,
      deathBiomass: internal.deathBiomass,
      resourceConsumed: internal.resourceConsumed,
      totalBiomass,
      occupiedCells,
    },
    fluxes: step.fluxes,
  }
}

/**
 * Deterministic ecology compatibility wrapper. With no interphase cohort
 * reassignment this executes the same local flux commit followed immediately by
 * the same conservative spread operator.
 */
export function stepEcology(
  state: EcologyState,
  p: GrowthParameters,
  lineageParameters: readonly LineageEcologyParameters[],
  dt: number,
): EcologyStepResult {
  const step = beginEcologyStep(state, p, lineageParameters, dt)
  return completeEcologyStep(state, step)
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
