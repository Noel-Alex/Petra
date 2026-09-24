import {
  COMPOSED_STATE_VERSION,
  type ComposedMetrics,
  type ComposedSimulationConfig,
  type ComposedSimulationState,
} from './authoritative'
import {
  assertComposedParameterSetBinding,
  assertComposedParameterSetBindingRecord,
} from './parameterSetBinding'
import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  type RunIdentity,
  type SimulationCheckpoint,
  type SimulationCommand,
  type SimulationEvent,
  type SimulationSnapshot,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol'
import { assertSimulationSeed } from './seed'

type UnknownRecord = Record<string, unknown>

type ParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string }

export type ProtocolParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false
      readonly error: string
      readonly commandId: string | null
    }

const SYNTHETIC_HOURS_PER_TICK = 1 / 60
const UINT32_MAX = 0xffff_ffff

/**
 * Runtime promotion boundary for successfully deserialized Worker requests.
 *
 * The returned object is the original payload after validation rather than a
 * reconstructed subset, so protocol-v4 composed configuration/binding fields
 * cannot be silently stripped by an older parser.
 */
export function parseWorkerRequest(
  value: unknown,
): ProtocolParseResult<WorkerRequest> {
  const record = asRecord(value)
  if (record === null) {
    return requestFailure('expected an object', null)
  }

  const commandId = commandIdFromUnknownRequest(record)
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    return requestFailure(
      `unsupported protocol version; expected ${PROTOCOL_VERSION}`,
      commandId,
    )
  }

  if (record.type === 'initialize') {
    const identity = parseRunIdentity(record.identity)
    if (!identity.ok) {
      return requestFailure(`initialize.identity ${identity.error}`, null)
    }

    if (record.composedConfig !== undefined) {
      const config = asRecord(record.composedConfig)
      if (config === null) {
        return requestFailure(
          'initialize.composedConfig must be an object when present',
          null,
        )
      }
      try {
        assertComposedParameterSetBinding(
          identity.value,
          record.composedConfig as ComposedSimulationConfig,
        )
      } catch {
        return requestFailure(
          'initialize.composedConfig or parameter-set binding is invalid',
          null,
        )
      }
    }

    return { ok: true, value: value as WorkerRequest }
  }

  if (record.type === 'command') {
    const command = parseSimulationCommand(record.command)
    if (!command.ok) {
      return requestFailure(`command ${command.error}`, commandId)
    }
    return { ok: true, value: value as WorkerRequest }
  }

  return requestFailure(
    'type must be "initialize" or "command"',
    commandId,
  )
}

/**
 * Runtime promotion boundary for successfully deserialized Worker responses.
 *
 * Malformed responses never return a command id: the browser session must keep
 * correlation authority on the already-trusted outbound request.
 */
export function parseWorkerResponse(
  value: unknown,
): ProtocolParseResult<WorkerResponse> {
  const record = asRecord(value)
  if (record === null) {
    return responseFailure('expected an object')
  }

  if (record.protocolVersion !== PROTOCOL_VERSION) {
    return {
      ok: false,
      error: `Worker protocol mismatch: expected ${PROTOCOL_VERSION}, received ${describeVersion(record.protocolVersion)}`,
      commandId: null,
    }
  }

  if (record.type === 'ready') {
    const snapshot = parseSimulationSnapshot(record.snapshot)
    if (!snapshot.ok) {
      return responseFailure(`ready.snapshot ${snapshot.error}`)
    }
    return { ok: true, value: value as WorkerResponse }
  }

  if (record.type === 'snapshot') {
    if (typeof record.commandId !== 'string') {
      return responseFailure('snapshot.commandId must be a string')
    }
    const snapshot = parseSimulationSnapshot(record.snapshot)
    if (!snapshot.ok) {
      return responseFailure(`snapshot.snapshot ${snapshot.error}`)
    }
    return { ok: true, value: value as WorkerResponse }
  }

  if (record.type === 'error') {
    if (
      record.commandId !== undefined &&
      typeof record.commandId !== 'string'
    ) {
      return responseFailure('error.commandId must be a string when present')
    }
    if (typeof record.message !== 'string') {
      return responseFailure('error.message must be a string')
    }
    return { ok: true, value: value as WorkerResponse }
  }

  return responseFailure('type must be "ready", "snapshot", or "error"')
}

function parseRunIdentity(value: unknown): ParseResult<RunIdentity> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')
  if (record.engineVersion !== ENGINE_VERSION) {
    return failure(`.engineVersion must equal ${ENGINE_VERSION}`)
  }
  if (record.protocolVersion !== PROTOCOL_VERSION) {
    return failure(`.protocolVersion must equal ${PROTOCOL_VERSION}`)
  }
  if (typeof record.scenarioId !== 'string') {
    return failure('.scenarioId must be a string')
  }
  if (typeof record.scenarioVersion !== 'string') {
    return failure('.scenarioVersion must be a string')
  }
  if (typeof record.parameterSetId !== 'string') {
    return failure('.parameterSetId must be a string')
  }
  if (typeof record.parameterSetVersion !== 'string') {
    return failure('.parameterSetVersion must be a string')
  }

  try {
    assertSimulationSeed(record.seed)
  } catch {
    return failure('.seed must be an unsigned 32-bit integer')
  }

  if (record.parameterSetBinding !== undefined) {
    const binding = record.parameterSetBinding
    try {
      assertComposedParameterSetBindingRecord(binding)
    } catch {
      return failure('.parameterSetBinding is invalid')
    }
    if (
      binding.parameterSetId !== record.parameterSetId ||
      binding.parameterSetVersion !== record.parameterSetVersion
    ) {
      return failure(
        '.parameterSetBinding must match parameterSetId and parameterSetVersion',
      )
    }
  }

  return { ok: true, value: value as RunIdentity }
}

function parseSimulationCommand(
  value: unknown,
): ParseResult<SimulationCommand> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')
  if (typeof record.id !== 'string') {
    return failure('.id must be a string')
  }

  if (record.type === 'advance') {
    if (!isNonNegativeSafeInteger(record.ticks)) {
      return failure('.ticks must be a non-negative safe integer')
    }
    return { ok: true, value: value as SimulationCommand }
  }

  if (record.type === 'synthetic-pulse') {
    if (!isFiniteNumber(record.magnitude)) {
      return failure('.magnitude must be finite')
    }
    return { ok: true, value: value as SimulationCommand }
  }

  if (record.type === 'restore') {
    const checkpoint = parseCheckpoint(record.checkpoint)
    if (!checkpoint.ok) {
      return failure(`.checkpoint ${checkpoint.error}`)
    }
    return { ok: true, value: value as SimulationCommand }
  }

  if (record.type === 'snapshot') {
    return { ok: true, value: value as SimulationCommand }
  }

  return failure('.type is not a supported simulation command')
}

function parseSimulationSnapshot(
  value: unknown,
): ParseResult<SimulationSnapshot> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')

  const checkpoint = parseCheckpoint(record.checkpoint)
  if (!checkpoint.ok) {
    return failure(`.checkpoint ${checkpoint.error}`)
  }

  if (!Array.isArray(record.events)) {
    return failure('.events must be an array')
  }
  for (let index = 0; index < record.events.length; index += 1) {
    if (!(index in record.events)) {
      return failure('.events must be dense')
    }
    const event = parseSimulationEvent(record.events[index])
    if (!event.ok) {
      return failure(`.events[${index}] ${event.error}`)
    }
  }

  if (typeof record.traceHash !== 'string') {
    return failure('.traceHash must be a string')
  }

  return { ok: true, value: value as SimulationSnapshot }
}

function parseCheckpoint(
  value: unknown,
): ParseResult<SimulationCheckpoint> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')

  const identity = parseRunIdentity(record.identity)
  if (!identity.ok) return failure(`.identity ${identity.error}`)

  if (!isNonNegativeSafeInteger(record.tick)) {
    return failure('.tick must be a non-negative safe integer')
  }
  if (!isFiniteNonNegative(record.simulationTimeHours)) {
    return failure('.simulationTimeHours must be finite and non-negative')
  }
  if (!isNonNegativeSafeInteger(record.commandCount)) {
    return failure('.commandCount must be a non-negative safe integer')
  }

  if (record.authority === 'composed') {
    if (identity.value.parameterSetBinding === undefined) {
      return failure(
        '.identity.parameterSetBinding is required for composed authority',
      )
    }

    const state = parseComposedState(record.composedState)
    if (!state.ok) return failure(`.composedState ${state.error}`)

    if (
      state.value.configurationFingerprint !==
      identity.value.parameterSetBinding.configurationFingerprint
    ) {
      return failure(
        '.composedState configuration fingerprint must match the run parameter-set binding',
      )
    }

    const metrics = parseComposedMetrics(record.metrics, state.value)
    if (!metrics.ok) return failure(`.metrics ${metrics.error}`)

    return { ok: true, value: value as SimulationCheckpoint }
  }

  if (record.authority !== undefined && record.authority !== 'synthetic') {
    return failure('.authority must be "composed", "synthetic", or omitted')
  }
  if (
    record.simulationTimeHours !==
    (record.tick as number) * SYNTHETIC_HOURS_PER_TICK
  ) {
    return failure(
      '.simulationTimeHours must exactly match the synthetic tick policy',
    )
  }
  if (!isFiniteNonNegative(record.syntheticPopulation)) {
    return failure('.syntheticPopulation must be finite and non-negative')
  }
  if (!isRngState(record.rngState)) {
    return failure(
      '.rngState must be a dense non-zero four-word uint32 array',
    )
  }

  return { ok: true, value: value as SimulationCheckpoint }
}

function parseComposedState(
  value: unknown,
): ParseResult<ComposedSimulationState> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')
  if (record.version !== COMPOSED_STATE_VERSION) {
    return failure(
      `.version must equal ${COMPOSED_STATE_VERSION}`,
    )
  }
  if (
    typeof record.configurationFingerprint !== 'string' ||
    record.configurationFingerprint.length === 0
  ) {
    return failure('.configurationFingerprint must be a non-empty string')
  }
  if (!isPositiveSafeInteger(record.width) || !isPositiveSafeInteger(record.height)) {
    return failure('.width and .height must be positive safe integers')
  }

  const cellCount = record.width * record.height
  if (!Number.isSafeInteger(cellCount)) {
    return failure('grid cell count must be a safe integer')
  }

  const mask = parseDenseNumberArray(record.mask, cellCount, (item) =>
    item === 0 || item === 1,
  )
  if (!mask.ok) return failure(`.mask ${mask.error}`)

  const resource = parseDenseNumberArray(
    record.resource,
    cellCount,
    isFiniteNonNegative,
  )
  if (!resource.ok) return failure(`.resource ${resource.error}`)

  const lineageIds = parseDenseStringArray(record.lineageIds)
  if (!lineageIds.ok) return failure(`.lineageIds ${lineageIds.error}`)
  const genotypeIds = parseDenseStringArray(record.genotypeIds)
  if (!genotypeIds.ok) return failure(`.genotypeIds ${genotypeIds.error}`)
  if (lineageIds.value.length !== genotypeIds.value.length) {
    return failure('.lineageIds and .genotypeIds must have equal length')
  }
  if (new Set(lineageIds.value).size !== lineageIds.value.length) {
    return failure('.lineageIds must be unique')
  }

  if (!Array.isArray(record.lineageBiomass)) {
    return failure('.lineageBiomass must be an array')
  }
  if (record.lineageBiomass.length !== lineageIds.value.length) {
    return failure('.lineageBiomass must contain one channel per lineage')
  }
  for (let lineage = 0; lineage < record.lineageBiomass.length; lineage += 1) {
    if (!(lineage in record.lineageBiomass)) {
      return failure('.lineageBiomass must be dense')
    }
    const channel = parseDenseNumberArray(
      record.lineageBiomass[lineage],
      cellCount,
      isFiniteNonNegative,
    )
    if (!channel.ok) {
      return failure(`.lineageBiomass[${lineage}] ${channel.error}`)
    }
  }

  for (let cell = 0; cell < cellCount; cell += 1) {
    if (mask.value[cell] !== 0) continue
    if (resource.value[cell] !== 0) {
      return failure('.resource must be zero outside the composed mask')
    }
    for (const channel of record.lineageBiomass as unknown[][]) {
      if (channel[cell] !== 0) {
        return failure(
          '.lineageBiomass must be zero outside the composed mask',
        )
      }
    }
  }

  return { ok: true, value: value as ComposedSimulationState }
}

function parseComposedMetrics(
  value: unknown,
  state: ComposedSimulationState,
): ParseResult<ComposedMetrics> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')

  for (const key of [
    'totalBiomass',
    'totalResource',
    'divisionBiomass',
    'deathBiomass',
    'resourceConsumed',
  ] as const) {
    if (!isFiniteNonNegative(record[key])) {
      return failure(`.${key} must be finite and non-negative`)
    }
  }
  if (
    !isNonNegativeSafeInteger(record.occupiedCells) ||
    record.occupiedCells > state.width * state.height
  ) {
    return failure(
      '.occupiedCells must be a non-negative safe integer within the grid',
    )
  }

  const lineageMetrics = asRecord(record.lineageBiomass)
  if (lineageMetrics === null) {
    return failure('.lineageBiomass must be an object')
  }
  const metricIds = Object.keys(lineageMetrics).sort()
  const stateIds = [...state.lineageIds].sort()
  if (
    metricIds.length !== stateIds.length ||
    metricIds.some((id, index) => id !== stateIds[index])
  ) {
    return failure(
      '.lineageBiomass keys must exactly match composed lineage identity',
    )
  }
  for (const id of stateIds) {
    if (!isFiniteNonNegative(lineageMetrics[id])) {
      return failure(`.lineageBiomass[${JSON.stringify(id)}] must be finite and non-negative`)
    }
  }

  let expectedResource = 0
  let expectedBiomass = 0
  let expectedOccupied = 0
  const expectedLineage = new Map(
    state.lineageIds.map((id) => [id, 0] as const),
  )
  const cells = state.width * state.height

  for (let cell = 0; cell < cells; cell += 1) {
    if (state.mask[cell] !== 1) continue
    expectedResource += state.resource[cell]!

    let local = 0
    for (let lineage = 0; lineage < state.lineageIds.length; lineage += 1) {
      const amount = state.lineageBiomass[lineage]![cell]!
      local += amount
      const id = state.lineageIds[lineage]!
      expectedLineage.set(id, expectedLineage.get(id)! + amount)
    }
    expectedBiomass += local
    if (local > 0) expectedOccupied += 1
  }

  if (
    !numbersAgree(record.totalResource as number, expectedResource) ||
    !numbersAgree(record.totalBiomass as number, expectedBiomass) ||
    record.occupiedCells !== expectedOccupied
  ) {
    return failure('aggregate values do not match composed state')
  }
  for (const [id, expected] of expectedLineage) {
    if (!numbersAgree(lineageMetrics[id] as number, expected)) {
      return failure(
        `.lineageBiomass[${JSON.stringify(id)}] does not match composed state`,
      )
    }
  }

  return { ok: true, value: value as ComposedMetrics }
}

function parseSimulationEvent(
  value: unknown,
): ParseResult<SimulationEvent> {
  const record = asRecord(value)
  if (record === null) return failure('must be an object')
  if (!isNonNegativeSafeInteger(record.sequence)) {
    return failure('.sequence must be a non-negative safe integer')
  }
  if (!isNonNegativeSafeInteger(record.tick)) {
    return failure('.tick must be a non-negative safe integer')
  }
  if (!isFiniteNonNegative(record.simulationTimeHours)) {
    return failure('.simulationTimeHours must be finite and non-negative')
  }
  if (
    record.type !== 'initialized' &&
    record.type !== 'advanced' &&
    record.type !== 'synthetic-pulse' &&
    record.type !== 'restored'
  ) {
    return failure('.type is not a supported simulation event')
  }
  if (
    record.commandId !== undefined &&
    typeof record.commandId !== 'string'
  ) {
    return failure('.commandId must be a string when present')
  }
  if (record.value !== undefined && !isFiniteNumber(record.value)) {
    return failure('.value must be finite when present')
  }

  return { ok: true, value: value as SimulationEvent }
}

function parseDenseNumberArray(
  value: unknown,
  length: number,
  predicate: (item: unknown) => boolean,
): ParseResult<number[]> {
  if (!Array.isArray(value)) return failure('must be an array')
  if (value.length !== length) {
    return failure(`must have length ${length}`)
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return failure('must be dense')
    if (!predicate(value[index])) {
      return failure(`contains an invalid value at index ${index}`)
    }
  }
  return { ok: true, value: value as number[] }
}

function parseDenseStringArray(value: unknown): ParseResult<string[]> {
  if (!Array.isArray(value)) return failure('must be an array')
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return failure('must be dense')
    const item = value[index]
    if (
      typeof item !== 'string' ||
      item.length === 0 ||
      item !== item.trim()
    ) {
      return failure(
        `contains a non-canonical identity at index ${index}`,
      )
    }
  }
  return { ok: true, value: value as string[] }
}

function isRngState(
  value: unknown,
): value is readonly [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) return false

  let nonZero = false
  for (let index = 0; index < value.length; index += 1) {
    if (!(index in value)) return false
    const word = value[index]
    if (
      typeof word !== 'number' ||
      !Number.isInteger(word) ||
      word < 0 ||
      word > UINT32_MAX
    ) {
      return false
    }
    if (word !== 0) nonZero = true
  }
  return nonZero
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null
}

function commandIdFromUnknownRequest(record: UnknownRecord): string | null {
  return record.type === 'command'
    ? commandIdFromUnknownCommand(record.command)
    : null
}

function commandIdFromUnknownCommand(value: unknown): string | null {
  const command = asRecord(value)
  return command !== null && typeof command.id === 'string'
    ? command.id
    : null
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isFiniteNonNegative(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0
  )
}

function isPositiveSafeInteger(value: unknown): value is number {
  return isNonNegativeSafeInteger(value) && value > 0
}

function numbersAgree(left: number, right: number): boolean {
  if (Object.is(left, right)) return true
  return (
    Math.abs(left - right) <=
    1e-12 * Math.max(1, Math.abs(left), Math.abs(right))
  )
}

function failure(error: string): ParseResult<never> {
  return { ok: false, error }
}

function requestFailure(
  message: string,
  commandId: string | null,
): ProtocolParseResult<never> {
  return {
    ok: false,
    error: `Invalid worker request: ${message}`,
    commandId,
  }
}

function responseFailure(
  message: string,
): ProtocolParseResult<never> {
  return {
    ok: false,
    error: `Invalid worker response: ${message}`,
    commandId: null,
  }
}

function describeVersion(value: unknown): string {
  if (
    typeof value === 'number' ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return String(value)
  }
  return value === undefined ? 'missing' : 'invalid'
}
