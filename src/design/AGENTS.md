# Shared design-token contract

## Purpose

`src/design/**` owns Petra's domain-neutral visual language that must be shared
by browser UI and live rendering without making either layer depend on the
other.

## Authority

- `visualTokens.ts` is the single color-value authority for the calm flat-vector
  Petra palette.
- Renderer code consumes numeric colors through `petraVisualColor()`.
- Browser startup projects the same values into CSS custom properties through
  `applyPetraVisualCssVariables()`; CSS must consume those variables instead of
  growing a second hard-coded Petra palette.
- Token names and values are presentation-only. They never imply resistance,
  fitness, abundance, confidence, or causality without a separate scientific
  contract and non-color cue.
- Stable lineage appearance IDs may map to these colors, but their scientific
  identity must never depend on the chosen hue.

## Art direction

Prefer matte ink/navy, cream, muted teal/mint, warm amber/coral/olive, and a
restrained lavender. Avoid electric cyan, hot pink, ultraviolet glow, glassmorph
noise, and decorative neon. Flat geometry, deliberate contrast, and quiet depth
should carry the interface.

## Dependency boundary

This directory must not import React, Pixi, simulation modules, or browser-only
DOM classes. Keep bridges target-shaped and framework-neutral so the same visual
authority remains reusable.
