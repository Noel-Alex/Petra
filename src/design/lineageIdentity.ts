import type { PetraVisualColorToken } from './visualTokens'

export const LINEAGE_VISUAL_IDENTITY_SCHEMA_VERSION = 1 as const

export const LINEAGE_APPEARANCE_TOKENS = [
  'lineage-cyan',
  'lineage-coral',
  'lineage-gold',
  'lineage-mint',
  'lineage-violet',
] as const

export type LineageAppearanceToken =
  (typeof LINEAGE_APPEARANCE_TOKENS)[number]

export const LINEAGE_PATTERN_TOKENS = [
  'solid-ring',
  'double-ring',
  'inner-ring',
  'wide-halo',
  'triple-ring',
] as const

export type LineagePatternToken = (typeof LINEAGE_PATTERN_TOKENS)[number]

export type LineageContrastMode = 'standard' | 'high-contrast'

export interface LineageVisualIdentity {
  readonly schemaVersion: typeof LINEAGE_VISUAL_IDENTITY_SCHEMA_VERSION
  readonly lineageId: string
  readonly appearanceToken: LineageAppearanceToken
  readonly colorToken: PetraVisualColorToken
  readonly patternToken: LineagePatternToken
  /**
   * Non-color label cue derived directly from the scientific lineage ID.
   * Surfaces should show this lineage ID (or an equally explicit label) in
   * legends/tooltips/tree nodes instead of treating color as identity.
   */
  readonly label: string
  readonly contrastMode: LineageContrastMode
  readonly strokeWidthScale: number
}

const APPEARANCE_COLORS = Object.freeze({
  'lineage-cyan': 'teal',
  'lineage-coral': 'coral',
  'lineage-gold': 'amber',
  'lineage-mint': 'mint',
  'lineage-violet': 'lavender',
} as const satisfies Readonly<
  Record<LineageAppearanceToken, PetraVisualColorToken>
>)

function canonicalLineageId(value: string): string {
  if (value.length === 0 || value !== value.trim()) {
    throw new Error('lineage visual identity requires a canonical non-empty lineage id')
  }
  return value
}

/** FNV-1a: stable presentation hashing only, never scientific authority. */
function hashIdentity(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

export function colorTokenForLineageAppearance(
  token: LineageAppearanceToken,
): PetraVisualColorToken {
  return APPEARANCE_COLORS[token]
}

/**
 * Resolve a lineage's cross-surface presentation identity from its exact ID.
 *
 * The same ID gets the same color+pattern pair whether it appears in the dish,
 * tree, chart, compare view, or timeline. High contrast deliberately changes
 * stroke emphasis only; it does not remap identity or couple to motion mode.
 *
 * Color and pattern are presentation-only. Scientific properties such as
 * resistance, fitness, abundance, confidence, or ancestry never enter this
 * function.
 */
export function resolveLineageVisualIdentity(
  lineageId: string,
  contrastMode: LineageContrastMode = 'standard',
): LineageVisualIdentity {
  const id = canonicalLineageId(lineageId)
  if (contrastMode !== 'standard' && contrastMode !== 'high-contrast') {
    throw new Error('unsupported lineage contrast mode')
  }

  const hash = hashIdentity(id)
  const appearanceToken =
    LINEAGE_APPEARANCE_TOKENS[hash % LINEAGE_APPEARANCE_TOKENS.length]!
  const patternToken =
    LINEAGE_PATTERN_TOKENS[
      Math.floor(hash / LINEAGE_APPEARANCE_TOKENS.length) %
        LINEAGE_PATTERN_TOKENS.length
    ]!

  return Object.freeze({
    schemaVersion: LINEAGE_VISUAL_IDENTITY_SCHEMA_VERSION,
    lineageId: id,
    appearanceToken,
    colorToken: colorTokenForLineageAppearance(appearanceToken),
    patternToken,
    label: id,
    contrastMode,
    strokeWidthScale: contrastMode === 'high-contrast' ? 1.6 : 1,
  })
}
