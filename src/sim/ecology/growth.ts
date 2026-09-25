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
export interface EcologyInterphaseStep {
  /**
   * Local division/death fluxes computed from the pre-step lineage state.
   * Callers may read these to perform a conservative cohort reassignment before
   * spread, but must not mutate the ledger.
   */
  readonly fluxes: EcologyFluxLedger
  /** Local-step metrics that are invariant to conservative cohort reassignment. */
  readonly localMetrics: Readonly<
    Pick<
      EcologyMetrics,
      'divisionBiomass' | 'deathBiomass' | 'resourceConsumed'
    >
  >
}

interface EcologyInterphaseInternal {
  readonly state: EcologyState
  readonly width: number
  readonly height: number
  readonly maskAfterLocal: Uint8Array
  readonly resourceAfterLocal: Float32Array
  readonly totalBiomassAfterLocal: Float64Array
  readonly lineageCountAfterLocal: number
  readonly capacityOccupancy: Float64Array
  readonly spreadFractionPerNeighbour: number
  readonly localCapacity: number
}

const ecologyInterphaseInternals = new WeakMap<
  EcologyInterphaseStep,
  EcologyInterphaseInternal
>()

/**
 * Execute the local ecology operator through the births-minus-deaths commit,
 * stopping immediately before coarse spatial spread.
 *
 * The returned token is opaque and one-shot. Between begin/complete, a higher
 * authority may only conservatively reassign already-committed biomass among
 * lineage channels. Mask, resource, dimensions, and per-cell total biomass are
 * guarded by `completeEcologyStep(...)`.
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
  const divisionBiomass = Array.from(
    { length: lineageCount },
    () => new Float64Array(n),
  )
  const deathBiomass = Array.from(
    { length: lineageCount },
    () => new Float64Array(n),
  )
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
    for (
      let lineageIndex = 0;
      lineageIndex < lineageCount;
      lineageIndex += 1
    ) {
      const amount = state.lineages[lineageIndex]![index]!
      finiteNonNegative('lineage biomass', amount)
      biomass += amount

      const hazard = deathHazardAt(
        lineageParameters[lineageIndex]!.deathHazardPerTime,
        index,
      )
      const removedFraction = -Math.expm1(-hazard * dt)
      const removed = amount * removedFraction
      if (!Number.isFinite(removed) || removed < 0 || removed > amount) {
        throw new Error('death flux became invalid')
      }
      deathBiomass[lineageIndex]![index] = removed
      totalDeathBiomass += removed
    }
    capacityOccupancy[index] = biomass

    if (
      resource === 0 ||
      biomass === 0 ||
      biomass >= p.localCapacity ||
      dt === 0
    ) {
      continue
    }

    const response = monod(resource, p.halfSaturation)
    let potential = 0
    for (
      let lineageIndex = 0;
      lineageIndex < lineageCount;
      lineageIndex += 1
    ) {
      const amount = state.lineages[lineageIndex]![index]!
      const relativeFitness =
        lineageParameters[lineageIndex]!.relativeFitness
      const produced =
        amount * p.maxDivisionRate * relativeFitness * response * dt
      if (!Number.isFinite(produced) || produced < 0) {
        throw new Error('division demand became invalid')
      }
      divisionBiomass[lineageIndex]![index] = produced
      potential += produced
    }
    if (!Number.isFinite(potential)) {
      throw new Error('total division demand became non-finite')
    }
    if (potential === 0) continue

    const allowed = Math.min(
      potential,
      resource * p.biomassYield,
      p.localCapacity - biomass,
    )
    const scale = allowed / potential
    for (
      let lineageIndex = 0;
      lineageIndex < lineageCount;
      lineageIndex += 1
    ) {
      const channel = divisionBiomass[lineageIndex]!
      channel[index] = channel[index]! * scale
    }
    capacityOccupancy[index] = capacityOccupancy[index]! + allowed

    const consumed = allowed / p.biomassYield
    state.resource[index] = Math.max(0, resource - consumed)
    totalDivisionBiomass += allowed
    resourceConsumed += consumed
  }

  for (
    let lineageIndex = 0;
    lineageIndex < lineageCount;
    lineageIndex += 1
  ) {
    const lineage = state.lineages[lineageIndex]!
    const births = divisionBiomass[lineageIndex]!
    const deaths = deathBiomass[lineageIndex]!
    for (let index = 0; index < n; index += 1) {
      lineage[index] = lineage[index]! + births[index]! - deaths[index]!
    }
  }

  const totalBiomassAfterLocal = new Float64Array(n)
  for (let index = 0; index < n; index += 1) {
    if (state.mask[index] === 0) continue
    let total = 0
    for (const lineage of state.lineages) total += lineage[index]!
    totalBiomassAfterLocal[index] = total
  }

  const interphase = Object.freeze({
    fluxes: Object.freeze({ divisionBiomass, deathBiomass }),
    localMetrics: Object.freeze({
      divisionBiomass: totalDivisionBiomass,
      deathBiomass: totalDeathBiomass,
      resourceConsumed,
    }),
  }) satisfies EcologyInterphaseStep

  ecologyInterphaseInternals.set(interphase, {
    state,
    width: state.width,
    height: state.height,
    maskAfterLocal: state.mask.slice(),
    resourceAfterLocal: state.resource.slice(),
    totalBiomassAfterLocal,
    lineageCountAfterLocal: state.lineages.length,
    capacityOccupancy,
    spreadFractionPerNeighbour: p.spreadRate * dt,
    localCapacity: p.localCapacity,
  })

  return interphase
}

/**
 * Complete one ecology step after an optional conservative lineage-cohort
 * reassignment. The token must come from `beginEcologyStep(...)` for the exact
 * same state object and may be consumed only once.
 */
export function completeEcologyStep(
  state: EcologyState,
  interphase: EcologyInterphaseStep,
): EcologyStepResult {
  const internal = ecologyInterphaseInternals.get(interphase)
  if (internal === undefined) {
    throw new Error('invalid or already-completed ecology interphase token')
  }
  if (internal.state !== state) {
    throw new Error('ecology interphase token belongs to a different state')
  }

  validateEcologyInterphaseContinuation(state, internal)
  ecologyInterphaseInternals.delete(interphase)

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
  const n = state.width * state.height
  for (let index = 0; index < n; index += 1) {
    if (state.mask[index] === 0) continue
    let local = 0
    for (const lineage of state.lineages) local += lineage[index]!
    totalBiomass += local
    if (local > 0) occupiedCells += 1
  }

  return {
    metrics: {
      divisionBiomass: interphase.localMetrics.divisionBiomass,
      deathBiomass: interphase.localMetrics.deathBiomass,
      resourceConsumed: interphase.localMetrics.resourceConsumed,
      totalBiomass,
      occupiedCells,
    },
    fluxes: interphase.fluxes,
  }
}

function validateEcologyInterphaseContinuation(
  state: EcologyState,
  internal: EcologyInterphaseInternal,
): void {
  if (
    state.width !== internal.width ||
    state.height !== internal.height ||
    !Number.isSafeInteger(state.width) ||
    !Number.isSafeInteger(state.height) ||
    state.width <= 0 ||
    state.height <= 0
  ) {
    throw new Error('ecology dimensions changed during interphase')
  }

  const n = state.width * state.height
  if (
    state.mask.length !== n ||
    state.resource.length !== n ||
    state.lineages.some((lineage) => lineage.length !== n)
  ) {
    throw new Error('ecology arrays changed shape during interphase')
  }

  const lineageCount = state.lineages.length
  for (let index = 0; index < n; index += 1) {
    if (state.mask[index] !== internal.maskAfterLocal[index]) {
      throw new Error('ecology mask changed during interphase')
    }
    if (state.resource[index] !== internal.resourceAfterLocal[index]) {
      throw new Error('ecology resource changed during interphase')
    }

    let total = 0
    for (
      let lineageIndex = 0;
      lineageIndex < lineageCount;
      lineageIndex += 1
    ) {
      const amount = state.lineages[lineageIndex]![index]!
      finiteNonNegative('interphase lineage biomass', amount)
      if (state.mask[index] === 0 && amount !== 0) {
        throw new Error(
          `lineage biomass must remain zero outside ecology mask at cell ${index}`,
        )
      }
      total += amount
    }

    assertEcologyLocalCapacity(
      total,
      internal.localCapacity,
      lineageCount,
      index,
    )

    const expected = internal.totalBiomassAfterLocal[index]!
    const channels = Math.max(
      1,
      internal.lineageCountAfterLocal,
      lineageCount,
    )
    const referenceMagnitude = Math.max(expected, total)
    const conservationTolerance = Math.max(
      referenceMagnitude * FLOAT32_RELATIVE_SPACING * channels,
      FLOAT32_MIN_SUBNORMAL * channels,
    )
    if (Math.abs(total - expected) > conservationTolerance) {
      throw new Error(
        `ecology interphase must conserve total biomass at cell ${index}`,
      )
    }
  }
}

/**
 * Compatibility wrapper for callers that do not need a cohort-reassignment
 * interphase. Its operator order and numerical outputs remain begin → no-op →
 * complete.
 */
export function stepEcology(
  state: EcologyState,
  p: GrowthParameters,
  lineageParameters: readonly LineageEcologyParameters[],
  dt: number,
): EcologyStepResult {
  const interphase = beginEcologyStep(state, p, lineageParameters, dt)
  return completeEcologyStep(state, interphase)
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
