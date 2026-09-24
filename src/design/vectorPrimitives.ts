export const PETRA_VECTOR_PRIMITIVE_SCHEMA_VERSION = 1 as const;

export type PetraPrimitiveAnimationChannel =
  | "opacity"
  | "scale"
  | "transform"
  | "path-length"
  | "contour-morph";

export type PetraVectorPrimitiveId =
  | "round-colony-cluster"
  | "rounded-bacterial-rod"
  | "budding-cluster"
  | "hyphal-path"
  | "field-contour"
  | "selection-ring"
  | "intervention-marker"
  | "scientific-icon";

export interface NormalizedCircle {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
}

export interface NormalizedRoundedRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly radius: number;
}

export type PetraPrimitiveGeometry =
  | {
      readonly kind: "circle-cluster";
      readonly circles: readonly NormalizedCircle[];
    }
  | {
      readonly kind: "rounded-rect";
      readonly rect: NormalizedRoundedRect;
    }
  | {
      readonly kind: "path";
      readonly cap: "round";
      readonly join: "round";
    }
  | {
      readonly kind: "contour";
      readonly closed: true;
    }
  | {
      readonly kind: "ring";
      readonly innerRadius: number;
      readonly outerRadius: number;
    }
  | {
      readonly kind: "marker";
      readonly shaftWidth: number;
      readonly headRadius: number;
    }
  | {
      readonly kind: "icon";
      readonly viewBox: readonly [number, number, number, number];
    };

export interface PetraVectorPrimitiveSpec {
  readonly id: PetraVectorPrimitiveId;
  readonly geometry: PetraPrimitiveGeometry;
  readonly animationChannels: readonly PetraPrimitiveAnimationChannel[];
  readonly semanticBoundary: "presentation-only";
  /**
   * Consumers must have this external evidence before associating this
   * geometry with a biological identity or user action.
   */
  readonly requires: "authoritative-organism-kind" | "authoritative-field" | "presentation-intent";
}

/**
 * Reusable geometry vocabulary for Petra's calm flat-vector language.
 *
 * These specs describe drawable shapes only. They intentionally do not map
 * lineage IDs, colors, array positions, or density values to organism kinds.
 * That association belongs to an authoritative scientific/runtime contract.
 */
export const PETRA_VECTOR_PRIMITIVES = Object.freeze({
  "round-colony-cluster": Object.freeze({
    id: "round-colony-cluster",
    geometry: Object.freeze({
      kind: "circle-cluster",
      circles: Object.freeze([
        Object.freeze({ x: 0.34, y: 0.5, radius: 0.22 }),
        Object.freeze({ x: 0.56, y: 0.36, radius: 0.19 }),
        Object.freeze({ x: 0.66, y: 0.58, radius: 0.24 }),
      ]),
    }),
    animationChannels: Object.freeze(["opacity", "scale", "transform"] as const),
    semanticBoundary: "presentation-only",
    requires: "authoritative-organism-kind",
  }),
  "rounded-bacterial-rod": Object.freeze({
    id: "rounded-bacterial-rod",
    geometry: Object.freeze({
      kind: "rounded-rect",
      rect: Object.freeze({
        x: 0.12,
        y: 0.32,
        width: 0.76,
        height: 0.36,
        radius: 0.18,
      }),
    }),
    animationChannels: Object.freeze(["opacity", "scale", "transform"] as const),
    semanticBoundary: "presentation-only",
    requires: "authoritative-organism-kind",
  }),
  "budding-cluster": Object.freeze({
    id: "budding-cluster",
    geometry: Object.freeze({
      kind: "circle-cluster",
      circles: Object.freeze([
        Object.freeze({ x: 0.42, y: 0.52, radius: 0.28 }),
        Object.freeze({ x: 0.7, y: 0.34, radius: 0.16 }),
      ]),
    }),
    animationChannels: Object.freeze(["opacity", "scale", "transform"] as const),
    semanticBoundary: "presentation-only",
    requires: "authoritative-organism-kind",
  }),
  "hyphal-path": Object.freeze({
    id: "hyphal-path",
    geometry: Object.freeze({
      kind: "path",
      cap: "round",
      join: "round",
    }),
    animationChannels: Object.freeze([
      "opacity",
      "path-length",
      "contour-morph",
    ] as const),
    semanticBoundary: "presentation-only",
    requires: "authoritative-organism-kind",
  }),
  "field-contour": Object.freeze({
    id: "field-contour",
    geometry: Object.freeze({
      kind: "contour",
      closed: true,
    }),
    animationChannels: Object.freeze(["opacity", "contour-morph"] as const),
    semanticBoundary: "presentation-only",
    requires: "authoritative-field",
  }),
  "selection-ring": Object.freeze({
    id: "selection-ring",
    geometry: Object.freeze({
      kind: "ring",
      innerRadius: 0.72,
      outerRadius: 1,
    }),
    animationChannels: Object.freeze(["opacity", "scale"] as const),
    semanticBoundary: "presentation-only",
    requires: "presentation-intent",
  }),
  "intervention-marker": Object.freeze({
    id: "intervention-marker",
    geometry: Object.freeze({
      kind: "marker",
      shaftWidth: 0.18,
      headRadius: 0.24,
    }),
    animationChannels: Object.freeze(["opacity", "scale", "transform"] as const),
    semanticBoundary: "presentation-only",
    requires: "presentation-intent",
  }),
  "scientific-icon": Object.freeze({
    id: "scientific-icon",
    geometry: Object.freeze({
      kind: "icon",
      viewBox: Object.freeze([0, 0, 24, 24] as const),
    }),
    animationChannels: Object.freeze(["opacity", "scale"] as const),
    semanticBoundary: "presentation-only",
    requires: "presentation-intent",
  }),
} as const satisfies Readonly<
  Record<PetraVectorPrimitiveId, PetraVectorPrimitiveSpec>
>);

export function resolvePetraVectorPrimitive(
  id: PetraVectorPrimitiveId,
): PetraVectorPrimitiveSpec {
  const primitive: PetraVectorPrimitiveSpec | undefined =
    PETRA_VECTOR_PRIMITIVES[id];
  if (primitive === undefined) {
    throw new RangeError(`unknown Petra vector primitive: ${String(id)}`);
  }
  return primitive;
}
