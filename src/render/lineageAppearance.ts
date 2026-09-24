import { petraVisualColor } from "../design/visualTokens";

export const LINEAGE_APPEARANCE_SCHEMA_VERSION = 1 as const;

export const LINEAGE_APPEARANCE_TOKENS = [
  "lineage-cyan",
  "lineage-coral",
  "lineage-gold",
  "lineage-mint",
  "lineage-violet",
] as const;

export type LineageAppearanceToken =
  (typeof LINEAGE_APPEARANCE_TOKENS)[number];

export interface LineageAppearanceStyle {
  readonly token: LineageAppearanceToken;
  readonly color: number;
}

const STYLES: Readonly<
  Record<LineageAppearanceToken, LineageAppearanceStyle>
> = Object.freeze({
  "lineage-cyan": Object.freeze({
    token: "lineage-cyan",
    color: petraVisualColor("teal"),
  }),
  "lineage-coral": Object.freeze({
    token: "lineage-coral",
    color: petraVisualColor("coral"),
  }),
  "lineage-gold": Object.freeze({
    token: "lineage-gold",
    color: petraVisualColor("amber"),
  }),
  "lineage-mint": Object.freeze({
    token: "lineage-mint",
    color: petraVisualColor("mint"),
  }),
  "lineage-violet": Object.freeze({
    token: "lineage-violet",
    color: petraVisualColor("lavender"),
  }),
});

export function isLineageAppearanceToken(
  value: string,
): value is LineageAppearanceToken {
  return (LINEAGE_APPEARANCE_TOKENS as readonly string[]).includes(value);
}

/**
 * Stable presentation hue for a lineage appearance token.
 *
 * Hue reinforces identity only. It must not encode fitness, resistance,
 * abundance, ancestry rank, confidence, or any other scientific quantity.
 */
export function resolveLineageAppearance(
  token: string,
): LineageAppearanceStyle {
  if (!isLineageAppearanceToken(token)) {
    throw new RangeError(`unsupported lineage appearance token: ${token}`);
  }

  return STYLES[token];
}
