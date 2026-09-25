import fungalEvidence from '../../../data/fungi/aspergillus_niger_no10_surface_agar_1997_v1.json'
import {
  AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  createAuthoritativeTaxonRegistry,
  type AuthoritativeTaxonIdentity,
} from '../taxonIdentity'

export const ASPERGILLUS_NO10_SURFACE_STATE_SCHEMA_VERSION = 1 as const
export const ASPERGILLUS_NO10_SURFACE_OBSERVATION_SCHEMA_VERSION = 1 as const

export const ASPERGILLUS_NO10_SOURCE_PACK_ID =
  'aspergillus-niger-var-hennebergi-no10_surface-agar_larralde-1997_v1' as const

export const ASPERGILLUS_NO10_TAXON_ID =
  'aspergillus-niger-var-hennebergi-no10' as const

export const ASPERGILLUS_NO10_TAXON_CONTENT_VERSION =
  ASPERGILLUS_NO10_SOURCE_PACK_ID

export const ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L = Object.freeze([
  10,
  40,
  70,
  120,
  200,
  300,
] as const)

export type AspergillusNo10SupportedGlucoseGPerL =
  (typeof ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L)[number]

export const ASPERGILLUS_NO10_MORPHOMETRIC_GLUCOSE_G_PER_L = Object.freeze([
  10,
  40,
  70,
  120,
  300,
] as const)

export const ASPERGILLUS_NO10_PLATE_DIAMETER_CM = 9 as const
export const ASPERGILLUS_NO10_PLATE_RADIUS_UM = 45_000 as const

/**
 * Source-reported mu_calc values are rounded to two decimal places and the
 * source-table inputs are themselves reported at finite precision. This is a
 * reproduction tolerance for the published equation/table transcription only;
 * it is not a biological prediction interval.
 */
export const ASPERGILLUS_NO10_MORPHOMETRIC_REPRODUCTION_TOLERANCE_PER_HOUR =
  0.006 as const

export const ASPERGILLUS_NO10_TAXON: AuthoritativeTaxonIdentity = Object.freeze({
  schemaVersion: AUTHORITATIVE_TAXON_IDENTITY_SCHEMA_VERSION,
  id: ASPERGILLUS_NO10_TAXON_ID,
  contentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
  scientificName: 'Aspergillus niger',
  background: 'var. hennebergi no. 10; ORSTOM fungal collection',
  microbialGroup: 'fungus',
  provenance: Object.freeze({
    sourceKeys: Object.freeze([
      'larralde_corona_1997_surface_morphometry',
      'favela_torres_1998_culture_format',
    ]),
    context:
      'A. niger var. hennebergi no. 10 agar-surface evidence pack; 1997 fixed glucose treatments, with 1998 culture-format evidence used only as a transfer/refusal boundary.',
    limitation:
      'This identity does not authorize dynamic glucose transport/uptake/yield, mature stochastic hyphal-network topology, temperature/pH response, antimicrobial effects, or generic bacteria-fungus interactions.',
  }),
})

export const ASPERGILLUS_NO10_TAXON_REGISTRY =
  createAuthoritativeTaxonRegistry([ASPERGILLUS_NO10_TAXON])

type EvidenceRow = Readonly<Record<string, unknown>>

interface EvidenceAuthority {
  readonly colonyRows: readonly EvidenceRow[]
  readonly germTubeRows: readonly EvidenceRow[]
  readonly specificGrowthRows: readonly EvidenceRow[]
}

const evidence = validateEvidenceAuthority(fungalEvidence)

export interface AspergillusNo10SurfaceTreatment {
  readonly sourcePackId: typeof ASPERGILLUS_NO10_SOURCE_PACK_ID
  readonly treatmentId: string
  readonly glucoseGPerL: AspergillusNo10SupportedGlucoseGPerL
  readonly inoculationContext: 'central-point'
  readonly radialExtensionUmPerHour: number
  readonly sourceReportedSdUpperBoundFraction: 0.02
}

export interface AspergillusNo10SurfaceCheckpoint {
  readonly schemaVersion: typeof ASPERGILLUS_NO10_SURFACE_STATE_SCHEMA_VERSION
  readonly authority: 'source-validation'
  readonly sourcePackId: typeof ASPERGILLUS_NO10_SOURCE_PACK_ID
  readonly taxonId: typeof ASPERGILLUS_NO10_TAXON_ID
  readonly taxonContentVersion: typeof ASPERGILLUS_NO10_TAXON_CONTENT_VERSION
  readonly treatmentId: string
  readonly glucoseGPerL: AspergillusNo10SupportedGlucoseGPerL
  readonly inoculationContext: 'central-point'
  readonly plateDiameterCm: typeof ASPERGILLUS_NO10_PLATE_DIAMETER_CM
  readonly founderPositionCm: Readonly<{
    readonly x: 4.5
    readonly y: 4.5
  }>
  readonly biologicalTimeHours: number
  readonly colonyRadiusUm: number
  readonly frontAtDishBoundary: boolean
}

export interface AspergillusNo10SurfaceObservation {
  readonly schemaVersion: typeof ASPERGILLUS_NO10_SURFACE_OBSERVATION_SCHEMA_VERSION
  readonly sourcePackId: typeof ASPERGILLUS_NO10_SOURCE_PACK_ID
  readonly taxonId: typeof ASPERGILLUS_NO10_TAXON_ID
  readonly taxonContentVersion: typeof ASPERGILLUS_NO10_TAXON_CONTENT_VERSION
  readonly treatmentId: string
  readonly glucoseGPerL: AspergillusNo10SupportedGlucoseGPerL
  readonly biologicalTimeHours: number
  readonly colonyRadiusUm: number
  readonly plateRadiusUm: typeof ASPERGILLUS_NO10_PLATE_RADIUS_UM
  readonly normalizedColonyRadius: number
  readonly sourceRadialExtensionUmPerHour: number
  readonly frontAtDishBoundary: boolean
}

export interface AspergillusNo10MorphometricValidation {
  readonly sourcePackId: typeof ASPERGILLUS_NO10_SOURCE_PACK_ID
  readonly glucoseGPerL: Exclude<AspergillusNo10SupportedGlucoseGPerL, 200>
  readonly radialExtensionUmPerHour: number
  readonly averageDistalHyphaLengthUm: number
  readonly hyphalDiameterUm: number
  readonly calculatedSpecificGrowthPerHour: number
  readonly sourceReportedCalculatedSpecificGrowthPerHour: number
  readonly sourceObservedDryWeightSpecificGrowthPerHour: number
  readonly absoluteReproductionErrorPerHour: number
  readonly reproductionTolerancePerHour: typeof ASPERGILLUS_NO10_MORPHOMETRIC_REPRODUCTION_TOLERANCE_PER_HOUR
  readonly reproducesSourceEquationRow: boolean
  readonly classification: 'derived-source-model-validation'
  readonly limitation: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requireRecord(name: string, value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value
}

function requireArray(name: string, value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array`)
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) {
      throw new Error(`${name} must be dense`)
    }
  }
  return value
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

function requireFinitePositive(name: string, value: unknown): number {
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

function assertExactNumberArray(
  name: string,
  actual: readonly unknown[],
  expected: readonly number[],
): void {
  if (actual.length !== expected.length) {
    throw new Error(`${name} length mismatch`)
  }
  for (let index = 0; index < expected.length; index += 1) {
    if (actual[index] !== expected[index]) {
      throw new Error(
        `${name} mismatch at index ${index}: expected ${expected[index]}, received ${String(actual[index])}`,
      )
    }
  }
}

function validateEvidenceAuthority(raw: unknown): EvidenceAuthority {
  const record = requireRecord('fungal evidence pack', raw)
  if (record.schemaVersion !== 1) {
    throw new Error('unsupported Aspergillus no. 10 evidence schema version')
  }
  if (record.id !== ASPERGILLUS_NO10_SOURCE_PACK_ID) {
    throw new Error('unexpected Aspergillus no. 10 evidence pack identity')
  }

  const organism = requireRecord('fungal evidence organism', record.organism)
  if (
    organism.scientificName !== 'Aspergillus niger' ||
    organism.sourceTaxonLabel !== 'Aspergillus niger var. hennebergi' ||
    organism.strain !== 'no. 10' ||
    organism.microbialGroup !== 'fungus' ||
    organism.growthForm !== 'filamentous-hyphal'
  ) {
    throw new Error('fungal evidence organism identity drifted')
  }

  const sourceContext = requireRecord(
    'fungal evidence 1997 source context',
    record.sourceContext1997,
  )
  if (sourceContext.petriDishDiameterCm !== ASPERGILLUS_NO10_PLATE_DIAMETER_CM) {
    throw new Error('fungal source plate diameter drifted')
  }
  assertExactNumberArray(
    'fungal source glucose treatment series',
    requireArray(
      'fungal source glucose treatment series',
      sourceContext.glucoseTreatmentsGPerL,
    ),
    ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L,
  )

  const units = requireRecord('fungal evidence units', record.units)
  if (
    units.glucose !== 'g/L' ||
    units.time !== 'h' ||
    units.specificRate !== 'h^-1' ||
    units.length !== 'um' ||
    units.radialExtension !== 'um/h' ||
    units.biomassDensity !== 'mg/cm^2'
  ) {
    throw new Error('fungal evidence unit contract drifted')
  }

  const colonyRows = requireArray(
    'fungal colony rows',
    record.colonyRows,
  ).map((row, index) => {
    const current = requireRecord(`fungal colonyRows[${index}]`, row)
    requireFinitePositive(
      `fungal colonyRows[${index}].glucoseGPerL`,
      current.glucoseGPerL,
    )
    requireFinitePositive(
      `fungal colonyRows[${index}].radialExtensionUmPerHour`,
      current.radialExtensionUmPerHour,
    )
    requireCanonicalText(
      `fungal colonyRows[${index}].radialExtensionSdQualifier`,
      current.radialExtensionSdQualifier,
    )
    return Object.freeze({ ...current })
  })

  assertExactNumberArray(
    'fungal colony glucose rows',
    colonyRows.map((row) => row.glucoseGPerL),
    ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L,
  )

  const germTubeRows = requireArray(
    'fungal germ-tube rows',
    record.germTubeRows,
  ).map((row, index) => {
    const current = requireRecord(`fungal germTubeRows[${index}]`, row)
    requireFinitePositive(
      `fungal germTubeRows[${index}].glucoseGPerL`,
      current.glucoseGPerL,
    )
    requireFinitePositive(
      `fungal germTubeRows[${index}].hyphalDiameterUm`,
      current.hyphalDiameterUm,
    )
    return Object.freeze({ ...current })
  })
  assertExactNumberArray(
    'fungal germ-tube glucose rows',
    germTubeRows.map((row) => row.glucoseGPerL),
    ASPERGILLUS_NO10_MORPHOMETRIC_GLUCOSE_G_PER_L,
  )

  const specificGrowthRows = requireArray(
    'fungal specific-growth rows',
    record.specificGrowthRows,
  ).map((row, index) => {
    const current = requireRecord(`fungal specificGrowthRows[${index}]`, row)
    requireFinitePositive(
      `fungal specificGrowthRows[${index}].glucoseGPerL`,
      current.glucoseGPerL,
    )
    requireFinitePositive(
      `fungal specificGrowthRows[${index}].observedDryWeightSpecificGrowthPerHour`,
      current.observedDryWeightSpecificGrowthPerHour,
    )
    requireFinitePositive(
      `fungal specificGrowthRows[${index}].morphometricCalculatedSpecificGrowthPerHour`,
      current.morphometricCalculatedSpecificGrowthPerHour,
    )
    return Object.freeze({ ...current })
  })
  assertExactNumberArray(
    'fungal specific-growth glucose rows',
    specificGrowthRows.map((row) => row.glucoseGPerL),
    ASPERGILLUS_NO10_MORPHOMETRIC_GLUCOSE_G_PER_L,
  )

  const sourceModels = requireRecord(
    'fungal source-derived models',
    record.sourceDerivedModels1997,
  )
  if (
    sourceModels.morphometricSpecificGrowthEquation !==
    'mu_calc = u_r * ln(2) / (L_av * ln(L_av / D_h))'
  ) {
    throw new Error('fungal morphometric equation identity drifted')
  }

  return Object.freeze({
    colonyRows: Object.freeze(colonyRows),
    germTubeRows: Object.freeze(germTubeRows),
    specificGrowthRows: Object.freeze(specificGrowthRows),
  })
}

function canonicalTreatmentId(
  glucoseGPerL: AspergillusNo10SupportedGlucoseGPerL,
): string {
  return `${ASPERGILLUS_NO10_SOURCE_PACK_ID}:central-point:glucose-${glucoseGPerL}-g-per-l`
}

function sourceColonyRow(
  glucoseGPerL: AspergillusNo10SupportedGlucoseGPerL,
): EvidenceRow {
  const row = evidence.colonyRows.find(
    (candidate) => candidate.glucoseGPerL === glucoseGPerL,
  )
  if (row === undefined) {
    throw new Error(
      `missing source colony row for ${glucoseGPerL} g/L glucose`,
    )
  }
  return row
}

export function assertAspergillusNo10SupportedGlucose(
  value: number,
): asserts value is AspergillusNo10SupportedGlucoseGPerL {
  if (
    !Number.isFinite(value) ||
    !(ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L as readonly number[]).includes(
      value,
    )
  ) {
    throw new RangeError(
      `unsupported Aspergillus no. 10 source glucose treatment: ${String(value)} g/L; supported exact source rows are ${ASPERGILLUS_NO10_SUPPORTED_GLUCOSE_G_PER_L.join(', ')} g/L and are not interpolated`,
    )
  }
}

export function aspergillusNo10SurfaceTreatment(
  glucoseGPerL: number,
): AspergillusNo10SurfaceTreatment {
  assertAspergillusNo10SupportedGlucose(glucoseGPerL)
  const row = sourceColonyRow(glucoseGPerL)
  const radialExtensionUmPerHour = requireFinitePositive(
    'source radial extension',
    row.radialExtensionUmPerHour,
  )
  if (row.radialExtensionSdQualifier !== 'standard deviation <2% of value') {
    throw new Error(
      `unsupported radial-extension uncertainty qualifier for ${glucoseGPerL} g/L`,
    )
  }
  return Object.freeze({
    sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
    treatmentId: canonicalTreatmentId(glucoseGPerL),
    glucoseGPerL,
    inoculationContext: 'central-point',
    radialExtensionUmPerHour,
    sourceReportedSdUpperBoundFraction: 0.02,
  })
}

function expectedRadiusUm(
  treatment: AspergillusNo10SurfaceTreatment,
  biologicalTimeHours: number,
): number {
  const unconstrained =
    treatment.radialExtensionUmPerHour * biologicalTimeHours
  if (!Number.isFinite(unconstrained)) {
    throw new RangeError('fungal front radius overflowed finite range')
  }
  return Math.min(ASPERGILLUS_NO10_PLATE_RADIUS_UM, unconstrained)
}

export function createAspergillusNo10SurfaceCheckpoint(
  glucoseGPerL: number,
): AspergillusNo10SurfaceCheckpoint {
  const treatment = aspergillusNo10SurfaceTreatment(glucoseGPerL)
  return Object.freeze({
    schemaVersion: ASPERGILLUS_NO10_SURFACE_STATE_SCHEMA_VERSION,
    authority: 'source-validation',
    sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
    taxonId: ASPERGILLUS_NO10_TAXON_ID,
    taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
    treatmentId: treatment.treatmentId,
    glucoseGPerL: treatment.glucoseGPerL,
    inoculationContext: 'central-point',
    plateDiameterCm: ASPERGILLUS_NO10_PLATE_DIAMETER_CM,
    founderPositionCm: Object.freeze({ x: 4.5, y: 4.5 }),
    biologicalTimeHours: 0,
    colonyRadiusUm: 0,
    frontAtDishBoundary: false,
  })
}

export function validateAspergillusNo10SurfaceCheckpoint(
  checkpoint: AspergillusNo10SurfaceCheckpoint,
): void {
  if (checkpoint.schemaVersion !== ASPERGILLUS_NO10_SURFACE_STATE_SCHEMA_VERSION) {
    throw new Error(
      `unsupported Aspergillus no. 10 surface checkpoint version: ${checkpoint.schemaVersion}`,
    )
  }
  if (checkpoint.authority !== 'source-validation') {
    throw new Error('fungal surface checkpoint authority must be source-validation')
  }
  if (
    checkpoint.sourcePackId !== ASPERGILLUS_NO10_SOURCE_PACK_ID ||
    checkpoint.taxonId !== ASPERGILLUS_NO10_TAXON_ID ||
    checkpoint.taxonContentVersion !== ASPERGILLUS_NO10_TAXON_CONTENT_VERSION
  ) {
    throw new Error('fungal surface checkpoint biological identity mismatch')
  }
  assertAspergillusNo10SupportedGlucose(checkpoint.glucoseGPerL)
  const treatment = aspergillusNo10SurfaceTreatment(checkpoint.glucoseGPerL)
  if (checkpoint.treatmentId !== treatment.treatmentId) {
    throw new Error('fungal surface checkpoint treatment identity mismatch')
  }
  if (
    checkpoint.inoculationContext !== 'central-point' ||
    checkpoint.plateDiameterCm !== ASPERGILLUS_NO10_PLATE_DIAMETER_CM ||
    checkpoint.founderPositionCm?.x !== 4.5 ||
    checkpoint.founderPositionCm?.y !== 4.5
  ) {
    throw new Error(
      'fungal surface checkpoint must preserve the exact 9-cm central-point source geometry',
    )
  }

  const biologicalTimeHours = requireFiniteNonNegative(
    'fungal checkpoint biologicalTimeHours',
    checkpoint.biologicalTimeHours,
  )
  const colonyRadiusUm = requireFiniteNonNegative(
    'fungal checkpoint colonyRadiusUm',
    checkpoint.colonyRadiusUm,
  )
  if (colonyRadiusUm > ASPERGILLUS_NO10_PLATE_RADIUS_UM) {
    throw new RangeError('fungal colony radius exceeds the 9-cm source plate')
  }

  const expected = expectedRadiusUm(treatment, biologicalTimeHours)
  if (colonyRadiusUm !== expected) {
    throw new Error(
      `fungal checkpoint radius/time drift: expected ${expected} um at ${biologicalTimeHours} h, received ${colonyRadiusUm} um`,
    )
  }
  if (
    checkpoint.frontAtDishBoundary !==
    (expected === ASPERGILLUS_NO10_PLATE_RADIUS_UM)
  ) {
    throw new Error('fungal checkpoint boundary flag is inconsistent with radius')
  }
}

export function restoreAspergillusNo10SurfaceCheckpoint(
  checkpoint: AspergillusNo10SurfaceCheckpoint,
): AspergillusNo10SurfaceCheckpoint {
  validateAspergillusNo10SurfaceCheckpoint(checkpoint)
  return Object.freeze({
    ...checkpoint,
    founderPositionCm: Object.freeze({ ...checkpoint.founderPositionCm }),
  })
}

export function advanceAspergillusNo10SurfaceCheckpoint(
  checkpoint: AspergillusNo10SurfaceCheckpoint,
  deltaHours: number,
): AspergillusNo10SurfaceCheckpoint {
  validateAspergillusNo10SurfaceCheckpoint(checkpoint)
  const duration = requireFiniteNonNegative('fungal advance deltaHours', deltaHours)
  const biologicalTimeHours = checkpoint.biologicalTimeHours + duration
  if (!Number.isFinite(biologicalTimeHours)) {
    throw new RangeError('fungal biological time overflowed finite range')
  }

  const treatment = aspergillusNo10SurfaceTreatment(checkpoint.glucoseGPerL)
  const colonyRadiusUm = expectedRadiusUm(treatment, biologicalTimeHours)

  return Object.freeze({
    ...checkpoint,
    biologicalTimeHours,
    colonyRadiusUm,
    frontAtDishBoundary:
      colonyRadiusUm === ASPERGILLUS_NO10_PLATE_RADIUS_UM,
    founderPositionCm: Object.freeze({ ...checkpoint.founderPositionCm }),
  })
}

export function observeAspergillusNo10SurfaceCheckpoint(
  checkpoint: AspergillusNo10SurfaceCheckpoint,
): AspergillusNo10SurfaceObservation {
  validateAspergillusNo10SurfaceCheckpoint(checkpoint)
  const treatment = aspergillusNo10SurfaceTreatment(checkpoint.glucoseGPerL)
  return Object.freeze({
    schemaVersion: ASPERGILLUS_NO10_SURFACE_OBSERVATION_SCHEMA_VERSION,
    sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
    taxonId: ASPERGILLUS_NO10_TAXON_ID,
    taxonContentVersion: ASPERGILLUS_NO10_TAXON_CONTENT_VERSION,
    treatmentId: checkpoint.treatmentId,
    glucoseGPerL: checkpoint.glucoseGPerL,
    biologicalTimeHours: checkpoint.biologicalTimeHours,
    colonyRadiusUm: checkpoint.colonyRadiusUm,
    plateRadiusUm: ASPERGILLUS_NO10_PLATE_RADIUS_UM,
    normalizedColonyRadius:
      checkpoint.colonyRadiusUm / ASPERGILLUS_NO10_PLATE_RADIUS_UM,
    sourceRadialExtensionUmPerHour: treatment.radialExtensionUmPerHour,
    frontAtDishBoundary: checkpoint.frontAtDishBoundary,
  })
}

export function calculateAspergillusMorphometricSpecificGrowthPerHour(args: {
  readonly radialExtensionUmPerHour: number
  readonly averageDistalHyphaLengthUm: number
  readonly hyphalDiameterUm: number
}): number {
  const radialExtensionUmPerHour = requireFinitePositive(
    'morphometric radialExtensionUmPerHour',
    args.radialExtensionUmPerHour,
  )
  const averageDistalHyphaLengthUm = requireFinitePositive(
    'morphometric averageDistalHyphaLengthUm',
    args.averageDistalHyphaLengthUm,
  )
  const hyphalDiameterUm = requireFinitePositive(
    'morphometric hyphalDiameterUm',
    args.hyphalDiameterUm,
  )
  if (averageDistalHyphaLengthUm <= hyphalDiameterUm) {
    throw new RangeError(
      'morphometric average distal hypha length must exceed hyphal diameter',
    )
  }

  const denominator =
    averageDistalHyphaLengthUm *
    Math.log(averageDistalHyphaLengthUm / hyphalDiameterUm)
  const value = (radialExtensionUmPerHour * Math.LN2) / denominator
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError('morphometric specific growth must be positive and finite')
  }
  return value
}

export function aspergillusNo10MorphometricValidation(
  glucoseGPerL: number,
): AspergillusNo10MorphometricValidation {
  assertAspergillusNo10SupportedGlucose(glucoseGPerL)
  if (glucoseGPerL === 200) {
    throw new RangeError(
      '200 g/L has a point-colony radial row but no matching 1997 germ-tube/specific-growth row; morphometric validation must not interpolate it',
    )
  }

  const colony = sourceColonyRow(glucoseGPerL)
  const germTube = evidence.germTubeRows.find(
    (row) => row.glucoseGPerL === glucoseGPerL,
  )
  const specificGrowth = evidence.specificGrowthRows.find(
    (row) => row.glucoseGPerL === glucoseGPerL,
  )
  if (germTube === undefined || specificGrowth === undefined) {
    throw new Error(
      `incomplete morphometric source authority for ${glucoseGPerL} g/L`,
    )
  }

  const radialExtensionUmPerHour = requireFinitePositive(
    'morphometric source radial extension',
    colony.radialExtensionUmPerHour,
  )
  const averageDistalHyphaLengthUm = requireFinitePositive(
    'morphometric source average distal hypha length',
    colony.averageDistalHyphaLengthUm,
  )
  const hyphalDiameterUm = requireFinitePositive(
    'morphometric source hyphal diameter',
    germTube.hyphalDiameterUm,
  )
  const sourceReportedCalculatedSpecificGrowthPerHour = requireFinitePositive(
    'source-reported morphometric specific growth',
    specificGrowth.morphometricCalculatedSpecificGrowthPerHour,
  )
  const sourceObservedDryWeightSpecificGrowthPerHour = requireFinitePositive(
    'source-observed dry-weight specific growth',
    specificGrowth.observedDryWeightSpecificGrowthPerHour,
  )
  const calculatedSpecificGrowthPerHour =
    calculateAspergillusMorphometricSpecificGrowthPerHour({
      radialExtensionUmPerHour,
      averageDistalHyphaLengthUm,
      hyphalDiameterUm,
    })
  const absoluteReproductionErrorPerHour = Math.abs(
    calculatedSpecificGrowthPerHour -
      sourceReportedCalculatedSpecificGrowthPerHour,
  )

  return Object.freeze({
    sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
    glucoseGPerL,
    radialExtensionUmPerHour,
    averageDistalHyphaLengthUm,
    hyphalDiameterUm,
    calculatedSpecificGrowthPerHour,
    sourceReportedCalculatedSpecificGrowthPerHour,
    sourceObservedDryWeightSpecificGrowthPerHour,
    absoluteReproductionErrorPerHour,
    reproductionTolerancePerHour:
      ASPERGILLUS_NO10_MORPHOMETRIC_REPRODUCTION_TOLERANCE_PER_HOUR,
    reproducesSourceEquationRow:
      absoluteReproductionErrorPerHour <=
      ASPERGILLUS_NO10_MORPHOMETRIC_REPRODUCTION_TOLERANCE_PER_HOUR,
    classification: 'derived-source-model-validation',
    limitation:
      'The source morphometric relation combines source observables as a validation equation. It is not a dynamic biomass/resource law, branch-network generator, or permission to pool lawn and point-inoculation states at runtime.',
  })
}

export function aspergillusNo10FirstBranchValidationTarget(
  glucoseGPerL: number,
): Readonly<{
  readonly sourcePackId: typeof ASPERGILLUS_NO10_SOURCE_PACK_ID
  readonly glucoseGPerL: Exclude<AspergillusNo10SupportedGlucoseGPerL, 200>
  readonly inoculationContext: 'lawn-germ-tube'
  readonly specificElongationPerHour: number
  readonly criticalLengthBeforeFirstBranchUm: number
  readonly timeToFirstBranchHours: number
  readonly classification: 'measured-validation-target'
  readonly limitation: string
}> {
  assertAspergillusNo10SupportedGlucose(glucoseGPerL)
  if (glucoseGPerL === 200) {
    throw new RangeError(
      '200 g/L has no 1997 germ-tube first-branch source row and must not be interpolated',
    )
  }
  const row = evidence.germTubeRows.find(
    (candidate) => candidate.glucoseGPerL === glucoseGPerL,
  )
  if (row === undefined) {
    throw new Error(
      `missing first-branch source row for ${glucoseGPerL} g/L`,
    )
  }
  return Object.freeze({
    sourcePackId: ASPERGILLUS_NO10_SOURCE_PACK_ID,
    glucoseGPerL,
    inoculationContext: 'lawn-germ-tube',
    specificElongationPerHour: requireFinitePositive(
      'source germ-tube specific elongation',
      row.specificElongationPerHour,
    ),
    criticalLengthBeforeFirstBranchUm: requireFinitePositive(
      'source critical length before first branch',
      row.criticalLengthBeforeFirstBranchUm,
    ),
    timeToFirstBranchHours: requireFinitePositive(
      'source time to first branch',
      row.timeToFirstBranchHours,
    ),
    classification: 'measured-validation-target',
    limitation:
      'This measured first-branch target does not authorize branch angle, daughter orientation, later-order branch placement, anastomosis, or a mature-network stochastic branch probability.',
  })
}
