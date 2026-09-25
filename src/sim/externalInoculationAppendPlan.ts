import {
  validateComposedStateAgainstConfig,
  type ComposedSimulationConfig,
  type ComposedSimulationState,
} from './authoritative'
import {
  resolveExternalInoculationAdmission,
  type ExternalInoculationAdmission,
} from './externalInoculationAdmission'
import {
  assertExternalInoculationPlacementWithinGrid,
  type ExternalInoculationIntervention,
} from './externalInoculationIntervention'
import {
  appendExternalInoculationRuntimeLineageEcologyAuthorityV1,
  migrateLegacyRuntimeLineageEcologyAuthorityV1,
  type RuntimeLineageEcologyAuthorityV1,
  type RuntimeLineageEcologyBaselineRecordV1,
} from './evolution/runtimeLineageEcologyAuthority'
import {
  appendRuntimeLineageOriginV2,
  migrateLineageRegistryCheckpointV1ToOriginV2,
  type LineageOriginCheckpointV2,
} from './evolution/lineageOriginCheckpoint'
import type { RunIdentity } from './protocol'
import { requireFiniteNonNegativeFloat32 } from './spatial/field'
import {
  extendRuntimeLineageTaxonMap,
  type RuntimeLineageTaxonMap,
} from './taxonIdentity'

export const EXTERNAL_INOCULATION_APPEND_PLAN_SCHEMA_VERSION = 1 as const

export interface ExternalInoculationBiomassAppend {
  readonly unit: 'model-biomass'
  readonly value: number
  readonly cellIndex: number
  readonly channel: readonly number[]
}

export interface ExternalInoculationAppendPlan {
  readonly schemaVersion:
    typeof EXTERNAL_INOCULATION_APPEND_PLAN_SCHEMA_VERSION
  readonly admission: ExternalInoculationAdmission
  readonly lineageId: string
  readonly lineageChannelIndex: number
  readonly genotypeId: string
  readonly taxonId: string
  readonly taxonContentVersion: string
  readonly createdAtHours: number
  readonly originCellIndex: number
  readonly biomass: ExternalInoculationBiomassAppend
  /**
   * Prospective v2 lineage/replay authority only. Live composed checkpoints
   * remain lineage-registry v1 until #1057 deliberately adopts this schema.
   */
  readonly lineageOriginCheckpoint: LineageOriginCheckpointV2
  /**
   * Prospective #1075 ecology-baseline target aligned to the same future lineage
   * creation order. This is not live ComposedSimulationState authority yet.
   */
  readonly lineageEcologyAuthority: RuntimeLineageEcologyAuthorityV1
  readonly lineageEcologyRecord: RuntimeLineageEcologyBaselineRecordV1
  readonly lineageTaxonMap: RuntimeLineageTaxonMap
}

export interface PlanExternalInoculationAppendArgs {
  readonly identity: RunIdentity
  readonly config: ComposedSimulationConfig
  readonly state: ComposedSimulationState
  readonly intervention: ExternalInoculationIntervention
  /** Exact accepted biological time at which the future command would apply. */
  readonly createdAtHours: number
}

/**
 * Prepare, but do not publish, every currently-known aligned channel needed by
 * a future external-inoculation transaction.
 *
 * This is intentionally a planning seam while live composed checkpoints still
 * carry LineageRegistryCheckpoint v1. It validates current composed authority,
 * exact support admission, exact in-mask placement, deterministic future
 * lineage allocation through the reviewed v2 target, replay-safe ecology
 * baseline authority, taxon alignment, and canonical Float32 biomass storage.
 *
 * It does not mutate state, consume RNG, create a Worker/protocol event, change
 * command position, infer population counts, or make v2 lineage origin live.
 */
export function planExternalInoculationAppend(
  args: PlanExternalInoculationAppendArgs,
): ExternalInoculationAppendPlan {
  validateComposedStateAgainstConfig(args.state, args.config)

  const admission = resolveExternalInoculationAdmission(args.intervention, {
    identity: args.identity,
    config: args.config,
  })

  assertExternalInoculationPlacementWithinGrid(args.intervention, {
    width: args.state.width,
    height: args.state.height,
    mask: args.state.mask,
  })

  if (!Number.isFinite(args.createdAtHours) || args.createdAtHours < 0) {
    throw new RangeError(
      'external inoculation creation time must be finite and non-negative',
    )
  }
  if (args.state.discretePopulation !== null) {
    throw new Error(
      'external inoculation append planning requires discrete population authority to be disabled',
    )
  }

  const configuredFounderCount = args.config.lineages.length
  const currentOriginCheckpoint =
    migrateLineageRegistryCheckpointV1ToOriginV2({
      checkpoint: args.state.lineageRegistry,
      configuredFounderCount,
    })

  const currentEcologyAuthority =
    migrateLegacyRuntimeLineageEcologyAuthorityV1({
      originCheckpoint: currentOriginCheckpoint,
      configuredLineages: args.config.lineages,
      legacyBaselineDeathHazardPerHour:
        args.state.baselineDeathHazardPerHour,
      dynamicLossPolicy: args.config.dynamicLineageLossPolicy,
    })

  const { x, y } = args.intervention.placement
  const originCellIndex = y * args.state.width + x
  const allocated = appendRuntimeLineageOriginV2(currentOriginCheckpoint, {
    originKind: 'external-inoculation',
    parentLineageId: null,
    genotypeId: admission.lineageDefinition.genotypeId,
    createdAtHours: args.createdAtHours,
    originCellIndex,
    mutationClass: null,
  })

  if (allocated.record.lineageId !== `L${args.state.lineageIds.length + 1}`) {
    throw new Error(
      'external inoculation lineage allocator is not aligned with composed lineage channel order',
    )
  }
  if (args.state.lineageIds.includes(allocated.record.lineageId)) {
    throw new Error('external inoculation allocator produced a duplicate lineage id')
  }

  const lineageEcologyAuthority =
    appendExternalInoculationRuntimeLineageEcologyAuthorityV1({
      authority: currentEcologyAuthority,
      originCheckpoint: allocated.checkpoint,
      configuredLineages: args.config.lineages,
      dynamicLossPolicy: args.config.dynamicLineageLossPolicy,
      admittedLineageDefinition: admission.lineageDefinition,
    })
  const lineageEcologyRecord = lineageEcologyAuthority.records.at(-1)
  if (
    lineageEcologyRecord === undefined ||
    lineageEcologyRecord.lineageId !== allocated.record.lineageId
  ) {
    throw new Error(
      'external inoculation ecology authority is not aligned with allocated lineage identity',
    )
  }

  const taxonRegistry = args.config.taxonRegistry
  const currentTaxonMap = args.state.lineageTaxonMap
  if (taxonRegistry === undefined || currentTaxonMap === undefined) {
    throw new Error(
      'external inoculation append planning requires exact runtime taxon authority',
    )
  }
  const lineageTaxonMap = extendRuntimeLineageTaxonMap({
    current: currentTaxonMap,
    registry: taxonRegistry,
    appended: [
      {
        lineageId: allocated.record.lineageId,
        taxonId: admission.lineageDefinition.taxonId,
      },
    ],
  })
  const appendedTaxonIndex = lineageTaxonMap.lineageIds.length - 1
  if (
    lineageTaxonMap.taxonContentVersions[appendedTaxonIndex] !==
    admission.lineageDefinition.taxonContentVersion
  ) {
    throw new Error(
      'external inoculation appended taxon content version drifted from admitted authority',
    )
  }

  const storedBiomass = requireFiniteNonNegativeFloat32(
    'external inoculation planned biomass',
    args.intervention.biomass.value,
  )
  if (storedBiomass <= 0) {
    throw new Error('external inoculation planned biomass must be positive')
  }
  const biomassChannel = new Array<number>(
    args.state.width * args.state.height,
  ).fill(0)
  biomassChannel[originCellIndex] = storedBiomass

  const biomass = Object.freeze({
    unit: 'model-biomass' as const,
    value: storedBiomass,
    cellIndex: originCellIndex,
    channel: Object.freeze(biomassChannel),
  })

  return Object.freeze({
    schemaVersion: EXTERNAL_INOCULATION_APPEND_PLAN_SCHEMA_VERSION,
    admission,
    lineageId: allocated.record.lineageId,
    lineageChannelIndex: args.state.lineageIds.length,
    genotypeId: admission.lineageDefinition.genotypeId,
    taxonId: admission.lineageDefinition.taxonId,
    taxonContentVersion: admission.lineageDefinition.taxonContentVersion,
    createdAtHours: args.createdAtHours,
    originCellIndex,
    biomass,
    lineageOriginCheckpoint: allocated.checkpoint,
    lineageEcologyAuthority,
    lineageEcologyRecord,
    lineageTaxonMap,
  })
}
