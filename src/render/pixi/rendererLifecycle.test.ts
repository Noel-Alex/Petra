import { describe, expect, it } from "vitest";
import {
  beginRendererInitialization,
  toRendererInitializationError,
  type DestroyableRenderer,
} from "./rendererLifecycle";

interface FakeRenderer extends DestroyableRenderer {
  readonly id: string;
  readonly destroyCalls: { count: number };
}

function fakeRenderer(id: string): FakeRenderer {
  const destroyCalls = { count: 0 };
  return {
    id,
    destroyCalls,
    destroy() {
      destroyCalls.count += 1;
    },
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("renderer initialization lifecycle", () => {
  it("surfaces failure and allows a clean retry", async () => {
    const errors: string[] = [];
    const ready: string[] = [];

    const first = beginRendererInitialization(
      async () => {
        throw new Error("WebGL unavailable");
      },
      {
        onReady(renderer) {
          ready.push(renderer.id);
        },
        onError(error) {
          errors.push(error.message);
        },
      },
    );

    await flushMicrotasks();
    expect(errors).toEqual(["WebGL unavailable"]);
    expect(ready).toEqual([]);
    first.dispose();

    const retryRenderer = fakeRenderer("retry");
    const retry = beginRendererInitialization(async () => retryRenderer, {
      onReady(renderer) {
        ready.push(renderer.id);
      },
      onError(error) {
        errors.push(error.message);
      },
    });

    await flushMicrotasks();
    expect(ready).toEqual(["retry"]);
    expect(errors).toEqual(["WebGL unavailable"]);

    retry.dispose();
    expect(retryRenderer.destroyCalls.count).toBe(1);
  });

  it("destroys a renderer that resolves after disposal without attaching it", async () => {
    let resolveRenderer: ((renderer: FakeRenderer) => void) | undefined;
    const deferred = new Promise<FakeRenderer>((resolve) => {
      resolveRenderer = resolve;
    });
    const ready: string[] = [];
    const errors: string[] = [];
    const renderer = fakeRenderer("late");

    const handle = beginRendererInitialization(() => deferred, {
      onReady(value) {
        ready.push(value.id);
      },
      onError(error) {
        errors.push(error.message);
      },
    });

    handle.dispose();
    resolveRenderer?.(renderer);
    await flushMicrotasks();

    expect(ready).toEqual([]);
    expect(errors).toEqual([]);
    expect(renderer.destroyCalls.count).toBe(1);
  });

  it("ignores a late rejection after disposal", async () => {
    let rejectRenderer: ((reason?: unknown) => void) | undefined;
    const deferred = new Promise<FakeRenderer>((_resolve, reject) => {
      rejectRenderer = reject;
    });
    const errors: string[] = [];

    const handle = beginRendererInitialization(() => deferred, {
      onReady() {
        throw new Error("should not become ready");
      },
      onError(error) {
        errors.push(error.message);
      },
    });

    handle.dispose();
    rejectRenderer?.(new Error("late failure"));
    await flushMicrotasks();

    expect(errors).toEqual([]);
  });

  it("normalizes non-Error rejection reasons", () => {
    expect(toRendererInitializationError("GPU context failed").message).toBe(
      "GPU context failed",
    );
    expect(toRendererInitializationError(null).message).toBe(
      "The Petri dish renderer could not start.",
    );
  });
});
