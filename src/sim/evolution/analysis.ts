import type { ComposedSimulationCheckpoint } from '../protocol'
import type { CuratedMutationGraph } from './graph'
import { relativeFitnessForGenotype } from './graph'
import type { LineageRegistryCheckpoint } from './lineage'

export const LINEAGE_ANALYSIS_SCHEMA_VERSION = 1 as const

export interface CiprofloxacinGenotypeAnalysisEvidence {
  readonly micMgPerL: number
  readonly responseShift: {
    readonly referenceGenotypeId: string
    readonly micRatio: number
  } | null
}

export interface GenotypeAnalysisEvidence {
  readonly genotypeId: string
  readonly label: string
  readonly ciprofloxacin?: CiprofloxacinGenotypeAnalysisEvidence
  readonly sourceKeys: readonly string[]
  readonly assumptionKeys: readonly string[]
}

export interface AuthoritativeLineageAnalysisRecord {
  readonly lineageId: string
  readonly parentLineageId: string | null
  readonly genotypeId: string
  readonly genotypeLabel: string
  readonly createdAtHours: number
  readonly extinctAtHours: number | null
  readonly originCellIndex: number | null
  readonly mutationClass: string | null
  readonly status: 'extant' | 'extinct'
  readonly abundanceModelBiomass: number
  readonly relativeFitness: number
  readonly ciprofloxacin?: CiprofloxacinGenotypeAnalysisEvidence | null
  readonly sourceKeys: readonly string[]
  readonly assumptionKeys: readonly string[]
}

export interface AuthoritativeLineageAnalysis {
  readonly schemaVersion: typeof LINEAGE_ANALYSIS_SCHEMA_VERSION
  readonly identity: ComposedSimulationCheckpoint['identity']
  readonly configurationFingerprint: string
  readonly simulationTimeHours: number
  readonly records: readonly AuthoritativeLineageAnalysisRecord[]
}

function canonicalText(name: string, value: string): void {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error(`${name} must be a canonical non-empty string`)
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
}

/**
 * Join replay-critical lineage ancestry with one exact composed checkpoint.
 *
 * This is an authority projection, not a UI tree layout. It deliberately does
 * not infer phenotype, resistance, MIC, or source claims from genotype names.
 * Those facts must arrive through explicit versioned evidence records.
 */
export function projectAuthoritativeLineageAnalysis(args: {
  readonly checkpoint: ComposedSimulationCheckpoint
  readonly lineageRegistry: LineageRegistryCheckpoint
  readonly evolutionGraph: CuratedMutationGraph
  readonly genotypeEvidence: readonly GenotypeAnalysisEvidence[]
}): AuthoritativeLineageAnalysis {
  const { checkpoint, lineageRegistry, evolutionGraph } = args
  const state = checkpoint.composedState

  if (lineageRegistry.version !== 1) {
    throw new Error('unsupported lineage registry checkpoint version')
  }
  if (
    evolutionGraph.scenarioId !== checkpoint.identity.scenarioId ||
    evolutionGraph.scenarioVersion !== checkpoint.identity.scenarioVersion
  ) {
    throw new Error('lineage analysis evolution scenario does not match run identity')
  }
  if (
    state.lineageIds.length !== state.genotypeIds.length ||
    state.lineageIds.length !== state.lineageBiomass.length
  ) {
    throw new Error('composed lineage identity channels must stay aligned')
  }

  const evidenceByGenotype = new Map<string, GenotypeAnalysisEvidence>()
  for (let index = 0; index < args.genotypeEvidence.length; index += 1) {
    if (!(index in args.genotypeEvidence)) {
      throw new Error('genotype analysis evidence must be a dense array')
    }
    const evidence = args.genotypeEvidence[index]!
    canonicalText(`genotype evidence[${index}].genotypeId`, evidence.genotypeId)
    canonicalText(`genotype evidence[${index}].label`, evidence.label)
    if (evidenceByGenotype.has(evidence.genotypeId)) {
      throw new Error(`duplicate genotype analysis evidence: ${evidence.genotypeId}`)
    }
    const validateKeys = (name: string, keys: readonly string[]): string[] => {
      if (!Array.isArray(keys)) throw new Error(`${name} must be an array`)
      const seen = new Set<string>()
      return keys.map((key, keyIndex) => {
        if (!(keyIndex in keys)) throw new Error(`${name} must be dense`)
        canonicalText(`${name}[${keyIndex}]`, key)
        if (seen.has(key)) throw new Error(`${name} contains duplicate key: ${key}`)
        seen.add(key)
        return key
      })
    }
    let ciprofloxacin: CiprofloxacinGenotypeAnalysisEvidence | undefined
    if (evidence.ciprofloxacin !== undefined) {
      const phenotype = evidence.ciprofloxacin
      if (!Number.isFinite(phenotype.micMgPerL) || phenotype.micMgPerL <= 0) {
        throw new Error(`genotype evidence ${evidence.genotypeId} ciprofloxacin MIC must be finite and positive`)
      }
      if (phenotype.responseShift !== null) {
        canonicalText(
          `genotype evidence ${evidence.genotypeId} response reference genotype`,
          phenotype.responseShift.referenceGenotypeId,
        )
        if (
          !Number.isFinite(phenotype.responseShift.micRatio) ||
          phenotype.responseShift.micRatio <= 0
        ) {
          throw new Error(
            `genotype evidence ${evidence.genotypeId} response MIC ratio must be finite and positive`,
          )
        }
      }
      ciprofloxacin = {
        micMgPerL: phenotype.micMgPerL,
        responseShift:
          phenotype.responseShift === null
            ? null
            : { ...phenotype.responseShift },
      }
    }

    evidenceByGenotype.set(evidence.genotypeId, {
      genotypeId: evidence.genotypeId,
      label: evidence.label,
      ciprofloxacin,
      sourceKeys: validateKeys(
        `genotype evidence ${evidence.genotypeId} sourceKeys`,
        evidence.sourceKeys,
      ),
      assumptionKeys: validateKeys(
        `genotype evidence ${evidence.genotypeId} assumptionKeys`,
        evidence.assumptionKeys,
      ),
    })
  }

  const abundanceByLineage = new Map<string, number>()
  for (let index = 0; index < state.lineageIds.length; index += 1) {
    const lineageId = state.lineageIds[index]!
    const genotypeId = state.genotypeIds[index]!
    canonicalText(`composed lineage id at index ${index}`, lineageId)
    canonicalText(`composed genotype id at index ${index}`, genotypeId)
    if (abundanceByLineage.has(lineageId)) {
      throw new Error(`duplicate composed lineage id: ${lineageId}`)
    }

    const metric = checkpoint.metrics.lineageBiomass[lineageId]
    if (metric === undefined) {
      throw new Error(`checkpoint is missing lineage biomass metric for ${lineageId}`)
    }
    finiteNonNegative(`lineage biomass for ${lineageId}`, metric)
    abundanceByLineage.set(lineageId, metric)
  }

  const recordsById = new Map(
    lineageRegistry.records.map((record) => [record.lineageId, record] as const),
  )
  if (recordsById.size !== lineageRegistry.records.length) {
    throw new Error('lineage registry contains duplicate lineage ids')
  }

  for (let index = 0; index < state.lineageIds.length; index += 1) {
    const lineageId = state.lineageIds[index]!
    const record = recordsById.get(lineageId)
    if (record === undefined) {
      throw new Error(`active composed lineage is absent from lineage registry: ${lineageId}`)
    }
    if (record.genotypeId !== state.genotypeIds[index]) {
      throw new Error(`lineage genotype mismatch for ${lineageId}`)
    }
    if (record.extinctAtHours !== null) {
      throw new Error(`extinct lineage remains active in composed state: ${lineageId}`)
    }
  }

  const projected = lineageRegistry.records.map((record, index) => {
    canonicalText(`lineageRegistry.records[${index}].lineageId`, record.lineageId)
    canonicalText(`lineageRegistry.records[${index}].genotypeId`, record.genotypeId)
    finiteNonNegative(
      `lineageRegistry.records[${index}].createdAtHours`,
      record.createdAtHours,
    )
    if (record.createdAtHours > checkpoint.simulationTimeHours) {
      throw new Error(`lineage ${record.lineageId} was created after checkpoint time`)
    }
    if (record.extinctAtHours !== null) {
      finiteNonNegative(
        `lineageRegistry.records[${index}].extinctAtHours`,
        record.extinctAtHours,
      )
      if (record.extinctAtHours > checkpoint.simulationTimeHours) {
        throw new Error(`lineage ${record.lineageId} extinction is after checkpoint time`)
      }
    }

    const evidence = evidenceByGenotype.get(record.genotypeId)
    if (evidence === undefined) {
      throw new Error(`missing genotype analysis evidence for ${record.genotypeId}`)
    }
    const activeBiomass = abundanceByLineage.get(record.lineageId)
    if (record.extinctAtHours === null && activeBiomass === undefined) {
      throw new Error(`extant lineage is absent from composed abundance state: ${record.lineageId}`)
    }
    if (
      record.extinctAtHours !== null &&
      activeBiomass !== undefined &&
      activeBiomass !== 0
    ) {
      throw new Error(`extinct lineage has non-zero composed abundance: ${record.lineageId}`)
    }

    return Object.freeze({
      lineageId: record.lineageId,
      parentLineageId: record.parentLineageId,
      genotypeId: record.genotypeId,
      genotypeLabel: evidence.label,
      createdAtHours: record.createdAtHours,
      extinctAtHours: record.extinctAtHours,
      originCellIndex: record.originCellIndex,
      mutationClass: record.mutationClass,
      status: record.extinctAtHours === null ? 'extant' : 'extinct',
      abundanceModelBiomass: activeBiomass ?? 0,
      relativeFitness: relativeFitnessForGenotype(
        evolutionGraph,
        record.genotypeId,
      ),
      ciprofloxacin:
        evidence.ciprofloxacin === undefined
          ? null
          : {
              micMgPerL: evidence.ciprofloxacin.micMgPerL,
              responseShift:
                evidence.ciprofloxacin.responseShift === null
                  ? null
                  : { ...evidence.ciprofloxacin.responseShift },
            },
      sourceKeys: [...evidence.sourceKeys],
      assumptionKeys: [...evidence.assumptionKeys],
    }) satisfies AuthoritativeLineageAnalysisRecord
  })

  return Object.freeze({
    schemaVersion: LINEAGE_ANALYSIS_SCHEMA_VERSION,
    identity: structuredClone(checkpoint.identity),
    configurationFingerprint: state.configurationFingerprint,
    simulationTimeHours: checkpoint.simulationTimeHours,
    records: Object.freeze(projected),
  })
}
