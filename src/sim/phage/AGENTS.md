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
- `transport.ts` imports canonical Hu transport evidence and resolves only Petra's exact selected 0.5% host-free agarose context. The selected coefficient is **transferred** from a measured agarose-membrane experiment; all other materials, agarose concentrations, or embedded-host conditions return OOD rather than extrapolating.
- The measured dead-K-12 agarose transport anchor is adsorption-confounded and must never be substituted for living-host diffusion. Free-phage loss remains unbound.

## Pending gates

- `unitBridge.ts` owns #139's versioned scenario/provenance-controlled spatial unit mapping. It converts continuous model biomass to continuous host cell-equivalents, derives cell-equivalents/mL and PFU/mL from an explicit interaction volume, and uses the same physical grid pitch as #140 transport. There are no physical defaults.
- Free extracellular phage authority is discrete PFU. `sampleExactAdsorbedPfu(..., policy)` remains the deterministic trial-by-trial reference sampler but may run only inside the caller-owned Bernoulli exact budget. `sampleAdsorbedPfuWithPolicy` may use the versioned bounded hybrid binomial accelerator for larger counts; both paths remove/bind free PFU only and do not create infected-host state.
- Renderer density, glyph counts, CSS pixels, canvas geometry, and normalized presentation coordinates are forbidden as sources of cells/mL, PFU/mL, interaction volume, or physical grid pitch.
- The canonical phage spatial-unit bridge identity is replay-critical configuration and must join the authoritative scenario/configuration fingerprint before enabled phage dynamics can enter checkpoints.
- #140 binds a narrow host-free 0.5% agarose extracellular transport baseline; live host-bearing transport and general free-phage loss remain outside that calibration.
- Total latent period may drive a reviewed delayed-infection representation, but a separate eclipse/assembly split remains experimental unless separately sourced.

## Replay and provenance

Changing source rows, interpolation policy, measured domain, or units is a science/data version change and must be reflected in scenario/data provenance before it can alter authoritative trajectories.

Adsorption sampling execution policy is numerical/replay configuration, not biology. Exact and accelerated paths consume different RNG sequences; the sampling policy identity (schema/id, exact budgets, accelerator version) must join the authoritative configuration/checkpoint fingerprint before enabled phage adsorption enters #37 composition. Exceeding an exact budget with acceleration disabled must fail as a `SamplingPolicyRefusal`, distinct from scientific OOD or missing unit/evidence gates.

## Verification

Deterministic tests cover all measured rows, source uncertainty round-trip, derived interpolation, OOD refusal, units, host/phage identity, source context, exact-budget refusal, accelerated PFU bounds, 0/1 limits, and many-seed distribution agreement with the exact reference. No browser/render test can substitute for these evidence checks.
