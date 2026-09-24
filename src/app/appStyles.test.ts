import { describe, expect, it } from "vitest";

// Vite/Vitest supports raw asset imports; the project intentionally does not include vite/client globals.
// @ts-expect-error raw CSS import is provided by Vite at test runtime.
import appCss from "./app.css?raw";

describe("app shell focus visibility contract", () => {
  it("keeps keyboard focus visually distinct from hover", () => {
    expect(appCss).toContain("button:hover {");
    expect(appCss).toContain("button:focus-visible,");
    expect(appCss).toContain("select:focus-visible,");
    expect(appCss).toContain('role="button"');
    expect(appCss).toContain("outline: 3px solid");
    expect(appCss).toContain("outline-offset: 3px");
    expect(appCss).not.toContain("outline: none");
  });

  it("keeps focus visibility independent of motion preference", () => {
    const focusBlock = appCss.slice(
      appCss.indexOf("button:focus-visible,"),
      appCss.indexOf("button:disabled,"),
    );
    expect(focusBlock).toContain("outline:");
    expect(focusBlock).not.toContain("transition");
    expect(focusBlock).not.toContain("animation");
  });
});
