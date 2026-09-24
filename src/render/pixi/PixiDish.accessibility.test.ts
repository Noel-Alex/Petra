import { describe, expect, it } from "vitest";

import source from "./PixiDish.tsx?raw";

describe("PixiDish renderer-status source contract", () => {
  it("mounts one status region independently of the failure-only fallback", () => {
    expect(source.match(/role="status"/g)).toHaveLength(1);
    expect(source).toContain('data-render-status-announcement="true"');

    const failureConditional = source.indexOf(
      'renderEnabled && startup.status === "failed"',
    );
    const stableStatus = source.indexOf(
      'data-render-status-announcement="true"',
    );
    const demoConditional = source.indexOf("{usingDemo ? (");

    expect(failureConditional).toBeGreaterThan(-1);
    expect(stableStatus).toBeGreaterThan(failureConditional);
    expect(demoConditional).toBeGreaterThan(stableStatus);
  });

  it("does not place Retry renderer inside live-region markup", () => {
    const stableStatus = source.indexOf(
      'data-render-status-announcement="true"',
    );
    const statusClose = source.indexOf("</span>", stableStatus);
    const retry = source.lastIndexOf("Retry renderer");

    expect(statusClose).toBeGreaterThan(stableStatus);
    expect(retry).toBeGreaterThan(statusClose);
  });
});
