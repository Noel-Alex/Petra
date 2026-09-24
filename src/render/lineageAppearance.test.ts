import { describe, expect, it } from "vitest";

import { petraVisualColor } from "../design/visualTokens";
import {
  LINEAGE_APPEARANCE_SCHEMA_VERSION,
  LINEAGE_APPEARANCE_TOKENS,
  isLineageAppearanceToken,
  resolveLineageAppearance,
  type LineageAppearanceToken,
} from "./lineageAppearance";

describe("lineage appearance vocabulary", () => {
  it("keeps a bounded versioned Petra palette", () => {
    expect(LINEAGE_APPEARANCE_SCHEMA_VERSION).toBe(1);
    expect(LINEAGE_APPEARANCE_TOKENS).toEqual([
      "lineage-cyan",
      "lineage-coral",
      "lineage-gold",
      "lineage-mint",
      "lineage-violet",
    ]);
  });

  it("keeps stable lineage IDs while consuming the shared matte palette", () => {
    expect(resolveLineageAppearance("lineage-cyan").color).toBe(
      petraVisualColor("teal"),
    );
    expect(resolveLineageAppearance("lineage-coral").color).toBe(
      petraVisualColor("coral"),
    );
    expect(resolveLineageAppearance("lineage-gold").color).toBe(
      petraVisualColor("amber"),
    );
    expect(resolveLineageAppearance("lineage-mint").color).toBe(
      petraVisualColor("mint"),
    );
    expect(resolveLineageAppearance("lineage-violet").color).toBe(
      petraVisualColor("lavender"),
    );
  });

  it("resolves appearance by token rather than array position", () => {
    const firstOrder: readonly LineageAppearanceToken[] = [
      "lineage-cyan",
      "lineage-coral",
      "lineage-violet",
    ];
    const secondOrder = [...firstOrder].reverse();

    const first = Object.fromEntries(
      firstOrder.map((token) => [
        token,
        resolveLineageAppearance(token).color,
      ]),
    );
    const second = Object.fromEntries(
      secondOrder.map((token) => [
        token,
        resolveLineageAppearance(token).color,
      ]),
    );

    expect(second).toEqual(first);
    expect(first["lineage-cyan"]).not.toBe(first["lineage-coral"]);
  });

  it("rejects unsupported tokens instead of assigning a positional fallback", () => {
    expect(isLineageAppearanceToken("lineage-cyan")).toBe(true);
    expect(isLineageAppearanceToken("lineage-unknown")).toBe(false);
    expect(() => resolveLineageAppearance("lineage-unknown")).toThrow(
      /unsupported lineage appearance token/,
    );
  });
});
