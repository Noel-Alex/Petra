# UI and motion DOX contract

## Purpose
Own Petra's accessible DOM/UI presentation language, motion policy, story transitions, and non-renderer interaction primitives.

## Authority boundary
- UI and motion explain authoritative simulation/render state; they do not mutate biology except through typed simulation commands.
- Never encode scientific meaning only in animation. Every causal event must remain understandable when motion is reduced or off.
- Keep the live dish renderer independent: renderer-specific Pixi/WebGL scene code belongs under `src/render/**`.
- Prefer framework-neutral state/policy modules underneath React/Motion adapters so animation semantics survive library changes.

## Motion language
- Motion is categorized as **causal**, **spatial**, **navigational**, or **decorative**.
- Causal feedback may be simplified but not silently removed under reduced motion.
- Large camera sweeps, parallax, idle bobbing, and decorative particles must collapse to low-motion alternatives.
- Wall-clock animation duration must never be presented as biological duration.
- Use named tokens rather than one-off millisecond values in components.
- Do not copy another studio's characters, compositions, palettes, or signature assets; Petra's geometry and timing language must remain original.

## Accessibility
- Support `full`, `reduced`, and `off` motion modes.
- OS `prefers-reduced-motion` is the default input; an explicit in-app setting may override it.
- Keyboard/touch operation and visible focus remain required.
- No rapid flashing or essential hover-only information.

## Verification
Pure motion-policy helpers must have deterministic unit tests. Browser animation quality, screenshot review, and measured frame-time/FPS require browser-capable verification and must not be inferred from source review alone.


## Counterfactual compare semantics
- Compare/fork presentation consumes authoritative fork metadata and command streams; it never performs simulation mutation itself.
- Two branches may be described as a causal counterfactual pair only when their exact fork origin matches (run identity/checkpoint fingerprint/tick/time/command count).
- UI must distinguish intervention divergence from stochastic seed divergence. If both differ, disclose both rather than attributing the difference to one cause.
- Side-by-side/swipe views synchronize biological simulation time, not animation wall time, and visibly handle a branch that has not simulated as far as the other.
- Trajectory differences default to shared authoritative sample times. Any later interpolation/smoothing is a chart-layer presentation choice and must be labelled.
- Export/share adapters should preserve fork origin, seed, ordered post-fork command identity, and provenance needed to replay the comparison.
