import { describe, expect, it } from "vitest";
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
});
