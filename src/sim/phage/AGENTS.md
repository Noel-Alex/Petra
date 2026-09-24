# Phage simulation evidence contract

## Purpose

This subtree currently owns pure phage evidence resolution only. Infection dynamics remain gated on explicit state units and later mechanism integration.

## Authority boundary

- `lifeHistory.ts` imports canonical measured evidence from `data/phage/**`; it must not duplicate published numeric rows.
- Exact source-row lookup is classified `measured`.
- In-domain interpolation is classified `derived` and must identify both measured bracket rows plus its transformation.
- Out-of-domain host growth must return an explicit OOD result. Do not extrapolate as if measured.
- Interpolation computes reported parameter means only. It must not invent an interpolated uncertainty distribution; measured bracket-row uncertainties remain available to callers.
- A life-history lookup does not cause adsorption, infection, lysis, mutation, or any other biological state change.

## Pending gates

- #139 owns the concentration/population unit bridge needed before applying the measured `mL min^-1` adsorption constant to authoritative state.
- #140 owns matrix-specific spatial T4 diffusion and free-phage loss.
- Total latent period may drive a reviewed delayed-infection representation, but a separate eclipse/assembly split remains experimental unless separately sourced.

## Replay and provenance

Changing source rows, interpolation policy, measured domain, or units is a science/data version change and must be reflected in scenario/data provenance before it can alter authoritative trajectories.

## Verification

Deterministic tests cover all measured rows, source uncertainty round-trip, derived interpolation, OOD refusal, units, host/phage identity, and source context. No browser/render test can substitute for these evidence checks.
