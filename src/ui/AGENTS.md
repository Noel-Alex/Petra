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

## Adapter extension points
- Persist the user's in-app motion choice as `system | full | reduced | off`; adapters resolve `system` against the current OS preference rather than copying that logic into components.
- Onboarding/story components consume **only** `src/ui/onboarding/story.ts` as deterministic, science-gated story state. Timers, scroll position, animation callbacks, and motion policy may present a transition, but they must not become the source of scientific story order or satisfy scientific gates.
- React/Motion and renderer adapters should translate resolved treatments/tokens into library-specific props; they should not invent competing easing/duration constants for the same semantic event.
- Authoritative scientific events map through `src/ui/motion/events.ts`: adapters may render its cues, but animation callbacks/timers must never synthesize simulator events.
- Causal event choreography preserves the user's current camera by default; attention-stealing camera motion requires a separate explicit navigation action.
- Event cue timing is presentation wall time only. Never label a motion-token duration as mutation, selection, depletion, infection, or drug-response duration.


## Event-burst choreography
- When multiple authoritative causal events arrive together, adapters use `src/ui/motion/scheduler.ts` instead of independently launching every animation.
- Input event order and sequence remain authoritative. The scheduler never sorts, merges, drops, delays, or synthesizes simulator events.
- The first bounded set of events receives animated/crossfade treatment; overflow events immediately retain their essential static cue while decorative motion is suppressed. This keeps event storms legible without erasing scientific meaning.
- Burst caps and stagger values are **visual engineering policy only**. They are not biological rates, mechanism durations, event probabilities, or simulator throttling.
- Motion-off always presents every event immediately with static essential emphasis. Reduced motion uses the same bounded scheduler without spatial/decorative movement.
- Camera ownership remains with the user. Event-storm handling must not trigger camera jumps or focus stealing.

## Counterfactual compare semantics
- Compare/fork presentation consumes authoritative fork metadata and command streams; it never performs simulation mutation itself.
- Two branches may be described as a causal counterfactual pair only when their exact fork origin matches (run identity/checkpoint fingerprint/tick/time/command count).
- UI must distinguish intervention divergence from stochastic seed divergence. If both differ, disclose both rather than attributing the difference to one cause.
- Side-by-side/swipe views synchronize biological simulation time, not animation wall time, and visibly handle a branch that has not simulated as far as the other.
- Trajectory differences default to shared authoritative sample times. Any later interpolation/smoothing is a chart-layer presentation choice and must be labelled.
- Export/share adapters should preserve fork origin, seed, ordered post-fork command identity, and provenance needed to replay the comparison.


## Child DOX index
- [`analysis/AGENTS.md`](analysis/AGENTS.md) — authoritative-sample chart projection, lineage ancestry layout, and accessible analysis presentation.
- [`onboarding/AGENTS.md`](onboarding/AGENTS.md) — canonical science-gated onboarding/story semantics and presentation metadata.
- [`compare/AGENTS.md`](compare/AGENTS.md) — accessible counterfactual side-by-side/swipe presentation over authoritative branch state.
- [`provenance/AGENTS.md`](provenance/AGENTS.md) — evidence-class presentation, strict source resolution, and incomplete-provenance rules.


## Provenance presentation
- Evidence badges present provenance supplied by science/data/runtime layers; UI code must not infer evidence class from color, source count, DOI presence, or confidence tier.
- Critical provenance identity is always redundant: text label + icon token + pattern token, never color alone.
- Transferred + mechanistic composition remains visibly multi-part; do not collapse cross-study seams into a generic “validated” badge.
- Missing required source, transfer, derivation, calibration, or limitation metadata is a visible `needs-provenance` state, not an excuse to invent a reassuring label.
- Engineering and visual-only values must explicitly disclose that they are not measured biological constants / do not control simulation outcomes.


## Semantic icon language
- Shared scientific/product icons come from `src/ui/icons/spec.ts`; React/Pixi adapters render the same framework-neutral geometry rather than inventing incompatible icon sets.
- Icon meaning is geometry + accessible label first. Color may reinforce meaning but may never be the only distinction.
- Provenance icon tokens map through `PROVENANCE_ICON_MAP`; do not create a second evidence-icon vocabulary in components.
- Icon geometry is visual-only and must never encode hidden simulator state, numeric magnitude, or biological confidence.
- Keep Petra iconography original; do not trace or reproduce another studio's recognizable symbols or branded asset language.


## Intervention preview semantics
- Spatial intervention previews live in `src/ui/interventionPreview.ts` and are presentation-only until an authoritative simulator command accepts them.
- Preview geometry uses normalized dish coordinates; adapters convert pointer/touch positions into that coordinate space without embedding renderer pixels in UI intent.
- Exact parameter label, value, unit, and any valid range come from scenario/runtime authority. The preview layer validates supplied bounds but must not invent biological defaults or silently clamp invalid values.
- A valid preview yields an `apply-intervention` **UI intent**, not a worker command. Until the authoritative protocol exposes the corresponding intervention command, adapters must not substitute `synthetic-pulse` or any other fixture command.
- The preview outline and numeric readout must survive reduced/off motion. Pointer movement itself is not announced through a live region; provide an explicit Apply control and stable text readout for keyboard/touch users.
- While a tool is active, its Escape-to-cancel handler gets first refusal before global playback Escape semantics. Enter may commit only when focus is not editing a value.


## Micro-interaction surfaces
- Reusable DOM action controls should consume `src/ui/motion/microInteractions.ts` rather than inventing hover/press/focus transform timings.
- `PetraAction.tsx` is a presentation-only adapter: it may render labels, Petra-owned icon geometry, focus, selection, hover and press feedback, but it cannot issue or imply scientific commands by itself.
- `PetraCompactAction.tsx` is the compact native-button adapter for topbar/dish/timeline actions; it consumes the same interaction state + motion policy rather than defining local hover/press timing.
- Full motion may use small decorative lift/compression. Reduced and off modes remove spatial movement while retaining focus/selection through border/background/static emphasis.
- Touch devices must not depend on hover state. Keyboard focus must remain visibly distinct, and disabled state must be static.
- Reusable action controls track persistent DOM focus independently from transient hover/press state. Press may temporarily take visual precedence, but pointer movement must not erase focus; the visible focus ring is owned by CSS `:focus-visible`.
- Micro-interaction duration and easing are presentation wall-time policy only and must come from named Petra motion tokens; React/CSS adapters project them rather than defining parallel curves.


## Causal event narration
- Screen-reader narration for authoritative causal events uses `src/ui/motion/announcements.ts`; do not write each event directly into an independent live region.
- One new event may use its event-specific explanation. Multi-event batches collapse to one bounded count summary while the scientific timeline remains complete and ordered.
- The caller stores the returned sequence + event-id cursor per run identity so React re-renders do not re-announce accepted events. A run/branch identity change must reset that cursor explicitly.
- Spoken narration is independent of full/reduced/off motion and of animation stagger/wall time.
- `CausalAnnouncementRegion.tsx` is a stable `role=status`, polite, atomic adapter. Keep it mounted; update its planned text rather than creating/removing many live regions.
