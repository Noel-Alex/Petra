import {
  CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
  assertCiprofloxacinIntervention,
  type CiprofloxacinIntervention,
  type CiprofloxacinInterventionGeometry,
} from '../sim/ciprofloxacinIntervention'
import type { SimulationCommand } from '../sim/protocol'
import type {
  InterventionCommitIntent,
  InterventionGeometry,
} from '../ui/interventionPreview'

export const CIPROFLOXACIN_INTENT_ADAPTER_SCHEMA_VERSION = 1 as const

/**
 * App-layer mapping metadata supplied by authoritative scenario/runtime tooling.
 *
 * This object does not define biological values. It binds the UI parameter key
 * and allowed range to the protocol-v6 ciprofloxacin command contract so the
 * adapter never invents units, bounds, or set/add semantics.
 */
export interface CiprofloxacinIntentAuthority {
  readonly schemaVersion: typeof CIPROFLOXACIN_INTENT_ADAPTER_SCHEMA_VERSION
  readonly concentrationParameterKey: string
  readonly concentrationUnit: 'mg/L'
  readonly minimumMgPerL: number
  readonly maximumMgPerL: number
  readonly blendMode: CiprofloxacinIntervention['blendMode']
}

export type ApplyCiprofloxacinCommand = Extract<
  SimulationCommand,
  { readonly type: 'apply-ciprofloxacin' }
>

/**
 * Convert one already-previewed UI intent into the exact protocol-v6 mutation.
 *
 * The conversion is deliberately fail-closed:
 * - only the antibiotic tool is supported;
 * - point geometry remains preview-only because protocol v5 has no point dose;
 * - exactly one caller-declared concentration parameter must be present;
 * - unit/range/blend semantics come from supplied authority, never defaults;
 * - unsupported/extra UI meaning is rejected rather than silently dropped.
 */
export function planCiprofloxacinInterventionCommand(
  intent: InterventionCommitIntent,
  authority: CiprofloxacinIntentAuthority,
): ApplyCiprofloxacinCommand {
  assertAuthority(authority)
  assertIntentEnvelope(intent)

  const parameter = requireExactConcentrationParameter(intent, authority)
  if (
    parameter.value < authority.minimumMgPerL ||
    parameter.value > authority.maximumMgPerL
  ) {
    throw new RangeError(
      'ciprofloxacin concentration is outside authoritative intervention bounds',
    )
  }

  const intervention: CiprofloxacinIntervention = {
    schemaVersion: CIPROFLOXACIN_INTERVENTION_SCHEMA_VERSION,
    concentrationMgPerL: parameter.value,
    concentrationUnit: authority.concentrationUnit,
    blendMode: authority.blendMode,
    geometry: mapGeometry(intent.geometry),
  }
  assertCiprofloxacinIntervention(intervention)

  return {
    id: intent.intentId,
    type: 'apply-ciprofloxacin',
    intervention,
  }
}

function assertAuthority(authority: CiprofloxacinIntentAuthority): void {
  if (
    authority === null ||
    typeof authority !== 'object' ||
    Array.isArray(authority)
  ) {
    throw new TypeError('ciprofloxacin intent authority must be an object')
  }
  if (
    authority.schemaVersion !== CIPROFLOXACIN_INTENT_ADAPTER_SCHEMA_VERSION
  ) {
    throw new Error('unsupported ciprofloxacin intent authority schema version')
  }
  canonicalText(
    'ciprofloxacin concentration parameter key',
    authority.concentrationParameterKey,
  )
  if (authority.concentrationUnit !== 'mg/L') {
    throw new Error('ciprofloxacin intent authority unit must be mg/L')
  }
  finiteNonNegative(
    'ciprofloxacin authoritative minimum',
    authority.minimumMgPerL,
  )
  finiteNonNegative(
    'ciprofloxacin authoritative maximum',
    authority.maximumMgPerL,
  )
  if (authority.minimumMgPerL > authority.maximumMgPerL) {
    throw new RangeError(
      'ciprofloxacin authoritative minimum cannot exceed maximum',
    )
  }
  if (authority.blendMode !== 'set' && authority.blendMode !== 'add') {
    throw new Error('ciprofloxacin authoritative blend mode must be set or add')
  }
}

function assertIntentEnvelope(intent: InterventionCommitIntent): void {
  if (intent.type !== 'apply-intervention') {
    throw new Error('unsupported intervention intent type')
  }
  canonicalText('intervention intent id', intent.intentId)
  if (intent.tool !== 'antibiotic') {
    throw new Error(
      'only antibiotic intents can map to protocol-v5 ciprofloxacin authority',
    )
  }
  if (!Array.isArray(intent.parameters)) {
    throw new TypeError('intervention parameters must be an array')
  }
}

function requireExactConcentrationParameter(
  intent: InterventionCommitIntent,
  authority: CiprofloxacinIntentAuthority,
): InterventionCommitIntent['parameters'][number] {
  if (intent.parameters.length !== 1) {
    throw new Error(
      'ciprofloxacin intervention intent must contain exactly one authoritative parameter',
    )
  }
  if (!Object.prototype.hasOwnProperty.call(intent.parameters, 0)) {
    throw new Error('ciprofloxacin intervention parameters must be dense')
  }

  const parameter = intent.parameters[0]!
  if (
    parameter === null ||
    typeof parameter !== 'object' ||
    Array.isArray(parameter)
  ) {
    throw new TypeError('ciprofloxacin intervention parameter must be an object')
  }
  if (parameter.key !== authority.concentrationParameterKey) {
    throw new Error(
      'ciprofloxacin intervention parameter key does not match authority',
    )
  }
  if (parameter.unit !== authority.concentrationUnit) {
    throw new Error(
      'ciprofloxacin intervention parameter unit does not match authority',
    )
  }
  finiteNonNegative('ciprofloxacin intervention concentration', parameter.value)
  return parameter
}

function mapGeometry(
  geometry: InterventionGeometry,
): CiprofloxacinInterventionGeometry {
  switch (geometry.kind) {
    case 'global':
      return { kind: 'global' }
    case 'radial':
      return {
        kind: 'radial',
        center: { ...geometry.center },
        radiusFraction: geometry.radiusFraction,
      }
    case 'stripe':
      return {
        kind: 'stripe',
        axis: geometry.axis,
        centerFraction: geometry.centerFraction,
        widthFraction: geometry.widthFraction,
      }
    case 'paint':
      return {
        kind: 'paint',
        samples: geometry.samples.map((sample) => ({ ...sample })),
        brushRadiusFraction: geometry.brushRadiusFraction,
      }
    case 'point':
      throw new Error(
        'point geometry is preview-only and unsupported by protocol-v5 ciprofloxacin interventions',
      )
  }
}

function canonicalText(name: string, value: string): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new Error(`${name} must be a canonical non-empty string`)
  }
}

function finiteNonNegative(name: string, value: number): void {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be finite and non-negative`)
  }
}
