import type {
  WorkerRequest,
  WorkerResponse,
} from "../sim/protocol";

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
