# Shared design-token contract

## Purpose

`src/design/**` owns Petra's domain-neutral visual language that must be shared
by browser UI and live rendering without making either layer depend on the
other.

## Authority

- `visualTokens.ts` is the single color-value authority for the calm flat-vector
  Petra palette. Core normal-text foreground/background pairs are regression-tested
  against WCAG AA 4.5:1 contrast.
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

## Vector primitive vocabulary

- `vectorPrimitives.ts` centralizes normalized, renderer-neutral geometry for colony clusters, rounded rods, budding clusters, hyphal paths, field contours, selection rings, intervention markers, and small icons.
- Geometry is presentation-only. Organism silhouettes require an authoritative organism-kind contract before a renderer associates them with biology; lineage color/index/density is never enough.
- Primitive animation channels are deliberately limited to opacity, scale, transform, path length, and contour morphing so the geometry stays clean under Petra's shared motion system.

## Dependency boundary

This directory must not import React, Pixi, simulation modules, or browser-only
DOM classes. Keep bridges target-shaped and framework-neutral so the same visual
authority remains reusable.
