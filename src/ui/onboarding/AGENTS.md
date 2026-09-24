# Onboarding DOX contract

## Purpose
Own the guided science-story choreography that introduces Petra without duplicating simulator or renderer authority.

## Rules
- Story progression may explain authoritative state; it must never fabricate biology to make a narrative beat land.
- Causal stages use explicit scientific gates supplied by simulator/command adapters.
- Skipping onboarding exits presentation only. It must not synthesize interventions, mutations, growth, lineage changes, or timeline records.
- `story.ts` is the **single canonical onboarding semantic authority**. Do not create a second stage sequence/state machine under `motion/`, React, Pixi, or worker adapters.
- Keep this layer framework-neutral. React/Motion/Pixi adapters consume the state machine; they do not redefine scientific gates.
- Each canonical stage owns only presentation metadata (`motionKind` + named `motionToken`) from `src/ui/motion/**`; motion policy never controls progression. Reduced/off modes preserve text, focus and causal meaning.
- Worker/runtime adapters such as #42 may satisfy `ScientificGate` events only from authoritative commands/snapshots/events; they must not advance causal stages by timer.
- Narration must distinguish selection from mutation and wall-clock animation from biological time.
- Renderer-specific camera/scene effects remain under `src/render/**`.
- `OnboardingGuide.tsx` is a controlled presentation adapter over `OnboardingState`. It may emit only user-navigation actions (`continue`, `back`, `skip`); it must never manufacture `scientific-gate` events.
- Runtime integration owns run identity and authoritative gate delivery. A run/branch change must reset/replace controlled onboarding state outside the presentation component.
- React/CSS motion derives only from `resolveOnboardingPresentation`; do not add raw OS media-query motion authority or component-local stage timings.
- Guide navigation actions (`Skip`, `Back`, `Continue` / `Start experimenting`) consume the shared `PetraCompactAction` interaction adapter. Onboarding CSS may own layout, tone, and focus-ring color, but must not reimplement hover/press state or timing.\n- Guide navigation CSS must not undercut `PetraCompactAction`'s shared `2.75rem` minimum touch height. Onboarding may add padding or deliberate width for composition, but the shared repeated-action block target remains the accessibility floor.
- Decorative onboarding loops also resolve through shared `src/ui/motion/decorativeLoops.ts` authority and are projected as CSS variables. CSS may not reintroduce local loop cadence/easing or re-enable loops in Reduced/Off.

## Verification
Deterministic tests must prove gated progression, skip/reset behavior, and reduced/off presentation semantics. Browser polish and screenshot/FPS acceptance require browser-capable verification.
