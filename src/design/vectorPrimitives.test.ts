import { describe, expect, it } from "vitest";

import {
  PETRA_VECTOR_PRIMITIVES,
  PETRA_VECTOR_PRIMITIVE_SCHEMA_VERSION,
  resolvePetraVectorPrimitive,
  type PetraVectorPrimitiveId,
} from "./vectorPrimitives";

describe("Petra vector primitive vocabulary", () => {
  it("keeps the required calm code-rendered primitive families centralized", () => {
    expect(PETRA_VECTOR_PRIMITIVE_SCHEMA_VERSION).toBe(1);
    expect(Object.keys(PETRA_VECTOR_PRIMITIVES)).toEqual([
      "round-colony-cluster",
      "rounded-bacterial-rod",
      "budding-cluster",
      "hyphal-path",
      "field-contour",
      "selection-ring",
      "intervention-marker",
      "scientific-icon",
    ]);
  });

  it("keeps all primitive geometry presentation-only", () => {
    for (const primitive of Object.values(PETRA_VECTOR_PRIMITIVES)) {
      expect(primitive.semanticBoundary).toBe("presentation-only");
      expect(primitive.animationChannels.length).toBeGreaterThan(0);
    }
  });

  it("does not let organism silhouettes self-authorize biological identity", () => {
    expect(resolvePetraVectorPrimitive("rounded-bacterial-rod")).toMatchObject({
      requires: "authoritative-organism-kind",
      animationChannels: ["opacity", "scale", "transform"],
    });
    expect(resolvePetraVectorPrimitive("hyphal-path")).toMatchObject({
      requires: "authoritative-organism-kind",
      animationChannels: ["opacity", "path-length", "contour-morph"],
    });
  });

  it("separates field and interaction primitives from organism identity", () => {
    expect(resolvePetraVectorPrimitive("field-contour").requires).toBe(
      "authoritative-field",
    );
    expect(resolvePetraVectorPrimitive("selection-ring").requires).toBe(
      "presentation-intent",
    );
    expect(resolvePetraVectorPrimitive("intervention-marker").requires).toBe(
      "presentation-intent",
    );
  });

  it("rejects unsupported primitive identities", () => {
    expect(() =>
      resolvePetraVectorPrimitive("spiky-neon-burst" as PetraVectorPrimitiveId),
    ).toThrow(/unknown Petra vector primitive/);
  });
});
