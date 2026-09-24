# Counterfactual compare UI DOX contract

## Purpose

Presentation-only side-by-side and swipe comparison of already-authoritative branch state.

## Authority

- `../counterfactual.ts` owns branch-origin/divergence semantics. Do not duplicate or reinterpret fork identity in React/CSS.
- Compare surfaces are supplied by callers. This subtree never forks, advances, rewinds, or mutates simulation state.
- Synchronization uses biological simulation time from authoritative data, never wall-clock animation time.
- A swipe reveal is only a visual comparison control; moving it must not change simulation state, camera authority, or branch time.

## Scientific language

- Use intervention-causal language only when the exact fork origin and seed match and the post-fork intervention streams diverge.
- If seeds differ, explicitly disclose stochastic divergence.
- If origins differ, show the views as a comparison but not a controlled counterfactual pair.
- Never infer outcome cause from visual differences alone.

## Motion and accessibility

- Consume `../motion/policy.ts` and named tokens; do not introduce local timing constants for semantic transitions.
- Reduced/off motion must preserve every divergence label and synchronized-time status.
- Swipe must remain keyboard operable through an ordinary range control.
- Critical distinction is never color-only: text labels and geometric marks remain present.

## Verification

Pure presentation helpers require deterministic unit tests. Browser smoothness, touch behavior, screenshots, GPU/frame-time, and renderer correctness require browser-capable local evidence and must not be inferred from source review.
