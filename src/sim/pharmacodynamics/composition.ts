import {
  log10RateToNaturalPerHour,
  micShiftedRegoesResponse,
  prepareMicShiftedRegoes,
  preparedMicShiftedNetRateNaturalPerHour,
  type MicShiftedResponse,
  type PreparedMicShiftedRegoes,
  type RegoesPharmacodynamics,
} from './ciprofloxacin'

export const CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY = {
  id: 'reference_pd_decrement_as_first_order_loss_v1',
  classification: 'transferred_mechanistic_approximation',
  referencePharmacodynamicsSourceKey: 'regoes_2004',
  genotypePhenotypeSourceKey: 'marcusson_2009',
  genotypeShiftPolicy: 'mic_ratio_shift_reference_curve',
  limitation:
    'Resource-starvation interaction is a declared composition policy, not a source-matched stationary-phase calibration.',
} as const

export interface CiprofloxacinIncrementalLoss {
  readonly policyId: typeof CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.id
  readonly classification: typeof CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.classification
  readonly response: MicShiftedResponse
  /** psi_g(a) - psi_max after explicit log10 -> natural-rate conversion; non-positive. */
  readonly drugEffectNaturalPerHour: number
  /** Non-negative first-order loss hazard supplied to the ecology death channel. */
  readonly deathHazardPerHour: number
}

export interface GenotypeMicInput {
  readonly genotypeId: string
  readonly genotypeMic: number
}

export interface GenotypeDrugHazardField {
  readonly genotypeId: string
  readonly genotypeMic: number
  readonly deathHazardPerHour: Float64Array
}

export interface SpatialCiprofloxacinComposition {
  readonly policy: typeof CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY
  readonly fields: readonly GenotypeDrugHazardField[]
}

const LOSS_EPSILON = 1e-12

function deathHazardFromPrepared(
  concentration: number,
  prepared: PreparedMicShiftedRegoes,
  referenceNoDrugNaturalPerHour: number,
): number {
  const netRateNaturalPerHour = preparedMicShiftedNetRateNaturalPerHour(concentration, prepared)
  const hazard = referenceNoDrugNaturalPerHour - netRateNaturalPerHour
  if (!Number.isFinite(hazard) || hazard < -LOSS_EPSILON) {
    throw new Error('ciprofloxacin incremental loss became invalid')
  }
  return hazard <= 0 ? 0 : hazard
}

/**
 * Convert the genotype-shifted Regoes response into the flagship composition's
 * incremental loss relative to the reference drug-free state.
 *
 * h_drug(a) = ln(10) * [psi_max - psi_g(a)]
 *
 * The ecology kernel independently computes resource-limited positive division
 * biomass. This function supplies only the non-negative drug-associated loss
 * channel; it does not create mutation events or a new biological constant.
 */
export function ciprofloxacinIncrementalLoss(
  concentration: number,
  reference: RegoesPharmacodynamics,
  referenceMic: number,
  genotypeMic: number,
): CiprofloxacinIncrementalLoss {
  const prepared = prepareMicShiftedRegoes(reference, referenceMic, genotypeMic)
  const response = micShiftedRegoesResponse(concentration, reference, referenceMic, genotypeMic)
  const referenceNoDrugNaturalPerHour = log10RateToNaturalPerHour(prepared.psiMaxLog10PerHour)
  const deathHazardPerHour = deathHazardFromPrepared(
    concentration,
    prepared,
    referenceNoDrugNaturalPerHour,
  )

  return {
    policyId: CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.id,
    classification: CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY.classification,
    response,
    drugEffectNaturalPerHour: -deathHazardPerHour,
    deathHazardPerHour,
  }
}

/**
 * Build one authoritative spatial loss-hazard field per genotype from the same
 * masked concentration state consumed by the simulator. No renderer state is
 * involved and masked-out cells always receive zero loss hazard.
 */
export function composeSpatialCiprofloxacinLoss(
  concentration: Float32Array | Float64Array,
  mask: Uint8Array,
  reference: RegoesPharmacodynamics,
  referenceMic: number,
  genotypes: readonly GenotypeMicInput[],
): SpatialCiprofloxacinComposition {
  if (concentration.length !== mask.length) {
    throw new Error('concentration and mask arrays must have identical length')
  }

  const ids = new Set<string>()
  const prepared = genotypes.map((genotype) => {
    if (!genotype.genotypeId || ids.has(genotype.genotypeId)) {
      throw new Error('genotype IDs must be non-empty and unique')
    }
    ids.add(genotype.genotypeId)
    return {
      genotype,
      response: prepareMicShiftedRegoes(reference, referenceMic, genotype.genotypeMic),
      field: new Float64Array(concentration.length),
    }
  })

  const referenceNoDrugNaturalPerHour = log10RateToNaturalPerHour(reference.psiMaxLog10PerHour)

  for (let index = 0; index < concentration.length; index += 1) {
    const localConcentration = concentration[index]!
    if (!Number.isFinite(localConcentration) || localConcentration < 0) {
      throw new Error(`concentration[${index}] must be finite and non-negative`)
    }
    if (mask[index] !== 0 && mask[index] !== 1) {
      throw new Error(`mask[${index}] must be 0 or 1`)
    }
    if (mask[index] === 0) continue

    for (const item of prepared) {
      item.field[index] = deathHazardFromPrepared(
        localConcentration,
        item.response,
        referenceNoDrugNaturalPerHour,
      )
    }
  }

  return {
    policy: CIPROFLOXACIN_RESOURCE_COMPOSITION_POLICY,
    fields: prepared.map(({ genotype, field }) => ({
      genotypeId: genotype.genotypeId,
      genotypeMic: genotype.genotypeMic,
      deathHazardPerHour: field,
    })),
  }
}
