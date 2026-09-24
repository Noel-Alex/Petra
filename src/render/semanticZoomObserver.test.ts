import { describe, expect, it, vi } from "vitest";

import { createSemanticZoomLevelObserver } from "./semanticZoomObserver";

describe("semantic zoom level observer", () => {
  it("emits the initial level exactly once", () => {
    const onChange = vi.fn();
    const observer = createSemanticZoomLevelObserver(onChange);

    expect(observer.update("dish")).toBe(true);
    expect(observer.update("dish")).toBe(false);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith("dish");
    expect(observer.current()).toBe("dish");
  });

  it("emits only when the named semantic level changes", () => {
    const onChange = vi.fn();
    const observer = createSemanticZoomLevelObserver(onChange);

    observer.update("dish");
    observer.update("dish");
    observer.update("colony");
    observer.update("colony");
    observer.update("representative-cell");
    observer.update("representative-cell");
    observer.update("colony");

    expect(onChange.mock.calls).toEqual([
      ["dish"],
      ["colony"],
      ["representative-cell"],
      ["colony"],
    ]);
  });

  it("reset re-arms one initial emission for a fresh renderer lifecycle", () => {
    const onChange = vi.fn();
    const observer = createSemanticZoomLevelObserver(onChange);

    observer.update("colony");
    observer.reset();

    expect(observer.current()).toBeNull();
    expect(observer.update("colony")).toBe(true);
    expect(observer.update("colony")).toBe(false);
    expect(onChange.mock.calls).toEqual([["colony"], ["colony"]]);
  });

  it("dispose clears state and makes later animation frames inert", () => {
    const onChange = vi.fn();
    const observer = createSemanticZoomLevelObserver(onChange);

    observer.update("dish");
    observer.dispose();

    expect(observer.current()).toBeNull();
    expect(observer.update("colony")).toBe(false);
    observer.reset();
    expect(observer.update("representative-cell")).toBe(false);
    expect(onChange).toHaveBeenCalledTimes(1);
  });
});
