import { describe, expect, it, vi } from "vitest";
import type { ExperimentRuntime } from "./experimentRuntime";
import { PetraRuntimeError } from "./runtimeRecovery";
import { createPrevalidatedExperimentRuntimeFactory } from "./validatedRuntimeFactory";

describe("prevalidated experiment runtime factory", () => {
  it("validates before constructing runtime authority", () => {
    const order: string[] = [];
    const runtime = {} as ExperimentRuntime;
    const factory = createPrevalidatedExperimentRuntimeFactory(
      () => {
        order.push("validate");
      },
      () => {
        order.push("create");
        return runtime;
      },
    );

    expect(factory()).toBe(runtime);
    expect(order).toEqual(["validate", "create"]);
  });

  it("refuses runtime construction when preset validation fails", () => {
    const createRuntime = vi.fn(() => ({} as ExperimentRuntime));
    const factory = createPrevalidatedExperimentRuntimeFactory(
      () => {
        throw new Error("scenario schema mismatch at environment.resourceContext");
      },
      createRuntime,
    );

    expect(() => factory()).toThrow(PetraRuntimeError);
    expect(createRuntime).not.toHaveBeenCalled();

    try {
      factory();
    } catch (error) {
      expect(error).toBeInstanceOf(PetraRuntimeError);
      expect((error as PetraRuntimeError).kind).toBe("preset");
      expect((error as PetraRuntimeError).source).toBe("setup");
    }
  });
});
