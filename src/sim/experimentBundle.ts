import {
  composedConfigurationFingerprint,
  type ComposedSimulationConfig,
} from './authoritative'
import { ComposedSimulationEngine } from './composedEngine'
import { SimulationEngine } from './engine'
import {
  AUTHORITATIVE_METRIC_SCHEMA_VERSION,
  validateMetricSamplingPolicy,
  type AuthoritativeMetricSample,
  type MetricSamplingPolicy,
} from './metrics'
import {
  assertComposedParameterSetBinding,
} from './parameterSetBinding'
import {
  type ComposedSimulationSnapshot,
  type RunIdentity,
  type SimulationCheckpoint,
  type SimulationCommand,
  type SimulationEvent,
  type SimulationSnapshot,
  type SyntheticSimulationSnapshot,
} from './protocol'
import {
  REPLAY_COMPATIBILITY_POLICY_VERSION,
  ReplayCompatibilityError,
  assertReplayArtifactUsesCurrentRuntime,
  assertReplayCompatibility,
  type ReplayAuthority,
} from './replayCompatibility'

export const EXPERIMENT_BUNDLE_SCHEMA_VERSION = 1 as const

const INTERNAL_BUNDLE_RESTORE_COMMAND_ID =
  '__petra_experiment_bundle_restore__'

type ReplayMutationCommand = Extract<
  SimulationCommand,
  { type: 'advance' | 'synthetic-pulse' }
>

export type ExperimentReplayCommand = Readonly<ReplayMutationCommand>

export interface ExperimentBundleCapabilities {
  readonly rendererStateIncluded: false
  readonly rawDatasetIncluded: false
  readonly counterfactualAncestryIncluded: false
}

export interface ExperimentBundleEvidence {
  readonly events: readonly SimulationEvent[]
  readonly metrics: readonly AuthoritativeMetricSample[]
  readonly provenanceSourceIds: readonly string[]
}

export interface ExperimentReplayPayload {
  readonly originCheckpoint: SimulationCheckpoint
  readonly commands: readonly ExperimentReplayCommand[]
  readonly composedConfig: ComposedSimulationConfig | null
}

export interface ExperimentBundle {
  readonly kind: 'petra-experiment-bundle'
  readonly schemaVersion: typeof EXPERIMENT_BUNDLE_SCHEMA_VERSION
  readonly replayCompatibilityPolicyVersion:
    typeof REPLAY_COMPATIBILITY_POLICY_VERSION
  readonly authority: ReplayAuthority
  readonly identity: RunIdentity
  readonly replay: ExperimentReplayPayload
  readonly evidence: ExperimentBundleEvidence
  readonly counterfactualAncestry: null
  readonly capabilities: ExperimentBundleCapabilities
}

export type ExperimentBundleErrorCode =
  | 'malformed-json'
  | 'unsupported-kind'
  | 'unsupported-schema'
  | 'unsupported-replay-policy'
  | 'runtime-incompatible'
  | 'authority-mismatch'
  | 'identity-mismatch'
  | 'config-required'
  | 'config-forbidden'
  | 'config-binding-mismatch'
  | 'checkpoint-invalid'
  | 'command-invalid'
  | 'evidence-invalid'
  | 'counterfactual-ancestry-unsupported'
  | 'capability-claim-invalid'

export class ExperimentBundleError extends Error {
  readonly code: ExperimentBundleErrorCode

  constructor(code: ExperimentBundleErrorCode, message: string) {
    super(message)
    this.name = 'ExperimentBundleError'
    this.code = code
  }
}

export function createExperimentBundle(args: {
  readonly originCheckpoint: SimulationCheckpoint
  readonly commands: readonly ExperimentReplayCommand[]
  readonly composedConfig?: ComposedSimulationConfig | null
  readonly events?: readonly SimulationEvent[]
  readonly metrics?: readonly AuthoritativeMetricSample[]
  readonly provenanceSourceIds?: readonly string[]
}): ExperimentBundle {
  const checkpoint = structuredClone(args.originCheckpoint)
  const authority = checkpointAuthority(checkpoint)
  const bundle: ExperimentBundle = {
    kind: 'petra-experiment-bundle',
    schemaVersion: EXPERIMENT_BUNDLE_SCHEMA_VERSION,
    replayCompatibilityPolicyVersion: REPLAY_COMPATIBILITY_POLICY_VERSION,
    authority,
    identity: structuredClone(checkpoint.identity),
    replay: {
      originCheckpoint: checkpoint,
      commands: args.commands.map((command) => structuredClone(command)),
      composedConfig:
        args.composedConfig === undefined
          ? null
          : structuredClone(args.composedConfig),
    },
    evidence: {
      events: (args.events ?? []).map((event) => structuredClone(event)),
      metrics: (args.metrics ?? []).map((metric) => structuredClone(metric)),
      provenanceSourceIds: canonicalSourceIds(
        args.provenanceSourceIds ?? [],
      ),
    },
    counterfactualAncestry: null,
    capabilities: {
      rendererStateIncluded: false,
      rawDatasetIncluded: false,
      counterfactualAncestryIncluded: false,
    },
  }

  validateExperimentBundle(bundle)
  return deepFreeze(bundle)
}

export function validateExperimentBundle(bundle: ExperimentBundle): void {
  const record = requireRecord(
    bundle,
    'experiment bundle',
    'unsupported-kind',
  )
  if (record.kind !== 'petra-experiment-bundle') {
    throw new ExperimentBundleError(
      'unsupported-kind',
      'Experiment bundle kind is unsupported.',
    )
  }
  if (record.schemaVersion !== EXPERIMENT_BUNDLE_SCHEMA_VERSION) {
    throw new ExperimentBundleError(
      'unsupported-schema',
      `Experiment bundle schema version is unsupported; expected ${EXPERIMENT_BUNDLE_SCHEMA_VERSION}.`,
    )
  }
  if (
    record.replayCompatibilityPolicyVersion !==
    REPLAY_COMPATIBILITY_POLICY_VERSION
  ) {
    throw new ExperimentBundleError(
      'unsupported-replay-policy',
      `Experiment bundle replay policy is unsupported; expected policy ${REPLAY_COMPATIBILITY_POLICY_VERSION}.`,
    )
  }
  if (record.authority !== 'synthetic' && record.authority !== 'composed') {
    throw new ExperimentBundleError(
      'authority-mismatch',
      'Experiment bundle authority must be synthetic or composed.',
    )
  }

  const identity = requireRecord(
    record.identity,
    'experiment bundle identity',
    'identity-mismatch',
  ) as unknown as RunIdentity
  try {
    assertReplayArtifactUsesCurrentRuntime(identity)
  } catch (error) {
    throw replayCompatibilityAsBundleError(error)
  }

  const replay = requireRecord(
    record.replay,
    'experiment bundle replay payload',
    'checkpoint-invalid',
  )
  const checkpoint = requireRecord(
    replay.originCheckpoint,
    'experiment bundle origin checkpoint',
    'checkpoint-invalid',
  ) as unknown as SimulationCheckpoint
  const observedAuthority = checkpointAuthority(checkpoint)
  if (observedAuthority !== record.authority) {
    throw new ExperimentBundleError(
      'authority-mismatch',
      `Experiment bundle authority ${record.authority} does not match its checkpoint authority ${observedAuthority}.`,
    )
  }

  try {
    assertReplayCompatibility({
      artifactIdentity: checkpoint.identity,
      targetIdentity: identity,
      artifactAuthority: observedAuthority,
      targetAuthority: record.authority,
    })
  } catch (error) {
    throw new ExperimentBundleError(
      'identity-mismatch',
      error instanceof Error
        ? error.message
        : 'Experiment bundle checkpoint identity does not match bundle identity.',
    )
  }

  const composedConfig = replay.composedConfig as
    | ComposedSimulationConfig
    | null
    | undefined
  validateReplayOrigin(
    record.authority,
    identity,
    checkpoint,
    composedConfig,
  )

  if (!Array.isArray(replay.commands)) {
    throw new ExperimentBundleError(
      'command-invalid',
      'Experiment bundle replay commands must be an array.',
    )
  }
  validateReplayCommands(
    record.authority,
    replay.commands as unknown as ExperimentReplayCommand[],
  )

  const evidence = requireRecord(
    record.evidence,
    'experiment bundle evidence',
    'evidence-invalid',
  )
  validateEvidence(
    record.authority,
    identity,
    evidence as unknown as ExperimentBundleEvidence,
  )

  if (record.counterfactualAncestry !== null) {
    throw new ExperimentBundleError(
      'counterfactual-ancestry-unsupported',
      'Experiment bundle v1 does not accept counterfactual ancestry until the parent trace contract is independently verifiable.',
    )
  }

  const capabilities = requireRecord(
    record.capabilities,
    'experiment bundle capabilities',
    'capability-claim-invalid',
  )
  if (
    capabilities.rendererStateIncluded !== false ||
    capabilities.rawDatasetIncluded !== false ||
    capabilities.counterfactualAncestryIncluded !== false
  ) {
    throw new ExperimentBundleError(
      'capability-claim-invalid',
      'Experiment bundle v1 cannot claim renderer state, raw datasets, or counterfactual ancestry.',
    )
  }
}

export function serializeExperimentBundle(bundle: ExperimentBundle): string {
  validateExperimentBundle(bundle)
  return `${canonicalJson(bundle)}\n`
}

export function parseExperimentBundle(text: string): ExperimentBundle {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ExperimentBundleError(
      'malformed-json',
      'Experiment bundle is not valid JSON.',
    )
  }

  validateExperimentBundle(parsed as ExperimentBundle)
  return deepFreeze(structuredClone(parsed as ExperimentBundle))
}

/**
 * Replays from the exact exported origin checkpoint.
 *
 * Replay does not claim the original trace hash/event history because engine
 * restore itself is an explicit new replay scope. Final authoritative state and
 * ordered post-origin command semantics are reproduced.
 */
export function replayExperimentBundle(
  bundle: ExperimentBundle,
): SimulationSnapshot {
  validateExperimentBundle(bundle)
  const checkpoint = structuredClone(bundle.replay.originCheckpoint)

  if (bundle.authority === 'composed') {
    const config = structuredClone(bundle.replay.composedConfig)
    if (config === null) {
      throw new ExperimentBundleError(
        'config-required',
        'Composed experiment replay requires its exported composed configuration.',
      )
    }
    const engine = new ComposedSimulationEngine(
      structuredClone(bundle.identity),
      config,
    )
    engine.execute({
      id: INTERNAL_BUNDLE_RESTORE_COMMAND_ID,
      type: 'restore',
      checkpoint,
    })
    for (const command of bundle.replay.commands) {
      engine.execute(structuredClone(command))
    }
    return engine.snapshot()
  }

  const engine = new SimulationEngine(structuredClone(bundle.identity))
  engine.execute({
    id: INTERNAL_BUNDLE_RESTORE_COMMAND_ID,
    type: 'restore',
    checkpoint,
  })
  for (const command of bundle.replay.commands) {
    engine.execute(structuredClone(command))
  }
  return engine.snapshot()
}

function validateReplayOrigin(
  authority: ReplayAuthority,
  identity: RunIdentity,
  checkpoint: SimulationCheckpoint,
  composedConfig: ComposedSimulationConfig | null | undefined,
): void {
  if (authority === 'composed') {
    if (composedConfig === null || composedConfig === undefined) {
      throw new ExperimentBundleError(
        'config-required',
        'Composed experiment bundles require the exact composed configuration.',
      )
    }
    try {
      assertComposedParameterSetBinding(identity, composedConfig)
    } catch (error) {
      throw new ExperimentBundleError(
        'config-binding-mismatch',
        error instanceof Error
          ? error.message
          : 'Composed experiment configuration does not match its parameter binding.',
      )
    }

    const composedCheckpoint = checkpoint as Extract<
      SimulationCheckpoint,
      { authority: 'composed' }
    >
    const fingerprint = composedConfigurationFingerprint(composedConfig)
    if (
      composedCheckpoint.composedState?.configurationFingerprint !==
      fingerprint
    ) {
      throw new ExperimentBundleError(
        'config-binding-mismatch',
        'Composed checkpoint configuration fingerprint does not match the exported configuration.',
      )
    }

    try {
      const engine = new ComposedSimulationEngine(
        structuredClone(identity),
        structuredClone(composedConfig),
      )
      engine.execute({
        id: INTERNAL_BUNDLE_RESTORE_COMMAND_ID,
        type: 'restore',
        checkpoint: structuredClone(checkpoint),
      })
    } catch (error) {
      throw new ExperimentBundleError(
        'checkpoint-invalid',
        error instanceof Error
          ? error.message
          : 'Composed experiment checkpoint is invalid.',
      )
    }
    return
  }

  if (composedConfig !== null && composedConfig !== undefined) {
    throw new ExperimentBundleError(
      'config-forbidden',
      'Synthetic infrastructure bundles cannot carry a composed configuration.',
    )
  }
  if (identity.parameterSetBinding !== undefined) {
    throw new ExperimentBundleError(
      'config-forbidden',
      'Synthetic infrastructure bundles cannot claim a composed parameter-set binding.',
    )
  }

  try {
    const engine = new SimulationEngine(structuredClone(identity))
    engine.execute({
      id: INTERNAL_BUNDLE_RESTORE_COMMAND_ID,
      type: 'restore',
      checkpoint: structuredClone(checkpoint),
    })
  } catch (error) {
    throw new ExperimentBundleError(
      'checkpoint-invalid',
      error instanceof Error
        ? error.message
        : 'Synthetic experiment checkpoint is invalid.',
    )
  }
}

function validateReplayCommands(
  authority: ReplayAuthority,
  commands: readonly ExperimentReplayCommand[],
): void {
  const ids = new Set<string>()
  for (let index = 0; index < commands.length; index += 1) {
    if (!(index in commands)) {
      throw new ExperimentBundleError(
        'command-invalid',
        'Experiment replay command list must be dense.',
      )
    }
    const command = requireRecord(
      commands[index],
      `experiment replay command ${index}`,
      'command-invalid',
    ) as unknown as ExperimentReplayCommand
    canonicalText(
      command.id,
      `experiment replay command ${index} id`,
      'command-invalid',
    )
    if (command.id === INTERNAL_BUNDLE_RESTORE_COMMAND_ID) {
      throw new ExperimentBundleError(
        'command-invalid',
        'Experiment replay command uses a reserved internal restore id.',
      )
    }
    if (ids.has(command.id)) {
      throw new ExperimentBundleError(
        'command-invalid',
        `Duplicate experiment replay command id: ${command.id}.`,
      )
    }
    ids.add(command.id)

    if (command.type === 'advance') {
      if (!Number.isSafeInteger(command.ticks) || command.ticks < 0) {
        throw new ExperimentBundleError(
          'command-invalid',
          'Experiment replay advance ticks must be a non-negative safe integer.',
        )
      }
      continue
    }

    if (command.type === 'synthetic-pulse') {
      if (authority === 'composed') {
        throw new ExperimentBundleError(
          'command-invalid',
          'Composed experiment bundles cannot contain synthetic-pulse commands.',
        )
      }
      if (!Number.isFinite(command.magnitude)) {
        throw new ExperimentBundleError(
          'command-invalid',
          'Synthetic replay pulse magnitude must be finite.',
        )
      }
      continue
    }

    throw new ExperimentBundleError(
      'command-invalid',
      'Experiment replay history may contain only mutating advance/synthetic-pulse commands; restore/snapshot commands are replay metadata, not history.',
    )
  }
}

function validateEvidence(
  authority: ReplayAuthority,
  identity: RunIdentity,
  evidence: ExperimentBundleEvidence,
): void {
  if (!Array.isArray(evidence.events)) {
    throw new ExperimentBundleError(
      'evidence-invalid',
      'Experiment evidence events must be an array.',
    )
  }
  validateEvents(evidence.events)

  if (!Array.isArray(evidence.metrics)) {
    throw new ExperimentBundleError(
      'evidence-invalid',
      'Experiment evidence metrics must be an array.',
    )
  }
  if (authority === 'synthetic' && evidence.metrics.length > 0) {
    throw new ExperimentBundleError(
      'evidence-invalid',
      'Authoritative composed metric samples cannot be attached to synthetic infrastructure bundles.',
    )
  }
  validateMetrics(identity, evidence.metrics)

  if (!Array.isArray(evidence.provenanceSourceIds)) {
    throw new ExperimentBundleError(
      'evidence-invalid',
      'Experiment provenance source ids must be an array.',
    )
  }
  const expected = canonicalSourceIds(evidence.provenanceSourceIds)
  if (
    expected.length !== evidence.provenanceSourceIds.length ||
    expected.some(
      (value, index) => value !== evidence.provenanceSourceIds[index],
    )
  ) {
    throw new ExperimentBundleError(
      'evidence-invalid',
      'Experiment provenance source ids must be unique and sorted canonically.',
    )
  }
}

function validateEvents(events: readonly SimulationEvent[]): void {
  let previousSequence = -1
  let previousTick = -1
  let previousTime = -1
  const allowedTypes = new Set([
    'initialized',
    'advanced',
    'synthetic-pulse',
    'restored',
  ])

  for (let index = 0; index < events.length; index += 1) {
    if (!(index in events)) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment evidence events must be a dense array.',
      )
    }
    const event = requireRecord(
      events[index],
      `experiment evidence event ${index}`,
      'evidence-invalid',
    ) as unknown as SimulationEvent

    if (
      !Number.isSafeInteger(event.sequence) ||
      event.sequence < 0 ||
      event.sequence <= previousSequence
    ) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment evidence event sequence must be strictly increasing non-negative safe integers.',
      )
    }
    if (
      !Number.isSafeInteger(event.tick) ||
      event.tick < 0 ||
      event.tick < previousTick
    ) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment evidence event ticks must be monotonic non-negative safe integers.',
      )
    }
    if (
      !Number.isFinite(event.simulationTimeHours) ||
      event.simulationTimeHours < 0 ||
      event.simulationTimeHours < previousTime
    ) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment evidence event times must be finite, non-negative, and monotonic.',
      )
    }
    if (!allowedTypes.has(event.type)) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment evidence contains an unsupported event type.',
      )
    }
    if (event.commandId !== undefined) {
      canonicalText(
        event.commandId,
        'experiment evidence event command id',
        'evidence-invalid',
      )
    }
    if (event.value !== undefined && !Number.isFinite(event.value)) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment evidence event value must be finite when present.',
      )
    }

    previousSequence = event.sequence
    previousTick = event.tick
    previousTime = event.simulationTimeHours
  }
}

function validateMetrics(
  identity: RunIdentity,
  metrics: readonly AuthoritativeMetricSample[],
): void {
  let previousTick = -1
  let previousTime = -1
  for (let index = 0; index < metrics.length; index += 1) {
    if (!(index in metrics)) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment metric samples must be a dense array.',
      )
    }
    const metric = requireRecord(
      metrics[index],
      `experiment metric sample ${index}`,
      'evidence-invalid',
    ) as unknown as AuthoritativeMetricSample

    if (metric.schemaVersion !== AUTHORITATIVE_METRIC_SCHEMA_VERSION) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment metric sample schema version is unsupported.',
      )
    }
    try {
      validateMetricSamplingPolicy(
        metric.samplingPolicy as MetricSamplingPolicy,
      )
      assertReplayCompatibility({
        artifactIdentity: metric.identity,
        targetIdentity: identity,
        artifactAuthority: 'composed',
        targetAuthority: 'composed',
      })
    } catch (error) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        error instanceof Error
          ? error.message
          : 'Experiment metric identity is invalid.',
      )
    }

    if (
      !Number.isSafeInteger(metric.tick) ||
      metric.tick < 0 ||
      metric.tick < previousTick ||
      !Number.isFinite(metric.simulationTimeHours) ||
      metric.simulationTimeHours < 0 ||
      metric.simulationTimeHours < previousTime
    ) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment metric tick/time must be monotonic and non-negative.',
      )
    }
    finiteNonNegativeMetric(metric.totalBiomass, 'totalBiomass')
    finiteNonNegativeMetric(metric.totalResource, 'totalResource')
    finiteNonNegativeMetric(
      metric.lineageShannonDiversity,
      'lineageShannonDiversity',
    )
    finiteNonNegativeMetric(metric.resistantBiomass, 'resistantBiomass')
    fractionMetric(metric.resistantFraction, 'resistantFraction')
    if (
      !Number.isSafeInteger(metric.occupiedCells) ||
      metric.occupiedCells < 0
    ) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment metric occupiedCells must be a non-negative safe integer.',
      )
    }
    if (!Array.isArray(metric.lineages) || !Array.isArray(metric.genotypes)) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment metric lineage/genotype samples must be arrays.',
      )
    }

    previousTick = metric.tick
    previousTime = metric.simulationTimeHours
  }
}

function checkpointAuthority(
  checkpoint: SimulationCheckpoint | Record<string, unknown>,
): ReplayAuthority {
  return checkpoint.authority === 'composed' ? 'composed' : 'synthetic'
}

function canonicalSourceIds(values: readonly string[]): readonly string[] {
  const unique = new Set<string>()
  for (let index = 0; index < values.length; index += 1) {
    if (!(index in values)) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        'Experiment provenance source ids must be a dense array.',
      )
    }
    const value = values[index]
    canonicalText(
      value,
      `experiment provenance source id ${index}`,
      'evidence-invalid',
    )
    unique.add(value)
  }
  return Object.freeze([...unique].sort())
}

function canonicalText(
  value: unknown,
  label: string,
  code: ExperimentBundleErrorCode,
): asserts value is string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value !== value.trim()
  ) {
    throw new ExperimentBundleError(
      code,
      `${label} must be a canonical non-empty string.`,
    )
  }
}

function finiteNonNegativeMetric(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new ExperimentBundleError(
      'evidence-invalid',
      `Experiment metric ${label} must be finite and non-negative.`,
    )
  }
}

function fractionMetric(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ExperimentBundleError(
      'evidence-invalid',
      `Experiment metric ${label} must be finite and in [0, 1].`,
    )
  }
}

function replayCompatibilityAsBundleError(
  error: unknown,
): ExperimentBundleError {
  if (error instanceof ReplayCompatibilityError) {
    return new ExperimentBundleError(
      'runtime-incompatible',
      error.message,
    )
  }
  return new ExperimentBundleError(
    'runtime-incompatible',
    error instanceof Error
      ? error.message
      : 'Experiment bundle is incompatible with this Petra runtime.',
  )
}

function requireRecord(
  value: unknown,
  label: string,
  code: ExperimentBundleErrorCode,
): Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    throw new ExperimentBundleError(
      code,
      `${label} must be an object.`,
    )
  }
  return value as Record<string, unknown>
}

function canonicalJson(value: unknown): string {
  return canonicalJsonValue(value, '$', new Set<object>())
}

function canonicalJsonValue(
  value: unknown,
  path: string,
  ancestors: Set<object>,
): string {
  if (value === null) return 'null'
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        `${path} contains a non-finite number.`,
      )
    }
    if (Object.is(value, -0)) return '-0'
    return JSON.stringify(value)
  }
  if (typeof value !== 'object') {
    throw new ExperimentBundleError(
      'evidence-invalid',
      `${path} contains a non-JSON value.`,
    )
  }
  if (ancestors.has(value)) {
    throw new ExperimentBundleError(
      'evidence-invalid',
      `${path} contains a circular reference.`,
    )
  }

  ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const encoded: string[] = []
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new ExperimentBundleError(
            'evidence-invalid',
            `${path} contains a sparse array slot at ${index}.`,
          )
        }
        encoded.push(
          canonicalJsonValue(
            value[index],
            `${path}[${index}]`,
            ancestors,
          ),
        )
      }
      return `[${encoded.join(',')}]`
    }

    const prototype = Object.getPrototypeOf(value)
    if (prototype !== Object.prototype && prototype !== null) {
      throw new ExperimentBundleError(
        'evidence-invalid',
        `${path} contains a non-plain object.`,
      )
    }
    const object = value as Record<string, unknown>
    const encoded = Object.keys(object)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJsonValue(
            object[key],
            `${path}.${key}`,
            ancestors,
          )}`,
      )
    return `{${encoded.join(',')}}`
  } finally {
    ancestors.delete(value)
  }
}

function deepFreeze<T>(value: T): T {
  if (
    value === null ||
    typeof value !== 'object' ||
    Object.isFrozen(value)
  ) {
    return value
  }

  for (const nested of Object.values(
    value as Record<string, unknown>,
  )) {
    deepFreeze(nested)
  }
  return Object.freeze(value)
}
