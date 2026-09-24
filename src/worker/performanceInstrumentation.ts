import type {
  WorkerRequest,
  WorkerResponse,
} from "../sim/protocol";
import {
  parseWorkerRequest,
  parseWorkerResponse,
  type ProtocolParseResult,
} from "../sim/protocolRuntime";

export const WORKER_PERFORMANCE_DIAGNOSTICS_VERSION = 1 as const;

/**
 * Optional transport-only diagnostics. These values are observational and are
 * deliberately excluded from simulation state, checkpoint identity, and trace
 * hashing.
 */
export interface WorkerExecutionDiagnostics {
  readonly version: typeof WORKER_PERFORMANCE_DIAGNOSTICS_VERSION;
  readonly executionDurationMs: number;
}

export type InstrumentedWorkerRequest = WorkerRequest & {
  readonly performanceDiagnostics?: true;
};

export type InstrumentedWorkerResponse = WorkerResponse & {
  readonly performanceDiagnostics?: WorkerExecutionDiagnostics;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function requestCommandId(request: WorkerRequest): string | null {
  return request.type === "command" ? request.command.id : null;
}

/**
 * Validates the core protocol first, then the optional transport-only request
 * diagnostics extension. Successful parsing returns the original payload.
 */
export function parseInstrumentedWorkerRequest(
  value: unknown,
): ProtocolParseResult<InstrumentedWorkerRequest> {
  const parsed = parseWorkerRequest(value);
  if (!parsed.ok) return parsed;

  const record = asRecord(value);
  if (record === null) {
    return {
      ok: false,
      error: "Invalid worker request: expected an object",
      commandId: requestCommandId(parsed.value),
    };
  }
  if (
    record.performanceDiagnostics !== undefined &&
    record.performanceDiagnostics !== true
  ) {
    return {
      ok: false,
      error:
        "Invalid worker request: performanceDiagnostics must be true when present",
      commandId: requestCommandId(parsed.value),
    };
  }

  return { ok: true, value: value as InstrumentedWorkerRequest };
}

/**
 * Validates the core protocol first, then the optional transport-only response
 * diagnostics extension. Invalid diagnostics never supply command correlation.
 */
export function parseInstrumentedWorkerResponse(
  value: unknown,
): ProtocolParseResult<InstrumentedWorkerResponse> {
  const parsed = parseWorkerResponse(value);
  if (!parsed.ok) return parsed;

  const record = asRecord(value);
  if (record === null) {
    return {
      ok: false,
      error: "Invalid worker response: expected an object",
      commandId: null,
    };
  }
  if (record.performanceDiagnostics === undefined) {
    return { ok: true, value: value as InstrumentedWorkerResponse };
  }

  const diagnostics = asRecord(record.performanceDiagnostics);
  if (
    diagnostics === null ||
    diagnostics.version !== WORKER_PERFORMANCE_DIAGNOSTICS_VERSION ||
    typeof diagnostics.executionDurationMs !== "number" ||
    !Number.isFinite(diagnostics.executionDurationMs) ||
    diagnostics.executionDurationMs < 0
  ) {
    return {
      ok: false,
      error: "Invalid worker response: performanceDiagnostics is invalid",
      commandId: null,
    };
  }

  return { ok: true, value: value as InstrumentedWorkerResponse };
}

/**
 * Estimates application payload bytes carried by structured clone. Browser
 * framing/implementation overhead is intentionally excluded because the Web
 * Worker API does not expose exact transfer byte counts.
 */
export function estimateStructuredClonePayloadBytes(value: unknown): number {
  const seen = new Set<object>();

  function visit(current: unknown): number {
    if (current === null || current === undefined) return 0;

    switch (typeof current) {
      case "boolean":
        return 1;
      case "number":
        return 8;
      case "bigint":
        return 8;
      case "string":
        return new TextEncoder().encode(current).byteLength;
      case "object":
        break;
      default:
        return 0;
    }

    const object = current as object;
    if (seen.has(object)) return 0;
    seen.add(object);

    if (object instanceof ArrayBuffer) return object.byteLength;
    if (ArrayBuffer.isView(object)) return object.byteLength;
    if (Array.isArray(object)) {
      return object.reduce((total, item) => total + visit(item), 0);
    }

    let total = 0;
    for (const [key, item] of Object.entries(object)) {
      total += new TextEncoder().encode(key).byteLength;
      total += visit(item);
    }
    return total;
  }

  return visit(value);
}
