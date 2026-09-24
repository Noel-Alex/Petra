import { resolveMotion, type MotionPreference, type MotionTreatment } from './motion/policy'
import { MOTION } from './motion/tokens'

export type InterventionTool = 'inoculate' | 'fungus' | 'antibiotic' | 'nutrient'

export interface NormalizedDishPoint {
  readonly x: number
  readonly y: number
}

export type InterventionGeometry =
  | { readonly kind: 'global' }
  | { readonly kind: 'point'; readonly point: NormalizedDishPoint }
  | { readonly kind: 'radial'; readonly center: NormalizedDishPoint; readonly radiusFraction: number }
  | { readonly kind: 'stripe'; readonly axis: 'x' | 'y'; readonly centerFraction: number; readonly widthFraction: number }
  | { readonly kind: 'paint'; readonly samples: readonly NormalizedDishPoint[]; readonly brushRadiusFraction: number }

export interface InterventionParameterInput {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly unit: string
  readonly precision?: number
  readonly min?: number
  readonly max?: number
}

export interface InterventionDraft {
  readonly intentId: string
  readonly tool: InterventionTool
  readonly geometry: InterventionGeometry
  readonly parameters: readonly InterventionParameterInput[]
}

export interface InterventionReadout {
  readonly key: string
  readonly label: string
  readonly value: number
  readonly unit: string
  readonly formattedValue: string
}

export type InterventionValidationCode =
  | 'missing-intent-id'
  | 'missing-parameter'
  | 'duplicate-parameter-key'
  | 'invalid-parameter-metadata'
  | 'invalid-parameter-value'
  | 'parameter-out-of-range'
  | 'invalid-geometry'

export interface InterventionValidationIssue {
  readonly code: InterventionValidationCode
  readonly field: string
  readonly message: string
}

export interface InterventionCommitIntent {
  readonly type: 'apply-intervention'
  readonly intentId: string
  readonly tool: InterventionTool
  readonly geometry: InterventionGeometry
  readonly parameters: readonly {
    readonly key: string
    readonly value: number
    readonly unit: string
  }[]
}

export interface InterventionPreviewFeedback {
  readonly visual: 'geometry-outline'
  readonly treatment: MotionTreatment
  readonly durationMs: number
  readonly easing: readonly [number, number, number, number]
  readonly meaning: 'presentation-only'
}

export interface InterventionPreview {
  readonly status: 'valid' | 'invalid'
  readonly tool: InterventionTool
  readonly geometry: InterventionGeometry
  readonly readouts: readonly InterventionReadout[]
  readonly issues: readonly InterventionValidationIssue[]
  readonly canCommit: boolean
  readonly commitIntent: InterventionCommitIntent | null
  readonly feedback: InterventionPreviewFeedback
  readonly accessibleSummary: string
  readonly announceOnPointerMove: false
}

export type InterventionPreviewKeyAction = 'commit' | 'cancel'

/**
 * Builds a presentation-only intervention preview.
 *
 * This deliberately stops at a typed UI intent. Until the authoritative
 * simulation protocol exposes real intervention commands, callers must not
 * translate this into synthetic worker traffic.
 */
export function createInterventionPreview(
  draft: InterventionDraft,
  preference: MotionPreference,
): InterventionPreview {
  const issues = validateDraft(draft)
  const readouts = draft.parameters.map(toReadout)
  const motion = resolveMotion(preference, {
    kind: 'spatial',
    durationMs: MOTION.toolPreview.durationMs,
  })
  const canCommit = issues.length === 0

  return {
    status: canCommit ? 'valid' : 'invalid',
    tool: draft.tool,
    geometry: structuredClone(draft.geometry),
    readouts,
    issues,
    canCommit,
    commitIntent: canCommit ? toCommitIntent(draft) : null,
    feedback: {
      visual: 'geometry-outline',
      treatment: motion.treatment,
      durationMs: motion.durationMs,
      easing: MOTION.toolPreview.easing,
      meaning: 'presentation-only',
    },
    accessibleSummary: buildAccessibleSummary(draft, readouts, issues),
    announceOnPointerMove: false,
  }
}

/**
 * Tool-layer keyboard semantics. An active tool should get first refusal on
 * Escape before the global playback shortcut. Enter never commits while the
 * user is editing a text/number control; an explicit Apply button remains
 * available for keyboard and touch users.
 */
export function interventionPreviewActionForKey(
  key: string,
  context: { readonly toolActive: boolean; readonly editableTarget: boolean },
): InterventionPreviewKeyAction | null {
  if (!context.toolActive) return null
  if (key === 'Escape') return 'cancel'
  if ((key === 'Enter' || key === 'NumpadEnter') && !context.editableTarget) return 'commit'
  return null
}

function validateDraft(draft: InterventionDraft): InterventionValidationIssue[] {
  const issues: InterventionValidationIssue[] = []

  if (draft.intentId.trim() === '') {
    issues.push(issue('missing-intent-id', 'intentId', 'Intervention preview needs a stable intent id.'))
  }

  if (draft.parameters.length === 0) {
    issues.push(issue(
      'missing-parameter',
      'parameters',
      'Show at least one exact numeric parameter before applying an intervention.',
    ))
  }

  const keys = new Set<string>()
  draft.parameters.forEach((parameter, index) => {
    const field = `parameters[${index}]`
    const key = parameter.key.trim()
    if (key === '' || parameter.label.trim() === '' || parameter.unit.trim() === '') {
      issues.push(issue(
        'invalid-parameter-metadata',
        field,
        'Parameter key, label, and unit are required.',
      ))
    }
    if (keys.has(key)) {
      issues.push(issue(
        'duplicate-parameter-key',
        `${field}.key`,
        `Duplicate parameter key: ${key || '(blank)'}.`,
      ))
    }
    keys.add(key)

    if (!Number.isFinite(parameter.value)) {
      issues.push(issue(
        'invalid-parameter-value',
        `${field}.value`,
        'Parameter value must be finite.',
      ))
    }

    const precision = parameter.precision ?? 3
    if (!Number.isSafeInteger(precision) || precision < 0 || precision > 6) {
      issues.push(issue(
        'invalid-parameter-metadata',
        `${field}.precision`,
        'Parameter precision must be an integer from 0 to 6.',
      ))
    }

    if (parameter.min !== undefined && !Number.isFinite(parameter.min)) {
      issues.push(issue(
        'invalid-parameter-metadata',
        `${field}.min`,
        'Parameter minimum must be finite when supplied.',
      ))
    }
    if (parameter.max !== undefined && !Number.isFinite(parameter.max)) {
      issues.push(issue(
        'invalid-parameter-metadata',
        `${field}.max`,
        'Parameter maximum must be finite when supplied.',
      ))
    }
    if (
      parameter.min !== undefined &&
      parameter.max !== undefined &&
      Number.isFinite(parameter.min) &&
      Number.isFinite(parameter.max) &&
      parameter.min > parameter.max
    ) {
      issues.push(issue(
        'invalid-parameter-metadata',
        field,
        'Parameter minimum cannot exceed maximum.',
      ))
    }
    if (
      Number.isFinite(parameter.value) &&
      ((parameter.min !== undefined && Number.isFinite(parameter.min) && parameter.value < parameter.min) ||
        (parameter.max !== undefined && Number.isFinite(parameter.max) && parameter.value > parameter.max))
    ) {
      issues.push(issue(
        'parameter-out-of-range',
        `${field}.value`,
        'Parameter value is outside the supplied scenario bounds.',
      ))
    }
  })

  if (!isValidGeometry(draft.geometry)) {
    issues.push(issue(
      'invalid-geometry',
      'geometry',
      'Preview geometry must stay inside normalized dish coordinates.',
    ))
  }

  return issues
}

function isValidGeometry(geometry: InterventionGeometry): boolean {
  if (geometry.kind === 'global') return true
  if (geometry.kind === 'point') return validPoint(geometry.point)
  if (geometry.kind === 'radial') {
    return validPoint(geometry.center) && inOpenClosedUnit(geometry.radiusFraction)
  }
  if (geometry.kind === 'stripe') {
    return inClosedUnit(geometry.centerFraction) && inOpenClosedUnit(geometry.widthFraction)
  }
  return (
    geometry.samples.length > 0 &&
    geometry.samples.every(validPoint) &&
    inOpenClosedUnit(geometry.brushRadiusFraction)
  )
}

function validPoint(point: NormalizedDishPoint): boolean {
  return inClosedUnit(point.x) && inClosedUnit(point.y)
}

function inClosedUnit(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1
}

function inOpenClosedUnit(value: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= 1
}

function toReadout(parameter: InterventionParameterInput): InterventionReadout {
  const precision = validPrecision(parameter.precision) ? (parameter.precision ?? 3) : 3
  return {
    key: parameter.key,
    label: parameter.label,
    value: parameter.value,
    unit: parameter.unit,
    formattedValue: Number.isFinite(parameter.value)
      ? `${parameter.value.toFixed(precision)} ${parameter.unit}`
      : `Invalid ${parameter.unit}`,
  }
}

function validPrecision(precision: number | undefined): boolean {
  return (
    precision === undefined ||
    (Number.isSafeInteger(precision) && precision >= 0 && precision <= 6)
  )
}

function toCommitIntent(draft: InterventionDraft): InterventionCommitIntent {
  return {
    type: 'apply-intervention',
    intentId: draft.intentId,
    tool: draft.tool,
    geometry: structuredClone(draft.geometry),
    parameters: draft.parameters.map(({ key, value, unit }) => ({ key, value, unit })),
  }
}

function buildAccessibleSummary(
  draft: InterventionDraft,
  readouts: readonly InterventionReadout[],
  issues: readonly InterventionValidationIssue[],
): string {
  const tool = TOOL_LABELS[draft.tool]
  const geometry = describeGeometry(draft.geometry)
  const values =
    readouts.length > 0
      ? readouts.map((readout) => `${readout.label}: ${readout.formattedValue}`).join('; ')
      : 'No numeric parameters supplied'

  if (issues.length > 0) {
    return `${tool} preview, ${geometry}. ${values}. Not ready to apply: ${issues[0]?.message ?? 'invalid preview'}`
  }

  return `${tool} preview, ${geometry}. ${values}. Ready to apply.`
}

function describeGeometry(geometry: InterventionGeometry): string {
  if (geometry.kind === 'global') return 'whole dish'
  if (geometry.kind === 'point') {
    return `point at ${percent(geometry.point.x)}, ${percent(geometry.point.y)}`
  }
  if (geometry.kind === 'radial') {
    return `radial region centered at ${percent(geometry.center.x)}, ${percent(geometry.center.y)} with radius ${percent(geometry.radiusFraction)}`
  }
  if (geometry.kind === 'stripe') {
    return `${geometry.axis}-axis stripe centered at ${percent(geometry.centerFraction)} with width ${percent(geometry.widthFraction)}`
  }
  return `paint path with ${geometry.samples.length} samples and brush radius ${percent(geometry.brushRadiusFraction)}`
}

function percent(value: number): string {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : 'invalid'
}

function issue(
  code: InterventionValidationCode,
  field: string,
  message: string,
): InterventionValidationIssue {
  return { code, field, message }
}

const TOOL_LABELS: Readonly<Record<InterventionTool, string>> = {
  inoculate: 'Inoculation',
  fungus: 'Fungi',
  antibiotic: 'Antibiotic',
  nutrient: 'Nutrient',
}
