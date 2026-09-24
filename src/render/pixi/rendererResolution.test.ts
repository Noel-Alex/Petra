import { describe, expect, it } from "vitest";
import {
  MAX_RENDERER_RESOLUTION,
  nextRendererResolution,
  rendererResolutionForDevicePixelRatio,
  watchRendererResolution,
  type ResolutionMediaQueryList,
} from "./rendererResolution";

class FakeMediaQuery implements ResolutionMediaQueryList {
  private listeners = new Set<() => void>();

  addEventListener(_type: "change", listener: () => void): void {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "change", listener: () => void): void {
    this.listeners.delete(listener);
  }

  emitChange(): void {
    for (const listener of [...this.listeners]) listener();
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

describe("renderer resolution policy", () => {
  it("caps high-DPR displays and safely falls back for invalid DPR", () => {
    expect(rendererResolutionForDevicePixelRatio(3)).toBe(
      MAX_RENDERER_RESOLUTION,
    );
    expect(rendererResolutionForDevicePixelRatio(1.5)).toBe(1.5);
    expect(rendererResolutionForDevicePixelRatio(undefined)).toBe(1);
    expect(rendererResolutionForDevicePixelRatio(0)).toBe(1);
    expect(rendererResolutionForDevicePixelRatio(Number.NaN)).toBe(1);
  });

  it("reports only meaningful capped resolution changes", () => {
    expect(nextRendererResolution(2, 3)).toBeNull();
    expect(nextRendererResolution(2, 1.25)).toBe(1.25);
    expect(nextRendererResolution(1, 1.0001)).toBeNull();
  });

  it("rebinds after DPR changes and disposes the active watcher", () => {
    let dpr = 2;
    const queries: Array<{ query: string; media: FakeMediaQuery }> = [];
    const changes: number[] = [];

    const watcher = watchRendererResolution(
      {
        readDevicePixelRatio: () => dpr,
        matchMedia(query) {
          const media = new FakeMediaQuery();
          queries.push({ query, media });
          return media;
        },
      },
      2,
      (resolution) => changes.push(resolution),
    );

    expect(queries[0]?.query).toBe("(resolution: 2dppx)");
    expect(queries[0]?.media.listenerCount).toBe(1);

    dpr = 1.5;
    queries[0]!.media.emitChange();

    expect(changes).toEqual([1.5]);
    expect(queries[0]?.media.listenerCount).toBe(0);
    expect(queries[1]?.query).toBe("(resolution: 1.5dppx)");
    expect(queries[1]?.media.listenerCount).toBe(1);

    watcher.dispose();
    expect(queries[1]?.media.listenerCount).toBe(0);

    dpr = 1;
    queries[1]!.media.emitChange();
    expect(changes).toEqual([1.5]);
  });
});
