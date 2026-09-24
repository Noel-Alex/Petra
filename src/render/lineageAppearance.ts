import {
  LINEAGE_APPEARANCE_TOKENS,
  colorTokenForLineageAppearance,
  type LineageAppearanceToken,
} from '../design/lineageIdentity'
import { petraVisualColor } from '../design/visualTokens'

export {
  LINEAGE_APPEARANCE_TOKENS,
  type LineageAppearanceToken,
} from '../design/lineageIdentity'

export const LINEAGE_APPEARANCE_SCHEMA_VERSION = 1 as const

export interface LineageAppearanceStyle {
  readonly token: LineageAppearanceToken
  readonly color: number
}

export function isLineageAppearanceToken(
  value: string,
): value is LineageAppearanceToken {
  return (LINEAGE_APPEARANCE_TOKENS as readonly string[]).includes(value)
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
    throw new RangeError(`unsupported lineage appearance token: ${token}`)
  }

  return Object.freeze({
    token,
    color: petraVisualColor(colorTokenForLineageAppearance(token)),
  })
}
