import {
  composedConfigurationFingerprint,
  type ComposedSimulationConfig,
} from './authoritative'

export const COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION = 1 as const

export type ComposedParameterSetBindingAuthority = 'provenance' | 'fixture'

/**
 * Immutable mapping from a named/versioned parameter set to the exact composed
 * mechanism configuration that name is allowed to represent.
 *
 * Product bindings are provenance-owned data. Only the explicit fixture helper
 * below may derive a binding directly from an ad-hoc config at runtime.
 */
export interface ComposedParameterSetBinding {
  readonly schemaVersion: typeof COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION
  readonly authority: ComposedParameterSetBindingAuthority
  readonly parameterSetId: string
  readonly parameterSetVersion: string
  readonly configurationFingerprint: string
}

export interface ParameterSetBoundIdentity {
  readonly parameterSetId: string
  readonly parameterSetVersion: string
  readonly parameterSetBinding?: ComposedParameterSetBinding
}

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function canonicalIdentity(name: string, value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`)
  }
  if (value !== value.trim()) {
    throw new Error(`${name} must be canonical with no surrounding whitespace`)
  }
}

export function createFixtureComposedParameterSetBinding(
  parameterSetId: string,
  parameterSetVersion: string,
  config: ComposedSimulationConfig,
): ComposedParameterSetBinding {
  canonicalIdentity('fixture parameter-set id', parameterSetId)
  canonicalIdentity('fixture parameter-set version', parameterSetVersion)
  if (!parameterSetId.startsWith('fixture:')) {
    throw new Error('fixture parameter-set ids must start with "fixture:"')
  }

  return {
    schemaVersion: COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION,
    authority: 'fixture',
    parameterSetId,
    parameterSetVersion,
    configurationFingerprint: composedConfigurationFingerprint(config),
  }
}

/**
 * Fail-closed validation at the composed-authority boundary.
 *
 * A provenance binding must be supplied by versioned provenance/scenario data;
 * do not construct one by fingerprinting the caller's config at initialization
 * time, because that would merely self-certify whatever values were supplied.
 */
export function assertComposedParameterSetBinding(
  identity: ParameterSetBoundIdentity,
  config: ComposedSimulationConfig,
): asserts identity is ParameterSetBoundIdentity & {
  readonly parameterSetBinding: ComposedParameterSetBinding
} {
  canonicalIdentity('run parameter-set id', identity.parameterSetId)
  canonicalIdentity('run parameter-set version', identity.parameterSetVersion)

  const binding = asRecord(identity.parameterSetBinding)
  if (binding === null) {
    throw new Error(
      'composed runs require a versioned parameter-set configuration binding',
    )
  }

  if (
    binding.schemaVersion !== COMPOSED_PARAMETER_SET_BINDING_SCHEMA_VERSION
  ) {
    throw new Error('unsupported composed parameter-set binding schema version')
  }
  if (binding.authority !== 'provenance' && binding.authority !== 'fixture') {
    throw new Error(
      'composed parameter-set binding authority must be "provenance" or "fixture"',
    )
  }

  canonicalIdentity('bound parameter-set id', binding.parameterSetId)
  canonicalIdentity('bound parameter-set version', binding.parameterSetVersion)
  canonicalIdentity(
    'bound composed configuration fingerprint',
    binding.configurationFingerprint,
  )

  if (binding.parameterSetId !== identity.parameterSetId) {
    throw new Error('run parameter-set id does not match composed binding')
  }
  if (binding.parameterSetVersion !== identity.parameterSetVersion) {
    throw new Error('run parameter-set version does not match composed binding')
  }

  if (binding.authority === 'fixture') {
    if (!binding.parameterSetId.startsWith('fixture:')) {
      throw new Error('fixture parameter-set ids must start with "fixture:"')
    }
  } else if (binding.parameterSetId.startsWith('fixture:')) {
    throw new Error(
      'provenance parameter-set bindings cannot use the fixture namespace',
    )
  }

  const actualFingerprint = composedConfigurationFingerprint(config)
  if (binding.configurationFingerprint !== actualFingerprint) {
    throw new Error(
      'composed configuration fingerprint does not match parameter-set binding',
    )
  }
}
