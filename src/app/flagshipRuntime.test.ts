import { describe, expect, it } from "vitest";
import { WorkerSession, type WorkerPort } from "./workerSession";
import { createDefaultFlagshipRuntimeFactory } from "./flagshipRuntime";

function createIdleSession(): WorkerSession {
  const port: WorkerPort = {
    post() {},
    subscribe() {
      return () => {};
    },
    dispose() {},
  };
  return new WorkerSession(port);
}

describe("default flagship runtime factory", () => {
  it("constructs a fresh idle composed runtime only when the factory is invoked", () => {
    let sessions = 0;
    const factory = createDefaultFlagshipRuntimeFactory(() => {
      sessions += 1;
      return createIdleSession();
    });

    expect(sessions).toBe(0);

    const first = factory();
    expect(sessions).toBe(1);
    expect(first.state.worker.phase).toBe("idle");
    expect(first.state.controls.identity.parameterSetVersion).toBe("1.2.0");

    const second = factory();
    expect(sessions).toBe(2);
    expect(second).not.toBe(first);
    expect(second.state.controls.identity).toEqual(first.state.controls.identity);

    first.dispose();
    second.dispose();
  });
});
