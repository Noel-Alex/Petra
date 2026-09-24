import { describe, expect, it } from "vitest";
import {
  PetraRuntimeError,
  classifyDiagnostic,
  normalizeRuntimeFailure,
  runtimeFailure,
} from "./runtimeRecovery";

describe("runtime recovery failure projection", () => {
  it("keeps raw diagnostics internal while exposing bounded user copy", () => {
    const failure = normalizeRuntimeFailure(
      new Error("Worker payload secret=abc crashed"),
      "worker",
    );

    expect(failure.kind).toBe("runtime");
    expect(failure.diagnostic).toContain("secret=abc");
    expect(failure.userMessage).not.toContain("secret=abc");
    expect(failure.userMessage).toContain("authoritative simulation");
  });

  it("distinguishes protocol, preset, and model failures", () => {
    expect(classifyDiagnostic("Worker protocol mismatch")).toBe("protocol");
    expect(classifyDiagnostic("Scenario version is unsupported")).toBe("preset");
    expect(classifyDiagnostic("parameter-set configuration binding failed")).toBe(
      "model",
    );
  });

  it("preserves explicit typed failure categories", () => {
    const failure = normalizeRuntimeFailure(
      new PetraRuntimeError("preset", "setup", "schema rejected field x"),
      "runtime",
    );

    expect(failure).toEqual(
      runtimeFailure("preset", "setup", "schema rejected field x"),
    );
    expect(failure.recoverable).toBe(false);
  });

  it("does not stringify arbitrary object payloads into diagnostics", () => {
    const failure = normalizeRuntimeFailure(
      { rawPayload: "do-not-expose" },
      "worker",
    );

    expect(failure.diagnostic).toBe("Non-Error runtime failure");
    expect(failure.userMessage).not.toContain("do-not-expose");
  });
});
