# Counterfactual compare UI DOX contract

## Purpose

Presentation-only side-by-side and swipe comparison of already-authoritative branch state.

## Authority

- `../counterfactual.ts` owns branch-origin/divergence semantics. Do not duplicate or reinterpret fork identity in React/CSS.
- Compare surfaces are supplied by callers. This subtree never forks, advances, rewinds, or mutates simulation state.
- Every scientific surface must carry an explicit `authoritative-sample` identity with branch ID, stable sample ID, and exact simulation time. The pane time label derives from that bound identity, not from an independent display number.
- A surface whose branch/time identity does not match the synchronized cursor is quarantined and visibly withheld. Never render latest/current scientific state under an older synchronized time label.
- Presentation interpolation is not implicit. If introduced later, it requires a separate explicit identity/disclosure contract and must never masquerade as an authoritative sample.
- Synchronization uses biological simulation time from authoritative data, never wall-clock animation time.
- A swipe reveal is only a visual comparison control; moving it must not change simulation state, camera authority, or branch time.

## Scientific language

- Use intervention-causal language only when the exact fork origin and seed match and the post-fork intervention streams diverge.
- If seeds differ, explicitly disclose stochastic divergence.
- If origins differ, show the views as a comparison but not a controlled counterfactual pair.
- Never infer outcome cause from visual differences alone.

## Motion and accessibility

- Consume `../motion/policy.ts` and named tokens; do not introduce local timing constants for semantic transitions.
- The resolved motion treatment supplied by React is the compare CSS authority. Raw `prefers-reduced-motion` media queries must not override an explicit in-app Full choice; OS preference is resolved before the component.
- Compare CSS motion variables must fail static (`0ms` with non-semantic easing) when adapter projection is absent; only the React-resolved Petra policy may opt the surface into active transition timing/easing.
- Reduced/off motion must preserve every divergence label and synchronized-time status.
- Compare layout toggles consume `PetraCompactAction` so hover/focus/press/selected treatment stays on the shared Petra micro-interaction authority; compare CSS may style group geometry/tone but must not invent a second timing/interaction state machine.
- Toggle motion remains presentation-only: selecting Side by side or Swipe may change layout state, never branch identity, synchronized biological time, scientific surface identity, or simulation state.
- Swipe must remain keyboard operable through an ordinary range control.
- The native swipe range owns at least a 2.75rem block-size touch target while retaining 100% inline width; do not replace it with custom pointer/drag math merely for styling.
- Critical distinction is never color-only: text labels and geometric marks remain present.

## Verification

Pure presentation helpers require deterministic unit tests. Browser smoothness, touch behavior, screenshots, GPU/frame-time, and renderer correctness require browser-capable local evidence and must not be inferred from source review.

## Export / replay metadata

- `export.ts` may package **metadata about already-authoritative branches**; it never creates a fork, checkpoint, intervention, or replay.
- Export metadata must preserve exact fork origin, branch identity, seed, ordered post-fork intervention command IDs, divergence classification, and caller-supplied engine/protocol/scenario/parameter versions.
- Current compare export is intentionally **metadata-only**: checkpoint payloads and authoritative command payloads are not present, so `replayReady` must remain false. Do not market or label it as a complete replay bundle until runtime authority supplies those payloads.
- Validation recomputes divergence identity from the exported branches so a stale/tampered label cannot disagree with branch metadata.
- Deterministic serialization must not inject wall-clock timestamps into the canonical payload; callers may attach transport metadata outside the replay identity.


## Shared visual-theme ownership

- `CounterfactualCompare.css` consumes Petra's shared visual CSS variables for stable chrome; it must not own an independent numeric hex/RGB/RGBA palette or restore blur-heavy glass treatment.
- Divergence colors are presentation reinforcement only and follow the shared vocabulary: intervention → coral, stochastic → teal, mixed → lavender, warning/clamped → amber, matched → mint. Text labels, geometric marks, branch identity, and synchronized biological time remain the semantic authority.
- Compare theme work must preserve Side-by-side/Swipe behavior, native range keyboard/touch operation, the 2.75rem swipe touch floor, mismatch quarantine, Full/Reduced/Off motion treatment, and export/replay metadata semantics.
- The swipe divider may use restrained shared-token depth but must not regain a neon/cyan glow that competes with the scientific surfaces.
