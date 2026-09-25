import type {
  ComposedLineageConfig,
  ComposedSimulationConfig,
} from './authoritative'
import {
  assertExternalInoculationIntervention,
  type ExternalInoculationIntervention,
} from './externalInoculationIntervention'
import {
  assertComposedParameterSetBinding,
  sameComposedParameterSetBinding,
  type ComposedParameterSetBinding,
} from './parameterSetBinding'
import type { RunIdentity } from './protocol'
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
  type AuthoritativeTaxonIdentity,
} from './taxonIdentity'

export const EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION = 1 as const

export interface ExternalInoculationAdmissionSource {
  readonly identity: RunIdentity
  readonly config: ComposedSimulationConfig
}

export interface AdmittedExternalInoculationLineageDefinition {
  readonly id: string
  readonly genotypeId: string
  readonly taxonId: string
  readonly taxonContentVersion: string
  readonly baselineGrowthRateScale?: number
  readonly deathHazardPerHour: number
}

export interface ExternalInoculationAdmission {
  readonly schemaVersion: typeof EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly parameterSetBinding: Readonly<ComposedParameterSetBinding>
  readonly lineageDefinition: Readonly<AdmittedExternalInoculationLineageDefinition>
  readonly taxon: Readonly<AuthoritativeTaxonIdentity>
}

/**
 * Resolve a structurally valid external-inoculation payload against exact
 * composed scenario authority before any lineage allocation or state mutation.
 *
 * V1 deliberately admits only a static lineage definition already owned by the
 * exact active composed config. It does not authorize cross-scenario mixing,
 * infer biology from taxon/genotype labels, or convert model biomass into a
 * discrete population quantity.
 */
export function resolveExternalInoculationAdmission(
  intervention: ExternalInoculationIntervention,
  source: ExternalInoculationAdmissionSource,
): ExternalInoculationAdmission {
  assertExternalInoculationIntervention(intervention)

  if (source.config.populationAuthority !== null) {
    throw new Error(
      'external inoculation v1 requires populationAuthority null until a calibrated inoculum population quantity bridge exists',
    )
  }

  const registry = source.config.taxonRegistry
  if (registry === undefined) {
    throw new Error(
      'external inoculation requires an authoritative taxon registry',
    )
  }
  if (
    registry.schemaVersion !== AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION
  ) {
    throw new Error('unsupported external inoculation taxon registry version')
  }
  const canonicalRegistry = createAuthoritativeTaxonRegistry(registry.taxa)

  assertComposedParameterSetBinding(source.identity, source.config)
  const sourceBinding = source.identity.parameterSetBinding
  if (sourceBinding.authority !== 'provenance') {
    throw new Error(
      'external inoculation source requires a provenance parameter-set binding',
    )
  }

  const authority = intervention.authority
  if (
    source.identity.scenarioId !== authority.scenarioId ||
    source.identity.scenarioVersion !== authority.scenarioVersion
  ) {
    throw new Error(
      'external inoculation authority must match the active scenario identity',
    )
  }
  if (
    !sameComposedParameterSetBinding(
      sourceBinding,
      authority.parameterSetBinding,
    )
  ) {
    throw new Error(
      'external inoculation authority must match the active parameter-set binding',
    )
  }

  if (!Array.isArray(source.config.lineages)) {
    throw new Error('external inoculation source lineages must be an array')
  }
  const matchingLineages: ComposedLineageConfig[] = []
  for (let index = 0; index < source.config.lineages.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(source.config.lineages, index)) {
      throw new Error('external inoculation source lineages must be dense')
    }
    const lineage = source.config.lineages[index]!
    if (lineage.id === authority.lineageDefinitionId) {
      matchingLineages.push(lineage)
    }
  }
  if (matchingLineages.length !== 1) {
    throw new Error(
      'external inoculation lineage definition must resolve exactly once in the active composed config',
    )
  }

  const lineage = matchingLineages[0]!
  if (lineage.genotypeId !== authority.genotypeId) {
    throw new Error(
      'external inoculation genotype does not match the resolved lineage definition',
    )
  }
  if (
    lineage.taxonId === undefined ||
    lineage.taxonContentVersion === undefined
  ) {
    throw new Error(
      'external inoculation lineage definition requires exact taxon authority',
    )
  }
  if (
    lineage.taxonId !== authority.taxonId ||
    lineage.taxonContentVersion !== authority.taxonContentVersion
  ) {
    throw new Error(
      'external inoculation taxon identity does not match the resolved lineage definition',
    )
  }

  const taxon = canonicalRegistry.taxa.find(
    (candidate) => candidate.id === authority.taxonId,
  )
  if (taxon === undefined) {
    throw new Error(
      'external inoculation taxon is absent from the authoritative taxon registry',
    )
  }
  if (taxon.contentVersion !== authority.taxonContentVersion) {
    throw new Error(
      'external inoculation taxon content version does not match the authoritative registry',
    )
  }

  const parameterSetBinding = Object.freeze({
    schemaVersion: sourceBinding.schemaVersion,
    authority: sourceBinding.authority,
    parameterSetId: sourceBinding.parameterSetId,
    parameterSetVersion: sourceBinding.parameterSetVersion,
    configurationFingerprint: sourceBinding.configurationFingerprint,
  })

  const lineageDefinition: AdmittedExternalInoculationLineageDefinition =
    Object.freeze({
      id: lineage.id,
      genotypeId: lineage.genotypeId,
      taxonId: lineage.taxonId,
      taxonContentVersion: lineage.taxonContentVersion,
      ...(lineage.baselineGrowthRateScale === undefined
        ? {}
        : { baselineGrowthRateScale: lineage.baselineGrowthRateScale }),
      deathHazardPerHour: lineage.deathHazardPerHour,
    })

  return Object.freeze({
    schemaVersion: EXTERNAL_INOCULATION_ADMISSION_SCHEMA_VERSION,
    scenarioId: source.identity.scenarioId,
    scenarioVersion: source.identity.scenarioVersion,
    parameterSetBinding,
    lineageDefinition,
    taxon,
  })
}
