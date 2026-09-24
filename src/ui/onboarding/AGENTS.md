# Onboarding DOX contract

## Purpose
Own the guided science-story choreography that introduces Petra without duplicating simulator or renderer authority.

## Rules
- Story progression may explain authoritative state; it must never fabricate biology to make a narrative beat land.
- Causal stages use explicit scientific gates supplied by simulator/command adapters.
- Skipping onboarding exits presentation only. It must not synthesize interventions, mutations, growth, lineage changes, or timeline records.
- Keep this layer framework-neutral. React/Motion/Pixi adapters consume the state machine; they do not redefine scientific gates.
- Motion comes from `src/ui/motion/**`. Reduced/off modes preserve text, focus and causal meaning.
- Narration must distinguish selection from mutation and wall-clock animation from biological time.
- Renderer-specific camera/scene effects remain under `src/render/**`.

## Verification
Deterministic tests must prove gated progression, skip/reset behavior, and reduced/off presentation semantics. Browser polish and screenshot/FPS acceptance require browser-capable verification.
