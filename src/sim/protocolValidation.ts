import {
  ENGINE_VERSION,
  PROTOCOL_VERSION,
  assertSimulationSeed,
  type RunIdentity,
  type SimulationCommand,
  type SimulationEvent,
  type SimulationSnapshot,
  type WorkerRequest,
  type WorkerResponse,
} from "./protocol";

export type ProtocolParseResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };

function fail<T>(error: string): ProtocolParseResult<T> {
  return { ok: false, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0
  );
}

function parseIdentity(value: unknown): ProtocolParseResult<RunIdentity> {
  if (!isRecord(value)) return fail("run identity must be an object");
  const requiredStrings = [
    "scenarioId",
    "scenarioVersion",
    "parameterSetId",
    "parameterSetVersion",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof value[key] !== "string" || value[key].length === 0) {
      return fail(`run identity.${key} must be a non-empty string`);
    }
  }
  if (value.engineVersion !== ENGINE_VERSION) {
    return fail(`run identity engineVersion must equal ${ENGINE_VERSION}`);
  }
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return fail(
      `run identity protocolVersion must equal ${PROTOCOL_VERSION}`,
    );
  }
  try {
    assertSimulationSeed(value.seed);
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
  return { ok: true, value: value as unknown as RunIdentity };
}

function parseCommand(value: unknown): ProtocolParseResult<SimulationCommand> {
  if (!isRecord(value)) return fail("command must be an object");
  if (typeof value.id !== "string" || value.id.length === 0) {
    return fail("command.id must be a non-empty string");
  }
  if (typeof value.type !== "string") {
    return fail("command.type must be a string");
  }

  switch (value.type) {
    case "advance":
      if (!isSafeNonNegativeInteger(value.ticks)) {
        return fail("advance.ticks must be a non-negative safe integer");
      }
      return { ok: true, value: value as unknown as SimulationCommand };
    case "synthetic-pulse":
      if (typeof value.magnitude !== "number" || !Number.isFinite(value.magnitude)) {
        return fail("synthetic-pulse.magnitude must be finite");
      }
      return { ok: true, value: value as unknown as SimulationCommand };
    case "restore":
      if (!isRecord(value.checkpoint)) {
        return fail("restore.checkpoint must be an object");
      }
      return { ok: true, value: value as unknown as SimulationCommand };
    case "snapshot":
      return { ok: true, value: value as unknown as SimulationCommand };
    default:
      return fail(`unsupported command type: ${value.type}`);
  }
}

function parseEvent(value: unknown): ProtocolParseResult<SimulationEvent> {
  if (!isRecord(value)) return fail("snapshot event must be an object");
  if (!isSafeNonNegativeInteger(value.sequence)) {
    return fail("snapshot event.sequence must be a non-negative safe integer");
  }
  if (!isSafeNonNegativeInteger(value.tick)) {
    return fail("snapshot event.tick must be a non-negative safe integer");
  }
  if (!isFiniteNonNegative(value.simulationTimeHours)) {
    return fail("snapshot event.simulationTimeHours must be finite and non-negative");
  }
  if (
    value.type !== "initialized" &&
    value.type !== "advanced" &&
    value.type !== "synthetic-pulse" &&
    value.type !== "restored"
  ) {
    return fail("snapshot event.type is unsupported");
  }
  if (value.commandId !== undefined && typeof value.commandId !== "string") {
    return fail("snapshot event.commandId must be a string when present");
  }
  if (
    value.value !== undefined &&
    (typeof value.value !== "number" || !Number.isFinite(value.value))
  ) {
    return fail("snapshot event.value must be finite when present");
  }
  return { ok: true, value: value as unknown as SimulationEvent };
}

function parseSnapshot(value: unknown): ProtocolParseResult<SimulationSnapshot> {
  if (!isRecord(value)) return fail("snapshot must be an object");
  if (!isRecord(value.checkpoint)) return fail("snapshot.checkpoint must be an object");
  if (!Array.isArray(value.events)) return fail("snapshot.events must be an array");
  if (typeof value.traceHash !== "string" || value.traceHash.length === 0) {
    return fail("snapshot.traceHash must be a non-empty string");
  }

  const checkpoint = value.checkpoint;
  const identity = parseIdentity(checkpoint.identity);
  if (!identity.ok) return fail(`snapshot checkpoint: ${identity.error}`);
  if (!isSafeNonNegativeInteger(checkpoint.tick)) {
    return fail("snapshot checkpoint.tick must be a non-negative safe integer");
  }
  if (!isFiniteNonNegative(checkpoint.simulationTimeHours)) {
    return fail(
      "snapshot checkpoint.simulationTimeHours must be finite and non-negative",
    );
  }
  if (!isSafeNonNegativeInteger(checkpoint.commandCount)) {
    return fail(
      "snapshot checkpoint.commandCount must be a non-negative safe integer",
    );
  }

  if (checkpoint.authority === "composed") {
    if (!isRecord(checkpoint.composedState) || !isRecord(checkpoint.metrics)) {
      return fail(
        "composed snapshot checkpoint requires composedState and metrics objects",
      );
    }
  } else {
    if (!isFiniteNonNegative(checkpoint.syntheticPopulation)) {
      return fail(
        "synthetic snapshot checkpoint.syntheticPopulation must be finite and non-negative",
      );
    }
    if (!Array.isArray(checkpoint.rngState) || checkpoint.rngState.length !== 4) {
      return fail("synthetic snapshot checkpoint.rngState must be a four-word array");
    }
  }

  for (let index = 0; index < value.events.length; index += 1) {
    const event = parseEvent(value.events[index]);
    if (!event.ok) return fail(`snapshot.events[${index}]: ${event.error}`);
  }

  return { ok: true, value: value as unknown as SimulationSnapshot };
}

export function parseWorkerRequest(value: unknown): ProtocolParseResult<WorkerRequest> {
  if (!isRecord(value)) return fail("Worker request must be an object");
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return fail(
      `Unsupported protocol version: ${String(value.protocolVersion)}`,
    );
  }

  if (value.type === "initialize") {
    const identity = parseIdentity(value.identity);
    if (!identity.ok) return fail(`initialize request: ${identity.error}`);
    if (value.composedConfig !== undefined && !isRecord(value.composedConfig)) {
      return fail("initialize request composedConfig must be an object when present");
    }
    return { ok: true, value: value as unknown as WorkerRequest };
  }

  if (value.type === "command") {
    const command = parseCommand(value.command);
    if (!command.ok) return fail(`command request: ${command.error}`);
    return { ok: true, value: value as unknown as WorkerRequest };
  }

  return fail("Worker request type is unsupported");
}

export function parseWorkerResponse(
  value: unknown,
): ProtocolParseResult<WorkerResponse> {
  if (!isRecord(value)) return fail("Worker response must be an object");
  if (value.protocolVersion !== PROTOCOL_VERSION) {
    return fail(
      `Worker protocol mismatch: expected ${PROTOCOL_VERSION}, received ${String(
        value.protocolVersion,
      )}`,
    );
  }

  if (value.type === "error") {
    if (typeof value.message !== "string" || value.message.length === 0) {
      return fail("Worker error response.message must be a non-empty string");
    }
    if (value.commandId !== undefined && typeof value.commandId !== "string") {
      return fail("Worker error response.commandId must be a string when present");
    }
    return { ok: true, value: value as unknown as WorkerResponse };
  }

  if (value.type === "ready") {
    const snapshot = parseSnapshot(value.snapshot);
    if (!snapshot.ok) return fail(`Worker ready response: ${snapshot.error}`);
    return { ok: true, value: value as unknown as WorkerResponse };
  }

  if (value.type === "snapshot") {
    if (typeof value.commandId !== "string" || value.commandId.length === 0) {
      return fail("Worker snapshot response.commandId must be a non-empty string");
    }
    const snapshot = parseSnapshot(value.snapshot);
    if (!snapshot.ok) return fail(`Worker snapshot response: ${snapshot.error}`);
    return { ok: true, value: value as unknown as WorkerResponse };
  }

  return fail("Worker response type is unsupported");
}
