export type RuntimeFailureKind =
  | "preset"
  | "protocol"
  | "model"
  | "runtime"
  | "presentation";

export type RuntimeFailureSource =
  | "setup"
  | "worker"
  | "integration"
  | "presentation";

export interface RuntimeFailure {
  readonly kind: RuntimeFailureKind;
  readonly source: RuntimeFailureSource;
  readonly title: string;
  readonly userMessage: string;
  /** Internal diagnostic only. Never render this directly in expo UI. */
  readonly diagnostic: string | null;
  readonly recoverable: boolean;
}

const COPY: Record<
  RuntimeFailureKind,
  Pick<RuntimeFailure, "title" | "userMessage" | "recoverable">
> = {
  preset: {
    title: "Experiment preset rejected",
    userMessage:
      "The selected experiment preset is invalid or incompatible. Petra did not start a partial simulation.",
    recoverable: false,
  },
  protocol: {
    title: "Simulation runtime incompatible",
    userMessage:
      "The simulation runtime is incompatible with this Petra build. No further commands were accepted.",
    recoverable: true,
  },
  model: {
    title: "Scientific model configuration rejected",
    userMessage:
      "The scientific model configuration was rejected. Petra did not continue with partial scientific authority.",
    recoverable: false,
  },
  runtime: {
    title: "Simulation runtime stopped",
    userMessage:
      "The authoritative simulation stopped unexpectedly. The current run is paused and can be retried explicitly.",
    recoverable: true,
  },
  presentation: {
    title: "Interface recovery required",
    userMessage:
      "Petra's interface hit an unexpected presentation error. Scientific state was not changed by this screen.",
    recoverable: true,
  },
};

export class PetraRuntimeError extends Error {
  readonly kind: RuntimeFailureKind;
  readonly source: RuntimeFailureSource;

  constructor(
    kind: RuntimeFailureKind,
    source: RuntimeFailureSource,
    diagnostic?: string,
  ) {
    super(diagnostic ?? COPY[kind].userMessage);
    this.name = "PetraRuntimeError";
    this.kind = kind;
    this.source = source;
  }
}

export function runtimeFailure(
  kind: RuntimeFailureKind,
  source: RuntimeFailureSource,
  diagnostic: string | null = null,
): RuntimeFailure {
  return {
    kind,
    source,
    ...COPY[kind],
    diagnostic,
  };
}

export function normalizeRuntimeFailure(
  error: unknown,
  source: RuntimeFailureSource,
  fallbackKind: RuntimeFailureKind = "runtime",
): RuntimeFailure {
  if (error instanceof PetraRuntimeError) {
    return runtimeFailure(error.kind, error.source, error.message);
  }

  const diagnostic = diagnosticMessage(error);
  return runtimeFailure(
    classifyDiagnostic(diagnostic, fallbackKind),
    source,
    diagnostic,
  );
}

export function classifyDiagnostic(
  diagnostic: string | null,
  fallbackKind: RuntimeFailureKind = "runtime",
): RuntimeFailureKind {
  if (diagnostic === null) return fallbackKind;

  const message = diagnostic.toLowerCase();

  if (
    message.includes("protocol") ||
    message.includes("command mismatch") ||
    message.includes("response with no pending request") ||
    message.includes("deserial")
  ) {
    return "protocol";
  }

  if (
    message.includes("preset") ||
    message.includes("scenario version") ||
    message.includes("scenario id")
  ) {
    return "preset";
  }

  if (
    message.includes("parameter-set") ||
    message.includes("parameter set") ||
    message.includes("configuration binding") ||
    message.includes("scientific model")
  ) {
    return "model";
  }

  return fallbackKind;
}

function diagnosticMessage(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error === null || error === undefined) return null;
  return "Non-Error runtime failure";
}
