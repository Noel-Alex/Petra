# Counterfactual compare DOX contract

## Purpose
Presentation-only contracts for comparing two authoritative Petra runs that share a fork ancestry.

## Authority boundary
- This subtree never creates, mutates, restores, or advances simulation state.
- Fork/snapshot identity and command streams come from authoritative simulation/product layers.
- Compare UI may synchronize view time/camera, but those are presentation coordinates only.
- Never infer a biological causal claim from visual divergence alone.

## UX contract
- Distinguish intervention divergence from seed/stochastic divergence explicitly.
- Side-by-side and swipe are equivalent views of the same compared runs.
- Critical distinctions must survive reduced/off motion and color-free presentation.
- Motion may explain a layout change, never hide branch identity or scientific labels.
- The dish remains the visual focus; compare chrome should stay compact.

## Extension points
React/Pixi adapters should consume `presentation.ts` rather than inventing local compare semantics.
If the shared Petra motion package is present, adapters may map its resolved mode onto the compatible `MotionMode` values here without importing UI framework code into this subtree.

## Verification
Pure deterministic tests cover divergence classification, linked-view semantics, and reduced/off transition behavior.
Browser screenshot, touch, GPU, or FPS acceptance must only be claimed when actually executed.
