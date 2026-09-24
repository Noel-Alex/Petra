import { describe, expect, it } from 'vitest'
import {
  LINEAGE_APPEARANCE_TOKENS,
  LINEAGE_PATTERN_TOKENS,
  LINEAGE_VISUAL_IDENTITY_SCHEMA_VERSION,
  resolveLineageVisualIdentity,
} from './lineageIdentity'

describe('shared lineage visual identity', () => {
  it('resolves the same scientific lineage id consistently across surfaces', () => {
    const first = resolveLineageVisualIdentity('L17')
    const second = resolveLineageVisualIdentity('L17')

    expect(first).toEqual(second)
    expect(first.schemaVersion).toBe(LINEAGE_VISUAL_IDENTITY_SCHEMA_VERSION)
    expect(LINEAGE_APPEARANCE_TOKENS).toContain(first.appearanceToken)
    expect(LINEAGE_PATTERN_TOKENS).toContain(first.patternToken)
    expect(first.label).toBe('L17')
  })

  it('keeps contrast preference independent from identity and motion', () => {
    const standard = resolveLineageVisualIdentity('lineage-founder', 'standard')
    const high = resolveLineageVisualIdentity('lineage-founder', 'high-contrast')

    expect(high.appearanceToken).toBe(standard.appearanceToken)
    expect(high.patternToken).toBe(standard.patternToken)
    expect(high.colorToken).toBe(standard.colorToken)
    expect(high.label).toBe(standard.label)
    expect(high.strokeWidthScale).toBeGreaterThan(standard.strokeWidthScale)
  })

  it('offers five independent non-color ring identities before color is considered', () => {
    expect(LINEAGE_PATTERN_TOKENS).toHaveLength(5)
    expect(new Set(LINEAGE_PATTERN_TOKENS).size).toBe(5)
  })

  it('rejects non-canonical lineage identity instead of silently normalizing it', () => {
    expect(() => resolveLineageVisualIdentity(' L1 ')).toThrow(/canonical/)
    expect(() => resolveLineageVisualIdentity('')).toThrow(/canonical/)
  })
})
