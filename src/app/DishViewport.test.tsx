import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DishViewport } from "./DishViewport";

describe("DishViewport camera accessibility", () => {
  it("renders an explicit keyboard-reachable whole-dish reset control", () => {
    const html = renderToStaticMarkup(<DishViewport motion="off" />);

    expect(html).toContain(">Dish</button>");
    expect(html).toContain(
      'aria-label="Return Petri dish camera to whole-dish overview"',
    );
    expect(html).toContain("Escape");
    expect(html).toContain("Home");
    expect(html).toContain("visual demo · not biology");
  });
});
