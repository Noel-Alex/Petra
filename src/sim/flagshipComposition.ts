import flagshipScenario from '../../data/presets/ecoli_ciprofloxacin_v1.json'
import {
  composedConfigurationFingerprint,
  type ComposedSimulationConfig,
} from './authoritative'
import {
  projectEcologyExecutionProfile,
  type EcologyExecutionProjection,
} from './ecology/executionProfile'
import { buildCuratedMutationGraph } from './evolution/graph'
import {
  COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
  type ComposedParameterSetBinding,
} from './parameterSetBinding'
import {
  assertSimulationSeed,
  createRunIdentity,
  type RunIdentity,
} from './protocol'
import {
  parseScenarioResourceContext,
  type ScenarioResourceContext,
} from './resourceContext'
import {
  CircularScalarField,
  requireFiniteNonNegativeFloat32,
} from './spatial/field'

export const FLAGSHIP_COMPOSED_PARAMETER_SET_SCHEMA_VERSION = 1 as const

export interface FlagshipFounderInoculum {
  readonly lineageId: string
  readonly x: number
  readonly y: number
  readonly biomass: number
}

export interface FlagshipRunInitialization {
  readonly seed: number
  readonly initialResourceLevel: number
  readonly inocula: readonly FlagshipFounderInoculum[]
}

export interface FlagshipComposedRunPlan {
  readonly identity: RunIdentity
  readonly config: ComposedSimulationConfig
  readonly parameterSetBinding: ComposedParameterSetBinding
  readonly executionProfile: EcologyExecutionProjection
  readonly resourceContext: ScenarioResourceContext
}

interface BaselineLineageRecord {
  readonly id: string
  readonly genotypeId: string
  readonly deathHazardPerHour: number
}

interface FlagshipComposedParameterSet {
  readonly schemaVersion: typeof FLAGSHIP_COMPOSED_PARAMETER_SET_SCHEMA_VERSION
  readonly id: string
  readonly version: string
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly executionProfileId: string
  readonly executionProfileVersion: string
  readonly resourceContextVersion: string
  readonly geometrySource: 'environment.engineeringDefaults'
  readonly lossPolicyId: string
  readonly lineages: readonly BaselineLineageRecord[]
}

type UnknownRecord = Record<string, unknown>

const PARAMETER_SET_KEYS = new Set([
  'schemaVersion',
  'id',
  'version',
  'scenarioId',
  'scenarioVersion',
  'executionProfileId',
  'executionProfileVersion',
  'resourceContextVersion',
  'geometrySource',
  'lossPolicyId',
  'lineages',
  'provenance',
])

const LINEAGE_KEYS = new Set([
  'id',
  'genotypeId',
  'deathHazardPerHour',
  'provenance',
])

const ENGINEERING_DEFAULT_KEYS = new Set([
  'gridSize',
  'dishRadiusCells',
  'cellSize',
  'cellSizeUnit',
  'note',
])

function requireRecord(name: string, value: unknown): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as UnknownRecord
}

function assertOnlyKnownKeys(
  name: string,
  record: UnknownRecord,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unknown field ${JSON.stringify(key)}`)
    }
  }
}

function requireCanonicalText(name: string, value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be canonical with no surrounding whitespace`)
  }
  return value
}

function requirePositiveFinite(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be positive and finite`)
  }
  return value
}

function requireFiniteNonNegative(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be finite and non-negative`)
  }
  return value
}

function requirePositiveSafeInteger(name: string, value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${name} must be a positive safe integer`)
  }
  return value
}

function parseBaselineParameterSet(
  value: unknown,
): FlagshipComposedParameterSet {
  const record = requireRecord('composedParameterSet', value)
  assertOnlyKnownKeys('composedParameterSet', record, PARAMETER_SET_KEYS)

  if (record.schemaVersion !== FLAGSHIP_COMPOSED_PARAMETER_SET_SCHEMA_VERSION) {
    throw new Error('unsupported flagship composed parameter-set schema version')
  }
  if (record.geometrySource !== 'environment.engineeringDefaults') {
    throw new Error(
      'composedParameterSet.geometrySource must be "environment.engineeringDefaults"',
    )
  }

  if (!Array.isArray(record.lineages) || record.lineages.length === 0) {
    throw new Error('composedParameterSet.lineages must be a non-empty array')
  }

  const lineageIds = new Set<string>()
  const lineages = record.lineages.map((value, index) => {
    const lineage = requireRecord(
      `composedParameterSet.lineages[${index}]`,
      value,
    )
    assertOnlyKnownKeys(
      `composedParameterSet.lineages[${index}]`,
      lineage,
      LINEAGE_KEYS,
    )
    const id = requireCanonicalText(
      `composedParameterSet.lineages[${index}].id`,
      lineage.id,
    )
    if (lineageIds.has(id)) {
      throw new Error(`duplicate composed baseline lineage id: ${id}`)
    }
    lineageIds.add(id)
    return Object.freeze({
      id,
      genotypeId: requireCanonicalText(
        `composedParameterSet.lineages[${index}].genotypeId`,
        lineage.genotypeId,
      ),
      deathHazardPerHour: requireFiniteNonNegative(
        `composedParameterSet.lineages[${index}].deathHazardPerHour`,
        lineage.deathHazardPerHour,
      ),
    })
  })

  return Object.freeze({
    schemaVersion: FLAGSHIP_COMPOSED_PARAMETER_SET_SCHEMA_VERSION,
    id: requireCanonicalText('composedParameterSet.id', record.id),
    version: requireCanonicalText(
      'composedParameterSet.version',
      record.version,
    ),
    scenarioId: requireCanonicalText(
      'composedParameterSet.scenarioId',
      record.scenarioId,
    ),
    scenarioVersion: requireCanonicalText(
      'composedParameterSet.scenarioVersion',
      record.scenarioVersion,
    ),
    executionProfileId: requireCanonicalText(
      'composedParameterSet.executionProfileId',
      record.executionProfileId,
    ),
    executionProfileVersion: requireCanonicalText(
      'composedParameterSet.executionProfileVersion',
      record.executionProfileVersion,
    ),
    resourceContextVersion: requireCanonicalText(
      'composedParameterSet.resourceContextVersion',
      record.resourceContextVersion,
    ),
    geometrySource: 'environment.engineeringDefaults',
    lossPolicyId: requireCanonicalText(
      'composedParameterSet.lossPolicyId',
      record.lossPolicyId,
    ),
    lineages: Object.freeze(lineages),
  })
}

function parseEngineeringGeometry(
  value: unknown,
): {
  readonly gridSize: number
  readonly dishRadiusCells: number
  readonly cellSize: number
} {
  const record = requireRecord('environment.engineeringDefaults', value)
  assertOnlyKnownKeys(
    'environment.engineeringDefaults',
    record,
    ENGINEERING_DEFAULT_KEYS,
  )
  if (record.cellSizeUnit !== 'model-grid-cell') {
    throw new Error(
      'environment.engineeringDefaults.cellSizeUnit must be "model-grid-cell"',
    )
  }

  const gridSize = requirePositiveSafeInteger(
    'environment.engineeringDefaults.gridSize',
    record.gridSize,
  )
  if (gridSize < 3) {
    throw new Error('environment.engineeringDefaults.gridSize must be >= 3')
  }

  return Object.freeze({
    gridSize,
    dishRadiusCells: requirePositiveFinite(
      'environment.engineeringDefaults.dishRadiusCells',
      record.dishRadiusCells,
    ),
    cellSize: requirePositiveFinite(
      'environment.engineeringDefaults.cellSize',
      record.cellSize,
    ),
  })
}

function assertFlagshipReferences(args: {
  scenario: UnknownRecord
  resourceContext: ScenarioResourceContext
  executionProfile: EcologyExecutionProjection
  parameterSet: FlagshipComposedParameterSet
}): void {
  const scenarioId = requireCanonicalText('scenario.id', args.scenario.id)
  const scenarioVersion = requireCanonicalText(
    'scenario.version',
    args.scenario.version,
  )

  if (
    args.executionProfile.scenarioId !== scenarioId ||
    args.parameterSet.scenarioId !== scenarioId
  ) {
    throw new Error('flagship composed records must match scenario id')
  }
  if (
    args.executionProfile.scenarioVersion !== scenarioVersion ||
    args.parameterSet.scenarioVersion !== scenarioVersion
  ) {
    throw new Error('flagship composed records must match scenario version')
  }
  if (
    args.parameterSet.executionProfileId !== args.executionProfile.profileId ||
    args.parameterSet.executionProfileVersion !==
      args.executionProfile.profileVersion
  ) {
    throw new Error(
      'composed parameter set must reference the selected execution profile',
    )
  }
  if (
    args.executionProfile.resourceContextVersion !==
      args.resourceContext.version ||
    args.parameterSet.resourceContextVersion !== args.resourceContext.version
  ) {
    throw new Error(
      'flagship composed records must reference the active resource context',
    )
  }

  const drug = requireRecord('scenario.drug', args.scenario.drug)
  const policy = requireRecord(
    'scenario.drug.resourceDrugCompositionPolicy',
    drug.resourceDrugCompositionPolicy,
  )
  const policyId = requireCanonicalText(
    'scenario.drug.resourceDrugCompositionPolicy.id',
    policy.id,
  )
  if (args.parameterSet.lossPolicyId !== policyId) {
    throw new Error('composed parameter set must reference the active loss policy')
  }
  if (policy.zeroDrugIncrementalLoss !== 0) {
    throw new Error(
      'flagship baseline loss policy must declare exact zero incremental loss',
    )
  }
  if (
    args.parameterSet.lineages.some(
      (lineage) => lineage.deathHazardPerHour !== 0,
    )
  ) {
    throw new Error(
      'flagship baseline lineages must keep the inactive drug-loss hazard at zero',
    )
  }
}

function applyInocula(args: {
  lineages: readonly BaselineLineageRecord[]
  mask: Uint8Array
  width: number
  height: number
  inocula: readonly FlagshipFounderInoculum[]
}): number[][] {
  const channels = args.lineages.map(
    () => new Array<number>(args.mask.length).fill(0),
  )
  const lineageIndex = new Map(
    args.lineages.map((lineage, index) => [lineage.id, index] as const),
  )

  for (let index = 0; index < args.inocula.length; index += 1) {
    if (!(index in args.inocula)) {
      throw new Error('flagship inocula must be a dense array')
    }
    const inoculum = args.inocula[index]
    if (
      inoculum === null ||
      typeof inoculum !== 'object' ||
      Array.isArray(inoculum)
    ) {
      throw new Error(`inocula[${index}] must be an object`)
    }
    const lineageId = requireCanonicalText(
      `inocula[${index}].lineageId`,
      inoculum.lineageId,
    )
    const channelIndex = lineageIndex.get(lineageId)
    if (channelIndex === undefined) {
      throw new Error(
        `inocula[${index}] references unknown baseline lineage ${JSON.stringify(lineageId)}`,
      )
    }
    if (
      !Number.isSafeInteger(inoculum.x) ||
      !Number.isSafeInteger(inoculum.y) ||
      inoculum.x < 0 ||
      inoculum.x >= args.width ||
      inoculum.y < 0 ||
      inoculum.y >= args.height
    ) {
      throw new Error(`inocula[${index}] coordinates must be in-grid integers`)
    }

    const cell = inoculum.y * args.width + inoculum.x
    if (args.mask[cell] !== 1) {
      throw new Error(`inocula[${index}] must fall inside the dish mask`)
    }

    const amount = requireFiniteNonNegativeFloat32(
      `inocula[${index}].biomass`,
      inoculum.biomass,
    )
    if (amount <= 0) {
      throw new Error(`inocula[${index}].biomass must be positive`)
    }

    const current = channels[channelIndex]![cell]!
    const next = requireFiniteNonNegativeFloat32(
      `inocula[${index}] accumulated biomass`,
      current + amount,
    )
    channels[channelIndex]![cell] = next
  }

  return channels
}

/**
 * Product-facing flagship composition boundary.
 *
 * Mechanism identity comes only from versioned scenario records. Run-state
 * initialization remains explicit: callers supply seed, a uniform model-resource
 * level, and founder placements. Those state values are deliberately excluded
 * from the mechanism fingerprint by the composed simulation config contract.
 */
export function buildFlagshipComposedRunPlan(
  initialization: FlagshipRunInitialization,
): FlagshipComposedRunPlan {
  if (
    initialization === null ||
    typeof initialization !== 'object' ||
    Array.isArray(initialization)
  ) {
    throw new Error('flagship run initialization must be an object')
  }
  if (!Array.isArray(initialization.inocula)) {
    throw new Error('flagship run initialization inocula must be an array')
  }
  assertSimulationSeed(initialization.seed)

  const scenario: unknown = flagshipScenario
  const scenarioRecord = requireRecord('flagship scenario', scenario)
  const environment = requireRecord(
    'flagship scenario environment',
    scenarioRecord.environment,
  )

  const resourceContext = parseScenarioResourceContext(
    environment.resourceContext,
  )
  if (
    resourceContext.bindingStatus !== 'unbound' ||
    resourceContext.representation !== 'dimensionless_model_resource' ||
    resourceContext.concentrationUnit !== 'model-resource'
  ) {
    throw new Error(
      'research-stage flagship composition expects the unbound model-resource context',
    )
  }

  const executionProfile = projectEcologyExecutionProfile(
    scenarioRecord.executionProfile,
  )
  const parameterSet = parseBaselineParameterSet(
    scenarioRecord.composedParameterSet,
  )
  assertFlagshipReferences({
    scenario: scenarioRecord,
    resourceContext,
    executionProfile,
    parameterSet,
  })

  const geometry = parseEngineeringGeometry(environment.engineeringDefaults)
  const resourceField = new CircularScalarField(
    {
      width: geometry.gridSize,
      height: geometry.gridSize,
      cellSize: geometry.cellSize,
      radius: geometry.dishRadiusCells,
    },
    requireFiniteNonNegativeFloat32(
      'initialResourceLevel',
      initialization.initialResourceLevel,
    ),
  )

  const drug = requireRecord('flagship scenario drug', scenarioRecord.drug)
  const referencePd = requireRecord(
    'flagship scenario drug.referencePharmacodynamics',
    drug.referencePharmacodynamics,
  )
  if (!Array.isArray(scenarioRecord.genotypes)) {
    throw new Error('flagship scenario genotypes must be an array')
  }
  const genotypeMicMgL = Object.fromEntries(
    scenarioRecord.genotypes.map((value, index) => {
      const genotype = requireRecord(`flagship scenario genotypes[${index}]`, value)
      return [
        requireCanonicalText(`flagship scenario genotypes[${index}].id`, genotype.id),
        requirePositiveFinite(`flagship scenario genotypes[${index}].mic_mg_L`, genotype.mic_mg_L),
      ]
    }),
  )

  const ciprofloxacin = {
    reference: {
      psiMaxLog10PerHour: requirePositiveFinite(
        'drug.referencePharmacodynamics.psiMax_log10DensitySlope_per_h',
        referencePd.psiMax_log10DensitySlope_per_h,
      ),
      psiMinLog10PerHour: (() => {
        const value = referencePd.psiMin_log10DensitySlope_per_h
        if (typeof value !== 'number' || !Number.isFinite(value) || value >= 0) {
          throw new Error('drug.referencePharmacodynamics.psiMin_log10DensitySlope_per_h must be finite and negative')
        }
        return value
      })(),
      zMic: requirePositiveFinite(
        'drug.referencePharmacodynamics.zMIC_mg_L',
        referencePd.zMIC_mg_L,
      ),
      kappa: requirePositiveFinite(
        'drug.referencePharmacodynamics.kappa',
        referencePd.kappa,
      ),
    },
    referenceMicMgL: requirePositiveFinite(
      'drug.referencePharmacodynamics.conventionalMIC_mg_L',
      referencePd.conventionalMIC_mg_L,
    ),
    genotypeMicMgL,
  } as const

  const evolutionGraph = buildCuratedMutationGraph(scenario)
  const knownGenotypes = new Set(
    evolutionGraph.genotypes.map((genotype) => genotype.id),
  )
  for (const lineage of parameterSet.lineages) {
    if (!knownGenotypes.has(lineage.genotypeId)) {
      throw new Error(
        `baseline lineage ${lineage.id} references unknown genotype ${lineage.genotypeId}`,
      )
    }
  }

  const initialLineageBiomass = applyInocula({
    lineages: parameterSet.lineages,
    mask: resourceField.mask,
    width: resourceField.width,
    height: resourceField.height,
    inocula: initialization.inocula,
  })

  const config: ComposedSimulationConfig = {
    width: resourceField.width,
    height: resourceField.height,
    mask: Array.from(resourceField.mask),
    initialResource: Array.from(resourceField.values),
    initialLineageBiomass,
    growth: { ...executionProfile.growth },
    lineages: parameterSet.lineages.map((lineage) => ({ ...lineage })),
    evolutionGraph,
    evolutionScenario: {
      scenarioId: evolutionGraph.scenarioId,
      scenarioVersion: evolutionGraph.scenarioVersion,
    },
    hoursPerTick: executionProfile.hoursPerTick,
    ciprofloxacin,
  }

  const parameterSetBinding: ComposedParameterSetBinding = {
    schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
    authority: 'provenance',
    parameterSetId: parameterSet.id,
    parameterSetVersion: parameterSet.version,
    configurationFingerprint: composedConfigurationFingerprint(config),
  }

  const identity = createRunIdentity({
    scenarioId: evolutionGraph.scenarioId,
    scenarioVersion: evolutionGraph.scenarioVersion,
    parameterSetId: parameterSet.id,
    parameterSetVersion: parameterSet.version,
    parameterSetBinding,
    seed: initialization.seed,
  })

  return Object.freeze({
    identity,
    config,
    parameterSetBinding,
    executionProfile,
    resourceContext,
  })
}
