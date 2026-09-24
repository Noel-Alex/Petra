# UI and motion DOX contract

## Purpose
Own Petra's accessible DOM/UI presentation language, motion policy, story transitions, experiment-control state, scientific timeline projection, and non-renderer interaction primitives.

## Authority boundary
- UI and motion explain authoritative simulation/render state; they do not mutate biology except through typed simulation commands.
- Never encode scientific meaning only in animation. Every causal event must remain understandable when motion is reduced or off.
- Keep the live dish renderer independent: renderer-specific Pixi/WebGL scene code belongs under `src/render/**`.
- Prefer framework-neutral state/policy modules underneath React/Motion adapters so animation semantics survive library changes.
- Playback pause/speed are scheduler state; speed changes how many authoritative ticks are requested, not the meaning of a tick.
- Replay must reinitialize the same run identity and apply accepted commands in original order. Do not invent or interpolate authority events.

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
- Global shortcuts must not hijack editable controls.
- No rapid flashing or essential hover-only information.

## Scientific timeline
- Preserve event sequence, tick, simulation time, and command identity.
- Timeline labels may explain events but cannot alter their scientific meaning.
- User interventions should appear only after/with authoritative event confirmation in the eventual runtime adapter.

## Verification
Pure motion-policy, control-planning, replay-order, keyboard, and timeline helpers require deterministic unit tests. Browser animation quality, screenshot review, and measured frame-time/FPS require browser-capable verification and must not be inferred from source review alone.
