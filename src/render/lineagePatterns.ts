export const LINEAGE_PATTERN_SCHEMA_VERSION = 1 as const;

export const LINEAGE_PATTERN_TOKENS = [
  "solid-ring",
  "double-ring",
] as const;

export type LineagePatternToken = (typeof LINEAGE_PATTERN_TOKENS)[number];

export interface LineagePatternGeometry {
  readonly token: LineagePatternToken;
  /**
   * Neutral ring radii relative to the marker radius.
   *
   * Ring count/spacing is visual-only identity. It must not encode fitness,
   * resistance, abundance, confidence, or any other scientific quantity.
   */
  readonly ringScales: readonly number[];
}

const GEOMETRY: Readonly<Record<LineagePatternToken, LineagePatternGeometry>> =
  Object.freeze({
    "solid-ring": Object.freeze({
      token: "solid-ring",
      ringScales: Object.freeze([1]),
    }),
    "double-ring": Object.freeze({
      token: "double-ring",
      ringScales: Object.freeze([1, 1.45]),
    }),
  });

export function isLineagePatternToken(
  value: string,
): value is LineagePatternToken {
  return (LINEAGE_PATTERN_TOKENS as readonly string[]).includes(value);
}

export function resolveLineagePattern(
  token: string,
): LineagePatternGeometry {
  if (!isLineagePatternToken(token)) {
    throw new RangeError(`unsupported lineage pattern token: ${token}`);
  }

  return GEOMETRY[token];
}
