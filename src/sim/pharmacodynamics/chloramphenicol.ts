export const CHLORAMPHENICOL_GROWTH_INHIBITION_SCHEMA_VERSION = 1 as const
export const CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION = '1.0.0' as const
export const CHLORAMPHENICOL_GROWTH_INHIBITION_KIND =
  'petra-chloramphenicol-growth-inhibition-authority' as const
export const GREULICH_RIBOSOME_CUBIC_MODEL_ID =
  'greulich-ribosome-cubic-v1' as const

export interface AntimicrobialEffect {
  /** Dimensionless multiplicative effect on the source-compatible division/growth channel. */
  readonly divisionMultiplier: number
  /** Non-negative first-order loss supplied separately from growth inhibition. */
  readonly incrementalLossHazardPerHour: number
}

export interface ChloramphenicolFitValue {
  readonly estimate: number
  readonly reportedPlusMinus: number
  readonly unit: 'h^-1' | 'uM'
}

export interface ChloramphenicolGrowthFamily {
  readonly id: string
  readonly version: string
  readonly carbonSource: string
  readonly carbonSourceConcentration: number
  readonly carbonSourceConcentrationUnit: '% v/v' | '% w/v'
  readonly lambda0Star: ChloramphenicolFitValue & { readonly unit: 'h^-1' }
  readonly ic50Star: ChloramphenicolFitValue & { readonly unit: 'uM' }
  readonly provenance: Readonly<{
    readonly classification: 'source-fitted-parameters'
    readonly sourceKeys: readonly string[]
    readonly context: string
    readonly limitation: string
  }>
}

export interface ChloramphenicolGrowthInhibitionAuthority {
  readonly kind: typeof CHLORAMPHENICOL_GROWTH_INHIBITION_KIND
  readonly schemaVersion: typeof CHLORAMPHENICOL_GROWTH_INHIBITION_SCHEMA_VERSION
  readonly version: typeof CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION
  readonly drug: Readonly<{
    readonly id: 'chloramphenicol'
    readonly concentrationUnit: 'uM'
  }>
  readonly organism: Readonly<{
    readonly scientificName: 'Escherichia coli'
    readonly background: 'K-12 MG1655'
  }>
  readonly model: Readonly<{
    readonly id: typeof GREULICH_RIBOSOME_CUBIC_MODEL_ID
    readonly effectKind: 'growth-inhibition'
    readonly growthRateUnit: 'h^-1'
    readonly sourceEquation: 'Greulich et al. 2015 equation 7'
  }>
  readonly assay: Readonly<{
    readonly temperatureC: 37
    readonly baseMedium: string
    readonly culture: string
    readonly readout: string
    readonly adaptation: string
  }>
  readonly families: readonly ChloramphenicolGrowthFamily[]
  readonly limitations: readonly string[]
}

export interface ChloramphenicolGrowthInhibitionInput {
  readonly environmentFamilyId: string
  readonly concentration: Readonly<{
    readonly value: number
    readonly unit: string
  }>
  readonly drugFreeGrowthRate: Readonly<{
    readonly value: number
    readonly unit: string
  }>
}

export interface ChloramphenicolGrowthInhibitionResponse {
  readonly authorityVersion: typeof CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION
  readonly familyId: string
  readonly familyVersion: string
  readonly modelId: typeof GREULICH_RIBOSOME_CUBIC_MODEL_ID
  readonly concentrationMicromolar: number
  readonly drugFreeGrowthRatePerHour: number
  readonly normalizedGrowthRate: number
  readonly inhibitedGrowthRatePerHour: number
  readonly cubicResidual: number
  readonly effect: AntimicrobialEffect
}

const ROOT_X_TOLERANCE = 1e-13
const ROOT_DEDUP_TOLERANCE = 1e-10
const ROOT_RESIDUAL_RELATIVE_TOLERANCE = 1e-11
const ROOT_MAX_BISECTIONS = 128

const AUTHORITY_KEYS = new Set([
  'kind',
  'schemaVersion',
  'version',
  'drug',
  'organism',
  'model',
  'assay',
  'families',
  'limitations',
])
const DRUG_KEYS = new Set(['id', 'concentrationUnit'])
const ORGANISM_KEYS = new Set(['scientificName', 'background'])
const MODEL_KEYS = new Set([
  'id',
  'effectKind',
  'growthRateUnit',
  'sourceEquation',
])
const ASSAY_KEYS = new Set([
  'temperatureC',
  'baseMedium',
  'culture',
  'readout',
  'adaptation',
])
const FAMILY_KEYS = new Set([
  'id',
  'version',
  'carbonSource',
  'carbonSourceConcentration',
  'carbonSourceConcentrationUnit',
  'lambda0Star',
  'ic50Star',
  'provenance',
])
const FIT_KEYS = new Set(['estimate', 'reportedPlusMinus', 'unit'])
const PROVENANCE_KEYS = new Set([
  'classification',
  'sourceKeys',
  'context',
  'limitation',
])

/**
 * Strictly promotes the repository-owned chloramphenicol authority record.
 *
 * This parser intentionally validates identity/context separately from the
 * numerical evaluator so scenarios cannot select a response family from a drug
 * name, renderer label, or generic resource field.
 */
export function parseChloramphenicolGrowthInhibitionAuthority(
  value: unknown,
): ChloramphenicolGrowthInhibitionAuthority {
  const root = requireRecord(value, 'chloramphenicol authority')
  assertOnlyKeys(root, AUTHORITY_KEYS, 'chloramphenicol authority')

  if (root.kind !== CHLORAMPHENICOL_GROWTH_INHIBITION_KIND) {
    throw new Error('unsupported chloramphenicol authority kind')
  }
  if (
    root.schemaVersion !== CHLORAMPHENICOL_GROWTH_INHIBITION_SCHEMA_VERSION
  ) {
    throw new Error('unsupported chloramphenicol authority schema version')
  }
  if (root.version !== CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION) {
    throw new Error('unsupported chloramphenicol authority content version')
  }

  const drug = requireRecord(root.drug, 'chloramphenicol authority drug')
  assertOnlyKeys(drug, DRUG_KEYS, 'chloramphenicol authority drug')
  if (drug.id !== 'chloramphenicol' || drug.concentrationUnit !== 'uM') {
    throw new Error('chloramphenicol authority requires chloramphenicol in uM')
  }

  const organism = requireRecord(
    root.organism,
    'chloramphenicol authority organism',
  )
  assertOnlyKeys(
    organism,
    ORGANISM_KEYS,
    'chloramphenicol authority organism',
  )
  if (
    organism.scientificName !== 'Escherichia coli' ||
    organism.background !== 'K-12 MG1655'
  ) {
    throw new Error(
      'chloramphenicol authority requires Escherichia coli K-12 MG1655',
    )
  }

  const model = requireRecord(root.model, 'chloramphenicol authority model')
  assertOnlyKeys(model, MODEL_KEYS, 'chloramphenicol authority model')
  if (
    model.id !== GREULICH_RIBOSOME_CUBIC_MODEL_ID ||
    model.effectKind !== 'growth-inhibition' ||
    model.growthRateUnit !== 'h^-1' ||
    model.sourceEquation !== 'Greulich et al. 2015 equation 7'
  ) {
    throw new Error('unsupported chloramphenicol growth-inhibition model')
  }

  const assay = requireRecord(root.assay, 'chloramphenicol authority assay')
  assertOnlyKeys(assay, ASSAY_KEYS, 'chloramphenicol authority assay')
  if (assay.temperatureC !== 37) {
    throw new Error('chloramphenicol authority source temperature must be 37 C')
  }
  const assayClone = Object.freeze({
    temperatureC: 37 as const,
    baseMedium: canonicalText('chloramphenicol assay baseMedium', assay.baseMedium),
    culture: canonicalText('chloramphenicol assay culture', assay.culture),
    readout: canonicalText('chloramphenicol assay readout', assay.readout),
    adaptation: canonicalText('chloramphenicol assay adaptation', assay.adaptation),
  })

  if (!Array.isArray(root.families) || root.families.length === 0) {
    throw new Error('chloramphenicol authority families must be a non-empty array')
  }
  const rawFamilies = root.families
  const familyIds = new Set<string>()
  const families = rawFamilies.map((family, index) => {
    if (!(index in rawFamilies)) {
      throw new Error('chloramphenicol authority families must be dense')
    }
    const parsed = parseFamily(family, index)
    if (familyIds.has(parsed.id)) {
      throw new Error('chloramphenicol authority family ids must be unique')
    }
    familyIds.add(parsed.id)
    return parsed
  })

  const limitations = canonicalStringArray(
    'chloramphenicol authority limitations',
    root.limitations,
  )
  if (limitations.length === 0) {
    throw new Error('chloramphenicol authority limitations must not be empty')
  }

  return Object.freeze({
    kind: CHLORAMPHENICOL_GROWTH_INHIBITION_KIND,
    schemaVersion: CHLORAMPHENICOL_GROWTH_INHIBITION_SCHEMA_VERSION,
    version: CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION,
    drug: Object.freeze({
      id: 'chloramphenicol' as const,
      concentrationUnit: 'uM' as const,
    }),
    organism: Object.freeze({
      scientificName: 'Escherichia coli' as const,
      background: 'K-12 MG1655' as const,
    }),
    model: Object.freeze({
      id: GREULICH_RIBOSOME_CUBIC_MODEL_ID,
      effectKind: 'growth-inhibition' as const,
      growthRateUnit: 'h^-1' as const,
      sourceEquation: 'Greulich et al. 2015 equation 7' as const,
    }),
    assay: assayClone,
    families: Object.freeze(families),
    limitations: Object.freeze(limitations),
  })
}

/**
 * Evaluate the Greulich et al. equation-7 chloramphenicol response.
 *
 * The caller must name one exact source-compatible environment family and pass
 * source units explicitly. The current Petra model-resource field has no such
 * identity and therefore cannot call this evaluator honestly without #928.
 */
export function evaluateChloramphenicolGrowthInhibition(
  authority: ChloramphenicolGrowthInhibitionAuthority,
  input: ChloramphenicolGrowthInhibitionInput,
): ChloramphenicolGrowthInhibitionResponse {
  validatePromotedAuthority(authority)
  const familyId = canonicalText(
    'chloramphenicol environmentFamilyId',
    input.environmentFamilyId,
  )
  const family = authority.families.find((candidate) => candidate.id === familyId)
  if (family === undefined) {
    throw new Error(
      `unsupported chloramphenicol environment family: ${familyId}`,
    )
  }

  if (input.concentration.unit !== authority.drug.concentrationUnit) {
    throw new Error(
      `chloramphenicol concentration unit must be ${authority.drug.concentrationUnit}`,
    )
  }
  if (input.drugFreeGrowthRate.unit !== authority.model.growthRateUnit) {
    throw new Error(
      `chloramphenicol drug-free growth-rate unit must be ${authority.model.growthRateUnit}`,
    )
  }

  const concentrationMicromolar = finiteNonNegative(
    'chloramphenicol concentration',
    input.concentration.value,
  )
  const drugFreeGrowthRatePerHour = finitePositive(
    'chloramphenicol drug-free growth rate',
    input.drugFreeGrowthRate.value,
  )

  const normalizedGrowthRate = solvePhysicalGreulichRoot(
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    family.lambda0Star.estimate,
    family.ic50Star.estimate,
  )
  const cubicResidual = greulichChloramphenicolCubicResidual(
    normalizedGrowthRate,
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    family.lambda0Star.estimate,
    family.ic50Star.estimate,
  )

  return Object.freeze({
    authorityVersion: CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION,
    familyId: family.id,
    familyVersion: family.version,
    modelId: GREULICH_RIBOSOME_CUBIC_MODEL_ID,
    concentrationMicromolar,
    drugFreeGrowthRatePerHour,
    normalizedGrowthRate,
    inhibitedGrowthRatePerHour:
      normalizedGrowthRate * drugFreeGrowthRatePerHour,
    cubicResidual,
    effect: Object.freeze({
      divisionMultiplier: normalizedGrowthRate,
      incrementalLossHazardPerHour: 0,
    }),
  })
}

/**
 * Source equation residual for x = lambda/lambda0.
 *
 * A zero residual satisfies Greulich et al. 2015 equation 7 under the supplied
 * source-compatible growth context.
 */
export function greulichChloramphenicolCubicResidual(
  normalizedGrowthRate: number,
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  lambda0StarPerHour: number,
  ic50StarMicromolar: number,
): number {
  const x = finiteNumber('normalized growth rate', normalizedGrowthRate)
  const concentration = finiteNonNegative(
    'chloramphenicol concentration',
    concentrationMicromolar,
  )
  const lambda0 = finitePositive(
    'chloramphenicol drug-free growth rate',
    drugFreeGrowthRatePerHour,
  )
  const lambda0Star = finitePositive(
    'chloramphenicol lambda0Star',
    lambda0StarPerHour,
  )
  const ic50Star = finitePositive(
    'chloramphenicol IC50Star',
    ic50StarMicromolar,
  )

  const ratio = lambda0Star / lambda0
  const a = 0.25 * ratio * ratio
  const b = (concentration / (2 * ic50Star)) * ratio
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    throw new RangeError('chloramphenicol cubic coefficients must be finite')
  }
  return ((x - 1) * x + (a + b)) * x - a
}

function solvePhysicalGreulichRoot(
  concentrationMicromolar: number,
  drugFreeGrowthRatePerHour: number,
  lambda0StarPerHour: number,
  ic50StarMicromolar: number,
): number {
  if (concentrationMicromolar === 0) return 1

  const ratio = lambda0StarPerHour / drugFreeGrowthRatePerHour
  const a = 0.25 * ratio * ratio
  const b = (concentrationMicromolar / (2 * ic50StarMicromolar)) * ratio
  const linearCoefficient = a + b
  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    !Number.isFinite(linearCoefficient)
  ) {
    throw new RangeError('chloramphenicol cubic coefficients must be finite')
  }

  const scale = 1 + Math.abs(a) + Math.abs(b)
  const residualTolerance = ROOT_RESIDUAL_RELATIVE_TOLERANCE * scale
  const evaluate = (x: number): number =>
    ((x - 1) * x + linearCoefficient) * x - a

  const partition = [0]
  const derivativeDiscriminant = 4 - 12 * linearCoefficient
  if (derivativeDiscriminant >= 0) {
    const root = Math.sqrt(derivativeDiscriminant)
    const first = (2 - root) / 6
    const second = (2 + root) / 6
    if (first > 0 && first < 1) partition.push(first)
    if (second > 0 && second < 1) partition.push(second)
  }
  partition.push(1)
  partition.sort((left, right) => left - right)

  const roots: number[] = []
  const addRoot = (candidate: number): void => {
    if (
      candidate < -ROOT_X_TOLERANCE ||
      candidate > 1 + ROOT_X_TOLERANCE ||
      Math.abs(evaluate(candidate)) > residualTolerance
    ) {
      return
    }
    const clamped = Math.min(1, Math.max(0, candidate))
    if (
      roots.every(
        (existing) => Math.abs(existing - clamped) > ROOT_DEDUP_TOLERANCE,
      )
    ) {
      roots.push(clamped)
    }
  }

  for (const point of partition) {
    if (Math.abs(evaluate(point)) <= residualTolerance) addRoot(point)
  }

  for (let index = 0; index + 1 < partition.length; index += 1) {
    let left = partition[index]!
    let right = partition[index + 1]!
    let leftValue = evaluate(left)
    let rightValue = evaluate(right)
    if (Math.abs(leftValue) <= residualTolerance) {
      addRoot(left)
      continue
    }
    if (Math.abs(rightValue) <= residualTolerance) {
      addRoot(right)
      continue
    }
    if (Math.sign(leftValue) === Math.sign(rightValue)) continue

    for (let iteration = 0; iteration < ROOT_MAX_BISECTIONS; iteration += 1) {
      const midpoint = (left + right) / 2
      const midpointValue = evaluate(midpoint)
      if (
        Math.abs(midpointValue) <= residualTolerance ||
        right - left <= ROOT_X_TOLERANCE
      ) {
        left = midpoint
        right = midpoint
        break
      }
      if (Math.sign(leftValue) === Math.sign(midpointValue)) {
        left = midpoint
        leftValue = midpointValue
      } else {
        right = midpoint
        rightValue = midpointValue
      }
    }
    addRoot((left + right) / 2)
  }

  roots.sort((left, right) => left - right)
  if (roots.length !== 1) {
    throw new Error(
      `chloramphenicol Greulich physical branch is ambiguous or unresolved: found ${roots.length} roots in [0, 1]`,
    )
  }
  return roots[0]!
}

function parseFamily(
  value: unknown,
  index: number,
): ChloramphenicolGrowthFamily {
  const family = requireRecord(value, `chloramphenicol family ${index}`)
  assertOnlyKeys(family, FAMILY_KEYS, `chloramphenicol family ${index}`)
  const id = canonicalText(`chloramphenicol family ${index} id`, family.id)
  const version = canonicalText(
    `chloramphenicol family ${index} version`,
    family.version,
  )
  const carbonSource = canonicalText(
    `chloramphenicol family ${index} carbonSource`,
    family.carbonSource,
  )
  const carbonSourceConcentration = finitePositive(
    `chloramphenicol family ${index} carbonSourceConcentration`,
    family.carbonSourceConcentration,
  )
  if (
    family.carbonSourceConcentrationUnit !== '% v/v' &&
    family.carbonSourceConcentrationUnit !== '% w/v'
  ) {
    throw new Error(
      `chloramphenicol family ${index} has unsupported carbon-source concentration unit`,
    )
  }

  const lambda0Star = parseFitValue(
    family.lambda0Star,
    `chloramphenicol family ${index} lambda0Star`,
    'h^-1',
  ) as ChloramphenicolGrowthFamily['lambda0Star']
  const ic50Star = parseFitValue(
    family.ic50Star,
    `chloramphenicol family ${index} ic50Star`,
    'uM',
  ) as ChloramphenicolGrowthFamily['ic50Star']

  const provenance = requireRecord(
    family.provenance,
    `chloramphenicol family ${index} provenance`,
  )
  assertOnlyKeys(
    provenance,
    PROVENANCE_KEYS,
    `chloramphenicol family ${index} provenance`,
  )
  if (provenance.classification !== 'source-fitted-parameters') {
    throw new Error(
      `chloramphenicol family ${index} provenance classification is unsupported`,
    )
  }
  const sourceKeys = canonicalStringArray(
    `chloramphenicol family ${index} provenance sourceKeys`,
    provenance.sourceKeys,
  )
  if (sourceKeys.length === 0) {
    throw new Error(
      `chloramphenicol family ${index} provenance sourceKeys must not be empty`,
    )
  }

  return Object.freeze({
    id,
    version,
    carbonSource,
    carbonSourceConcentration,
    carbonSourceConcentrationUnit: family.carbonSourceConcentrationUnit,
    lambda0Star: Object.freeze(lambda0Star),
    ic50Star: Object.freeze(ic50Star),
    provenance: Object.freeze({
      classification: 'source-fitted-parameters' as const,
      sourceKeys: Object.freeze(sourceKeys),
      context: canonicalText(
        `chloramphenicol family ${index} provenance context`,
        provenance.context,
      ),
      limitation: canonicalText(
        `chloramphenicol family ${index} provenance limitation`,
        provenance.limitation,
      ),
    }),
  })
}

function parseFitValue(
  value: unknown,
  name: string,
  expectedUnit: 'h^-1' | 'uM',
): ChloramphenicolFitValue {
  const fit = requireRecord(value, name)
  assertOnlyKeys(fit, FIT_KEYS, name)
  if (fit.unit !== expectedUnit) {
    throw new Error(`${name} unit must be ${expectedUnit}`)
  }
  return {
    estimate: finitePositive(`${name} estimate`, fit.estimate),
    reportedPlusMinus: finitePositive(
      `${name} reportedPlusMinus`,
      fit.reportedPlusMinus,
    ),
    unit: expectedUnit,
  }
}

function validatePromotedAuthority(
  authority: ChloramphenicolGrowthInhibitionAuthority,
): void {
  if (
    authority.kind !== CHLORAMPHENICOL_GROWTH_INHIBITION_KIND ||
    authority.schemaVersion !==
      CHLORAMPHENICOL_GROWTH_INHIBITION_SCHEMA_VERSION ||
    authority.version !==
      CHLORAMPHENICOL_GROWTH_INHIBITION_AUTHORITY_VERSION ||
    authority.model.id !== GREULICH_RIBOSOME_CUBIC_MODEL_ID ||
    authority.drug.id !== 'chloramphenicol' ||
    authority.drug.concentrationUnit !== 'uM'
  ) {
    throw new Error('unsupported promoted chloramphenicol authority')
  }
}

function canonicalStringArray(name: string, value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be an array`)
  }
  const result = value.map((entry, index) => {
    if (!(index in value)) {
      throw new TypeError(`${name} must be dense`)
    }
    return canonicalText(`${name}[${index}]`, entry)
  })
  if (new Set(result).size !== result.length) {
    throw new Error(`${name} must contain unique values`)
  }
  return result
}

function canonicalText(name: string, value: unknown): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError(`${name} must be canonical non-empty text`)
  }
  return value
}

function finiteNumber(name: string, value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be finite`)
  }
  return value
}

function finitePositive(name: string, value: unknown): number {
  const number = finiteNumber(name, value)
  if (number <= 0) throw new RangeError(`${name} must be > 0`)
  return number
}

function finiteNonNegative(name: string, value: unknown): number {
  const number = finiteNumber(name, value)
  if (number < 0) throw new RangeError(`${name} must be >= 0`)
  return number
}

function requireRecord(
  value: unknown,
  name: string,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new TypeError(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

function assertOnlyKeys(
  record: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  name: string,
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new TypeError(
        `${name} contains unsupported field ${JSON.stringify(key)}`,
      )
    }
  }
}
