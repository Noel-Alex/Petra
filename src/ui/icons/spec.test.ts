import { describe, expect, it } from "vitest";

import {
  PETRA_ICONS,
  PETRA_ICON_VIEWBOX,
  PROVENANCE_ICON_MAP,
  iconSpec,
  type IconPrimitive,
} from "./spec";

describe("Petra semantic icons", () => {
  it("gives every icon a stable accessible label and non-empty geometry", () => {
    const labels = new Set<string>();

    for (const [name, spec] of Object.entries(PETRA_ICONS)) {
      expect(spec.name).toBe(name);
      expect(spec.label.trim().length).toBeGreaterThan(0);
      expect(labels.has(spec.label)).toBe(false);
      labels.add(spec.label);
      expect(spec.viewBox).toEqual(PETRA_ICON_VIEWBOX);
      expect(spec.strokeWidth).toBeGreaterThan(0);
      expect(spec.primitives.length).toBeGreaterThan(0);
    }
  });

  it("keeps all authored geometry inside the shared 24×24 canvas", () => {
    for (const spec of Object.values(PETRA_ICONS)) {
      for (const primitive of spec.primitives) {
        for (const value of coordinates(primitive)) {
          expect(Number.isFinite(value)).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(24);
        }
      }
    }
  });

  it("maps every provenance icon token to Petra-owned geometry", () => {
    expect(Object.keys(PROVENANCE_ICON_MAP).sort()).toEqual([
      "bridge",
      "equation",
      "eye",
      "flask",
      "model",
      "ruler",
      "tune",
      "wrench",
    ]);

    for (const name of Object.values(PROVENANCE_ICON_MAP)) {
      expect(iconSpec(name).primitives.length).toBeGreaterThan(0);
    }
  });

  it("keeps critical concepts geometrically distinct", () => {
    expect(iconSpec("intervention").primitives).not.toEqual(
      iconSpec("nutrient").primitives,
    );
    expect(iconSpec("lineage").primitives).not.toEqual(
      iconSpec("timeline").primitives,
    );
    expect(iconSpec("measured").primitives).not.toEqual(
      iconSpec("visual").primitives,
    );
    expect(iconSpec("inoculate").primitives).not.toEqual(
      iconSpec("antibiotic").primitives,
    );
    expect(iconSpec("antibiotic").primitives).not.toEqual(
      iconSpec("fungus").primitives,
    );
    expect(iconSpec("fungus").primitives).not.toEqual(
      iconSpec("nutrient").primitives,
    );
  });

  it("ships dedicated original geometry for every showcase placement tool", () => {
    expect(["inoculate", "fungus", "antibiotic", "nutrient"].map((name) =>
      iconSpec(name as "inoculate" | "fungus" | "antibiotic" | "nutrient").label,
    )).toEqual(["Inoculate", "Fungal placement", "Antibiotic", "Nutrient field"]);
  });
});

function coordinates(primitive: IconPrimitive): readonly number[] {
  switch (primitive.kind) {
    case "line":
      return [primitive.x1, primitive.y1, primitive.x2, primitive.y2];
    case "circle":
      return [primitive.cx, primitive.cy, primitive.r];
    case "rect":
      return [
        primitive.x,
        primitive.y,
        primitive.width,
        primitive.height,
        ...(primitive.rx === undefined ? [] : [primitive.rx]),
      ];
    case "polyline":
      return primitive.points.flatMap(([x, y]) => [x, y]);
  }
}
