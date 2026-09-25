import scenarioData from '../../data/presets/ecoli_bsubtilis_shared_resource_v1.json'
import {
  composedConfigurationFingerprint,
  type ComposedLineageConfig,
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
  createRunIdentity,
  type RunIdentity,
} from './protocol'
import {
  parseScenarioResourceContext,
  type ScenarioResourceContext,
} from './resourceContext'
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
  type AuthoritativeTaxonIdentity,
  type AuthoritativeTaxonRegistry,
} from './taxonIdentity'
import {
  CircularScalarField,
  requireFiniteNonNegativeFloat32,
} from './spatial/field'
import { assertSimulationSeed } from './seed'

export const TWO_BACTERIUM_PARAMETER_SET_SCHEMA_VERSION = 1 as const
export const RELATIVE_ISOLATED_GROWTH_CALIBRATION_SCHEMA_VERSION = 1 as const
export const RELATIVE_ISOLATED_GROWTH_CALIBRATION_METHOD =
  'relative-isolated-growth-rate-ratio-v1' as const

export interface TwoBacteriumFounderInoculum {
  readonly lineageId: string
  readonly x: number
  readonly y: number
  readonly biomass: number
}

export interface TwoBacteriumRunInitialization {
  readonly seed: number
  readonly initialResourceLevel: number
  readonly inocula: readonly TwoBacteriumFounderInoculum[]
}

export interface TwoBacteriumGrowthCalibrationTarget {
  readonly lineageId: string
  readonly valuePerHour: number
  readonly citation: string
  readonly context: string
}

export interface TwoBacteriumGrowthCalibration {
  readonly schemaVersion:
    typeof RELATIVE_ISOLATED_GROWTH_CALIBRATION_SCHEMA_VERSION
  readonly method: typeof RELATIVE_ISOLATED_GROWTH_CALIBRATION_METHOD
  readonly referenceLineageId: string
  readonly unit: '1/hour'
  readonly targets: readonly TwoBacteriumGrowthCalibrationTarget[]
  readonly limitation: string
}

export interface TwoBacteriumComposedRunPlan {
  readonly identity: RunIdentity
  readonly config: ComposedSimulationConfig
  readonly parameterSetBinding: ComposedParameterSetBinding
  readonly executionProfile: EcologyExecutionProjection
  readonly resourceContext: ScenarioResourceContext
  readonly taxonRegistry: AuthoritativeTaxonRegistry
  readonly growthCalibration: TwoBacteriumGrowthCalibration
}

type UnknownRecord = Record<string, unknown>

interface ParsedParameterSet {
  readonly id: string
  readonly version: string
  readonly scenarioId: string
  readonly scenarioVersion: string
  readonly executionProfileId: string
  readonly executionProfileVersion: string
  readonly resourceContextVersion: string
  readonly lineages: readonly Omit<ComposedLineageConfig, 'baselineGrowthRateScale'>[]
  readonly growthCalibration: TwoBacteriumGrowthCalibration
}

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
  'growthCalibration',
  'lineages',
  'provenance',
])

const LINEAGE_KEYS = new Set([
  'id',
  'genotypeId',
  'taxonId',
  'taxonContentVersion',
  'deathHazardPerHour',
])

const GROWTH_CALIBRATION_KEYS = new Set([
  'schemaVersion',
  'method',
  'referenceLineageId',
  'unit',
  'targets',
  'limitation',
])

const GROWTH_TARGET_KEYS = new Set([
  'lineageId',
  'value',
  'citation',
  'context',
])

const TAXON_KEYS = new Set([
  'schemaVersion',
  'id',
  'contentVersion',
  'scientificName',
  'background',
  'microbialGroup',
  'provenance',
])

const TAXON_PROVENANCE_KEYS = new Set([
  'sourceKeys',
  'context',
  'limitation',
])

const ENGINEERING_GEOMETRY_KEYS = new Set([
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
  value: UnknownRecord,
  allowed: ReadonlySet<string>,
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${name} contains unknown field ${JSON.stringify(key)}`)
    }
  }
}

function requireCanonicalText(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be a canonical non-empty string`)
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

function parseTaxonRegistry(value: unknown): AuthoritativeTaxonRegistry {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error('two-bacterium scenario taxa must contain at least two records')
  }

  const taxa: AuthoritativeTaxonIdentity[] = value.map((candidate, index) => {
    const record = requireRecord(`taxa[${index}]`, candidate)
    assertOnlyKnownKeys(`taxa[${index}]`, record, TAXON_KEYS)
    if (record.schemaVersion !== AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION) {
      throw new Error(`taxa[${index}] has unsupported taxon schema version`)
    }
    if (record.microbialGroup !== 'bacterium') {
      throw new Error('first two-bacterium scenario requires bacterial taxa')
    }
    const provenance = requireRecord(
      `taxa[${index}].provenance`,
      record.provenance,
    )
    assertOnlyKnownKeys(
      `taxa[${index}].provenance`,
      provenance,
      TAXON_PROVENANCE_KEYS,
    )
    if (!Array.isArray(provenance.sourceKeys) || provenance.sourceKeys.length === 0) {
      throw new Error(`taxa[${index}].provenance.sourceKeys must be non-empty`)
    }

    return {
      schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
      id: requireCanonicalText(`taxa[${index}].id`, record.id),
      contentVersion: requireCanonicalText(
        `taxa[${index}].contentVersion`,
        record.contentVersion,
      ),
      scientificName: requireCanonicalText(
        `taxa[${index}].scientificName`,
        record.scientificName,
      ),
      background: requireCanonicalText(
        `taxa[${index}].background`,
        record.background,
      ),
      microbialGroup: 'bacterium',
      provenance: {
        sourceKeys: provenance.sourceKeys.map((sourceKey, sourceIndex) =>
          requireCanonicalText(
            `taxa[${index}].provenance.sourceKeys[${sourceIndex}]`,
            sourceKey,
          ),
        ),
        context: requireCanonicalText(
          `taxa[${index}].provenance.context`,
          provenance.context,
        ),
        limitation: requireCanonicalText(
          `taxa[${index}].provenance.limitation`,
          provenance.limitation,
        ),
      },
    }
  })

  return createAuthoritativeTaxonRegistry(taxa)
}

function parseGrowthCalibration(value: unknown): TwoBacteriumGrowthCalibration {
  const record = requireRecord('composedParameterSet.growthCalibration', value)
  assertOnlyKnownKeys(
    'composedParameterSet.growthCalibration',
    record,
    GROWTH_CALIBRATION_KEYS,
  )
  if (
    record.schemaVersion !==
    RELATIVE_ISOLATED_GROWTH_CALIBRATION_SCHEMA_VERSION
  ) {
    throw new Error('unsupported relative growth calibration schema version')
  }
  if (record.method !== RELATIVE_ISOLATED_GROWTH_CALIBRATION_METHOD) {
    throw new Error('unsupported relative growth calibration method')
  }
  if (record.unit !== '1/hour') {
    throw new Error('relative growth calibration source unit must be 1/hour')
  }
  if (!Array.isArray(record.targets) || record.targets.length < 2) {
    throw new Error('relative growth calibration requires at least two targets')
  }

  const seen = new Set<string>()
  const targets = record.targets.map((candidate, index) => {
    const target = requireRecord(
      `composedParameterSet.growthCalibration.targets[${index}]`,
      candidate,
    )
    assertOnlyKnownKeys(
      `composedParameterSet.growthCalibration.targets[${index}]`,
      target,
      GROWTH_TARGET_KEYS,
    )
    const lineageId = requireCanonicalText(
      `growthCalibration.targets[${index}].lineageId`,
      target.lineageId,
    )
    if (seen.has(lineageId)) {
      throw new Error('relative growth calibration target lineage ids must be unique')
    }
    seen.add(lineageId)
    return Object.freeze({
      lineageId,
      valuePerHour: requirePositiveFinite(
        `growthCalibration.targets[${index}].value`,
        target.value,
      ),
      citation: requireCanonicalText(
        `growthCalibration.targets[${index}].citation`,
        target.citation,
      ),
      context: requireCanonicalText(
        `growthCalibration.targets[${index}].context`,
        target.context,
      ),
    })
  })

  const referenceLineageId = requireCanonicalText(
    'growthCalibration.referenceLineageId',
    record.referenceLineageId,
  )
  if (!seen.has(referenceLineageId)) {
    throw new Error('relative growth reference lineage must have a source target')
  }

  return Object.freeze({
    schemaVersion: RELATIVE_ISOLATED_GROWTH_CALIBRATION_SCHEMA_VERSION,
    method: RELATIVE_ISOLATED_GROWTH_CALIBRATION_METHOD,
    referenceLineageId,
    unit: '1/hour',
    targets: Object.freeze(targets),
    limitation: requireCanonicalText(
      'growthCalibration.limitation',
      record.limitation,
    ),
  })
}

function parseParameterSet(value: unknown): ParsedParameterSet {
  const record = requireRecord('composedParameterSet', value)
  assertOnlyKnownKeys('composedParameterSet', record, PARAMETER_SET_KEYS)
  if (record.schemaVersion !== TWO_BACTERIUM_PARAMETER_SET_SCHEMA_VERSION) {
    throw new Error('unsupported two-bacterium parameter-set schema version')
  }
  if (record.geometrySource !== 'environment.engineeringDefaults') {
    throw new Error(
      'two-bacterium parameter set must use environment.engineeringDefaults',
    )
  }
  if (!Array.isArray(record.lineages) || record.lineages.length !== 2) {
    throw new Error('first two-bacterium parameter set requires exactly two founders')
  }

  const lineageIds = new Set<string>()
  const lineages = record.lineages.map((candidate, index) => {
    const lineage = requireRecord(
      `composedParameterSet.lineages[${index}]`,
      candidate,
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
      throw new Error('two-bacterium founder ids must be unique')
    }
    lineageIds.add(id)
    return Object.freeze({
      id,
      genotypeId: requireCanonicalText(
        `composedParameterSet.lineages[${index}].genotypeId`,
        lineage.genotypeId,
      ),
      taxonId: requireCanonicalText(
        `composedParameterSet.lineages[${index}].taxonId`,
        lineage.taxonId,
      ),
      taxonContentVersion: requireCanonicalText(
        `composedParameterSet.lineages[${index}].taxonContentVersion`,
        lineage.taxonContentVersion,
      ),
      deathHazardPerHour: requireFiniteNonNegative(
        `composedParameterSet.lineages[${index}].deathHazardPerHour`,
        lineage.deathHazardPerHour,
      ),
    })
  })

  const growthCalibration = parseGrowthCalibration(record.growthCalibration)
  if (
    growthCalibration.targets.length !== lineages.length ||
    lineages.some(
      (lineage) =>
        !growthCalibration.targets.some(
          (target) => target.lineageId === lineage.id,
        ),
    )
  ) {
    throw new Error(
      'relative growth calibration must cover every two-bacterium founder exactly',
    )
  }

  return Object.freeze({
    id: requireCanonicalText('composedParameterSet.id', record.id),
    version: requireCanonicalText('composedParameterSet.version', record.version),
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
    lineages: Object.freeze(lineages),
    growthCalibration,
  })
}

function parseEngineeringGeometry(value: unknown): {
  readonly gridSize: number
  readonly dishRadiusCells: number
  readonly cellSize: number
} {
  const record = requireRecord('environment.engineeringDefaults', value)
  assertOnlyKnownKeys(
    'environment.engineeringDefaults',
    record,
    ENGINEERING_GEOMETRY_KEYS,
  )
  if (record.cellSizeUnit !== 'model-grid-cell') {
    throw new Error('two-bacterium geometry cellSizeUnit must be model-grid-cell')
  }
  const gridSize = requirePositiveSafeInteger(
    'environment.engineeringDefaults.gridSize',
    record.gridSize,
  )
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

function lineagesWithRelativeGrowth(
  parameterSet: ParsedParameterSet,
): readonly ComposedLineageConfig[] {
  const targets = new Map(
    parameterSet.growthCalibration.targets.map((target) => [
      target.lineageId,
      target.valuePerHour,
    ] as const),
  )
  const reference = targets.get(
    parameterSet.growthCalibration.referenceLineageId,
  )
  if (reference === undefined) {
    throw new Error('relative growth reference target is missing')
  }

  return Object.freeze(
    parameterSet.lineages.map((lineage) => {
      const target = targets.get(lineage.id)
      if (target === undefined) {
        throw new Error(`missing relative growth target for ${lineage.id}`)
      }
      return Object.freeze({
        ...lineage,
        baselineGrowthRateScale: target / reference,
      })
    }),
  )
}

function applyInocula(args: {
  readonly lineages: readonly ComposedLineageConfig[]
  readonly mask: Uint8Array
  readonly width: number
  readonly height: number
  readonly inocula: readonly TwoBacteriumFounderInoculum[]
}): number[][] {
  const channels = args.lineages.map(
    () => new Array<number>(args.mask.length).fill(0),
  )
  const lineageIndex = new Map(
    args.lineages.map((lineage, index) => [lineage.id, index] as const),
  )

  for (let index = 0; index < args.inocula.length; index += 1) {
    if (!(index in args.inocula)) {
      throw new Error('two-bacterium inocula must be dense')
    }
    const inoculum = requireRecord(`inocula[${index}]`, args.inocula[index])
    const lineageId = requireCanonicalText(
      `inocula[${index}].lineageId`,
      inoculum.lineageId,
    )
    const channelIndex = lineageIndex.get(lineageId)
    if (channelIndex === undefined) {
      throw new Error(
        `inocula[${index}] references unknown founder ${JSON.stringify(lineageId)}`,
      )
    }
    if (
      !Number.isSafeInteger(inoculum.x) ||
      !Number.isSafeInteger(inoculum.y) ||
      (inoculum.x as number) < 0 ||
      (inoculum.x as number) >= args.width ||
      (inoculum.y as number) < 0 ||
      (inoculum.y as number) >= args.height
    ) {
      throw new Error(`inocula[${index}] coordinates must be in-grid integers`)
    }
    const x = inoculum.x as number
    const y = inoculum.y as number
    const cell = y * args.width + x
    if (args.mask[cell] !== 1) {
      throw new Error(`inocula[${index}] must fall inside the dish mask`)
    }
    const biomass = requireFiniteNonNegativeFloat32(
      `inocula[${index}].biomass`,
      inoculum.biomass as number,
    )
    if (biomass <= 0) {
      throw new Error(`inocula[${index}].biomass must be positive`)
    }
    channels[channelIndex]![cell] = requireFiniteNonNegativeFloat32(
      `inocula[${index}] accumulated biomass`,
      channels[channelIndex]![cell]! + biomass,
    )
  }
  return channels
}

function assertScenarioReferences(args: {
  readonly scenario: UnknownRecord
  readonly parameterSet: ParsedParameterSet
  readonly executionProfile: EcologyExecutionProjection
  readonly resourceContext: ScenarioResourceContext
  readonly taxonRegistry: AuthoritativeTaxonRegistry
}): void {
  const scenarioId = requireCanonicalText('scenario.id', args.scenario.id)
  const scenarioVersion = requireCanonicalText(
    'scenario.version',
    args.scenario.version,
  )
  if (
    args.parameterSet.scenarioId !== scenarioId ||
    args.executionProfile.scenarioId !== scenarioId ||
    args.parameterSet.scenarioVersion !== scenarioVersion ||
    args.executionProfile.scenarioVersion !== scenarioVersion
  ) {
    throw new Error('two-bacterium composed records must match scenario identity')
  }
  if (
    args.parameterSet.executionProfileId !== args.executionProfile.profileId ||
    args.parameterSet.executionProfileVersion !==
      args.executionProfile.profileVersion
  ) {
    throw new Error('two-bacterium parameter set must bind execution profile')
  }
  if (
    args.parameterSet.resourceContextVersion !== args.resourceContext.version ||
    args.executionProfile.resourceContextVersion !== args.resourceContext.version
  ) {
    throw new Error('two-bacterium records must bind resource context version')
  }
  if (
    args.resourceContext.bindingStatus !== 'unbound' ||
    args.resourceContext.representation !== 'dimensionless_model_resource' ||
    args.resourceContext.concentrationUnit !== 'model-resource'
  ) {
    throw new Error('two-bacterium v1 requires unbound model-resource authority')
  }

  const taxonVersions = new Map(
    args.taxonRegistry.taxa.map((taxon) => [taxon.id, taxon.contentVersion]),
  )
  for (const lineage of args.parameterSet.lineages) {
    if (taxonVersions.get(lineage.taxonId!) !== lineage.taxonContentVersion) {
      throw new Error(
        `founder ${lineage.id} does not match exact taxon registry revision`,
      )
    }
  }
}

export function buildTwoBacteriumSharedResourceRunPlan(
  initialization: TwoBacteriumRunInitialization,
): TwoBacteriumComposedRunPlan {
  if (
    initialization === null ||
    typeof initialization !== 'object' ||
    Array.isArray(initialization)
  ) {
    throw new Error('two-bacterium run initialization must be an object')
  }
  if (!Array.isArray(initialization.inocula)) {
    throw new Error('two-bacterium run initialization inocula must be an array')
  }
  assertSimulationSeed(initialization.seed)

  const scenario = requireRecord('two-bacterium scenario', scenarioData)
  const environment = requireRecord('scenario.environment', scenario.environment)
  const resourceContext = parseScenarioResourceContext(
    environment.resourceContext,
  )
  const executionProfile = projectEcologyExecutionProfile(
    scenario.executionProfile,
  )
  const parameterSet = parseParameterSet(scenario.composedParameterSet)
  const taxonRegistry = parseTaxonRegistry(scenario.taxa)
  assertScenarioReferences({
    scenario,
    parameterSet,
    executionProfile,
    resourceContext,
    taxonRegistry,
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
  const lineages = lineagesWithRelativeGrowth(parameterSet)
  const evolutionGraph = buildCuratedMutationGraph(scenario)
  const knownGenotypes = new Set(
    evolutionGraph.genotypes.map((genotype) => genotype.id),
  )
  for (const lineage of lineages) {
    if (!knownGenotypes.has(lineage.genotypeId)) {
      throw new Error(
        `two-bacterium founder ${lineage.id} references unknown genotype ${lineage.genotypeId}`,
      )
    }
  }

  const config: ComposedSimulationConfig = {
    width: resourceField.width,
    height: resourceField.height,
    mask: Array.from(resourceField.mask),
    initialResource: Array.from(resourceField.values),
    ciprofloxacinConcentrationMgPerL: new Array<number>(
      resourceField.values.length,
    ).fill(0),
    initialLineageBiomass: applyInocula({
      lineages,
      mask: resourceField.mask,
      width: resourceField.width,
      height: resourceField.height,
      inocula: initialization.inocula,
    }),
    growth: { ...executionProfile.growth },
    lineages: lineages.map((lineage) => ({ ...lineage })),
    taxonRegistry,
    evolutionGraph,
    evolutionScenario: {
      scenarioId: evolutionGraph.scenarioId,
      scenarioVersion: evolutionGraph.scenarioVersion,
    },
    ciprofloxacin: null,
    samplingExecutionPolicy: null,
    dynamicLineageLossPolicy: null,
    populationAuthority: null,
    hoursPerTick: executionProfile.hoursPerTick,
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
    taxonRegistry,
    growthCalibration: parameterSet.growthCalibration,
  })
}
