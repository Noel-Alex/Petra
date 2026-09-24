import { describe, expect, it } from "vitest";

import { createRendererDemoSnapshot } from "../render/pixi/demoSnapshot";
import {
  INITIAL_DISH_RENDER_SOURCE_STATE,
  resolveDishRenderSource,
  type DemoSnapshotFactory,
  type DishRenderSourceState,
} from "./dishRenderSource";

function countingFactory(): {
  readonly create: DemoSnapshotFactory;
  readonly calls: () => number;
} {
  let count = 0;
  return {
    create() {
      count += 1;
      return {
        ...createRendererDemoSnapshot(12),
        snapshotId: "visual-demo-" + count,
        samplingIdentity: "visual-demo-" + count,
      };
    },
    calls: () => count,
  };
}

describe("dish render-source transaction", () => {
  it("waits without generating demo data when authority is absent and demo mode is off", () => {
    const factory = countingFactory();
    const resolved = resolveDishRenderSource(
      INITIAL_DISH_RENDER_SOURCE_STATE,
      { authoritativeSnapshot: null, demoMode: false },
      factory.create,
    );

    expect(resolved.source).toEqual({
      kind: "awaiting-authoritative-snapshot",
      snapshot: null,
    });
    expect(resolved.state).toBe(INITIAL_DISH_RENDER_SOURCE_STATE);
    expect(factory.calls()).toBe(0);
  });

  it("lets authoritative state win without invoking the demo factory", () => {
    const factory = countingFactory();
    const authoritative = {
      ...createRendererDemoSnapshot(12),
      snapshotId: "authoritative-run-state",
      samplingIdentity: "authoritative-run-state",
    };

    const resolved = resolveDishRenderSource(
      INITIAL_DISH_RENDER_SOURCE_STATE,
      { authoritativeSnapshot: authoritative, demoMode: true },
      factory.create,
    );

    expect(resolved.source.kind).toBe("authoritative-snapshot");
    expect(resolved.source.snapshot).toBe(authoritative);
    expect(resolved.state).toBe(INITIAL_DISH_RENDER_SOURCE_STATE);
    expect(factory.calls()).toBe(0);
  });

  it("creates one visual-demo snapshot and reuses the exact object identity", () => {
    const factory = countingFactory();
    const first = resolveDishRenderSource(
      INITIAL_DISH_RENDER_SOURCE_STATE,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );
    const second = resolveDishRenderSource(
      first.state,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );

    expect(first.source.kind).toBe("visual-demo");
    expect(second.source.kind).toBe("visual-demo");
    expect(first.source.snapshot).toBe(second.source.snapshot);
    expect(second.source.snapshot).toBe(first.state.demoSnapshot);
    expect(second.state).toBe(first.state);
    expect(factory.calls()).toBe(1);
  });

  it("keeps the mounted demo transaction cached across explicit demo off/on", () => {
    const factory = countingFactory();
    const first = resolveDishRenderSource(
      INITIAL_DISH_RENDER_SOURCE_STATE,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );
    const off = resolveDishRenderSource(
      first.state,
      { authoritativeSnapshot: null, demoMode: false },
      factory.create,
    );
    const onAgain = resolveDishRenderSource(
      off.state,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );

    expect(off.source.kind).toBe("awaiting-authoritative-snapshot");
    expect(onAgain.source.snapshot).toBe(first.source.snapshot);
    expect(factory.calls()).toBe(1);
  });

  it("does not let abandoned speculative candidates mutate committed cache state", () => {
    const factory = countingFactory();
    const committed = INITIAL_DISH_RENDER_SOURCE_STATE;

    const abandoned = resolveDishRenderSource(
      committed,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );
    const accepted = resolveDishRenderSource(
      committed,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );

    expect(committed.demoSnapshot).toBeNull();
    expect(abandoned.state).not.toBe(committed);
    expect(accepted.state).not.toBe(committed);
    expect(abandoned.source.snapshot).not.toBe(accepted.source.snapshot);
    expect(factory.calls()).toBe(2);

    const afterCommit = resolveDishRenderSource(
      accepted.state,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );

    expect(afterCommit.state).toBe(accepted.state);
    expect(afterCommit.source.snapshot).toBe(accepted.source.snapshot);
    expect(factory.calls()).toBe(2);
  });

  it("keeps visual-demo source identity separate from snapshot presence", () => {
    const factory = countingFactory();
    const resolved = resolveDishRenderSource(
      INITIAL_DISH_RENDER_SOURCE_STATE,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );

    expect(resolved.source.snapshot).not.toBeNull();
    expect(resolved.source.kind).toBe("visual-demo");
  });

  it("creates an independent demo fixture for a fresh mounted source state", () => {
    const factory = countingFactory();
    const first = resolveDishRenderSource(
      INITIAL_DISH_RENDER_SOURCE_STATE,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );
    const freshMountState: DishRenderSourceState = { demoSnapshot: null };
    const second = resolveDishRenderSource(
      freshMountState,
      { authoritativeSnapshot: null, demoMode: true },
      factory.create,
    );

    expect(first.source.snapshot).not.toBe(second.source.snapshot);
    expect(factory.calls()).toBe(2);
  });
});