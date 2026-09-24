import { describe, expect, it, vi } from "vitest";
import { AppErrorBoundary } from "./AppErrorBoundary";

describe("AppErrorBoundary", () => {
  it("projects presentation failures to bounded recovery copy", () => {
    const state = AppErrorBoundary.getDerivedStateFromError(
      new Error("secret stack-adjacent diagnostic"),
    );

    expect(state.failure?.kind).toBe("presentation");
    expect(state.failure?.source).toBe("presentation");
    expect(state.failure?.userMessage).not.toContain("secret");
    expect(state.failure?.diagnostic).toContain("secret");
  });

  it("keeps explicit reload injection available for host-controlled recovery", () => {
    const onReload = vi.fn();
    const boundary = new AppErrorBoundary({
      children: null,
      onReload,
    });

    boundary.state = AppErrorBoundary.getDerivedStateFromError(
      new Error("render failed"),
    );
    const rendered = boundary.render();

    expect(rendered).not.toBeNull();
    expect(onReload).not.toHaveBeenCalled();
  });
});
