# Phage simulation evidence contract

## Purpose

This subtree owns pure phage evidence resolution, explicit spatial-unit/transport bridges, and a framework-neutral delayed latent-infection queue. Full infection/lysis composition remains gated on authoritative host-state integration and an explicitly justified burst-count contract.

## Authority boundary

- `lifeHistory.ts` imports canonical measured evidence from `data/phage/**`; it must not duplicate published numeric rows.
- Exact source-row lookup is classified `measured`.
- In-domain interpolation is classified `derived` and must identify both measured bracket rows plus its transformation.
- Out-of-domain host growth must return an explicit OOD result. Do not extrapolate as if measured.
- Interpolation computes reported parameter means only. It must not invent an interpolated uncertainty distribution; measured bracket-row uncertainties remain available to callers.
- A life-history lookup does not cause adsorption, infection, lysis, mutation, or any other biological state change.
- `latentQueue.ts` schedules already-authoritative **integer infection cohorts** using a caller-supplied total latent period. It owns delayed maturity bookkeeping only: it does not infer that an adsorbed PFU successfully created an infected host, remove host biomass, or generate progeny PFU.
- Cohort maturity time is derived from infection time + total latent period rather than stored redundantly. Queue order is deterministic by maturity time then stable sequence identity, and biological queue time may never move backward.
- A matured cohort reports the number of infections whose total latent delay has elapsed. Treat that result as a mechanism handoff, not as a phage burst. Measured mean burst size must not be rounded/multiplied into discrete PFU without a separately declared stochastic/count policy.
- `transport.ts` imports canonical Hu transport evidence and resolves only Petra's exact selected 0.5% host-free agarose context. The selected coefficient is **transferred** from a measured agarose-membrane experiment; all other materials, agarose concentrations, or embedded-host conditions return OOD rather than extrapolating.
- The measured dead-K-12 agarose transport anchor is adsorption-confounded and must never be substituted for living-host diffusion. Free-phage loss remains unbound.

## Pending gates

- `unitBridge.ts` owns #139's versioned scenario/provenance-controlled spatial unit mapping. It converts continuous model biomass to continuous host cell-equivalents, derives cell-equivalents/mL and PFU/mL from an explicit interaction volume, and uses the same physical grid pitch as #140 transport. There are no physical defaults.
- Free extracellular phage low-count authority is discrete PFU. Exact adsorption sampling consumes Petra's RNG and is replay-sensitive; it removes/binds free PFU only and does not create infected-host state.
- Renderer density, glyph counts, CSS pixels, canvas geometry, and normalized presentation coordinates are forbidden as sources of cells/mL, PFU/mL, interaction volume, or physical grid pitch.
- The canonical phage spatial-unit bridge identity is replay-critical configuration and must join the authoritative scenario/configuration fingerprint before enabled phage dynamics can enter checkpoints.
- #140 binds a narrow host-free 0.5% agarose extracellular transport baseline; live host-bearing transport and general free-phage loss remain outside that calibration.
- Total latent period may drive a reviewed delayed-infection representation, but a separate eclipse/assembly split remains experimental unless separately sourced.
- The delayed queue is now the reviewed total-latent-period representation. A future authoritative composition must still define adsorption-to-infected-host multiplicity/host bookkeeping and a burst PFU count law before lysis can change biological state.

## Replay and provenance

Changing source rows, interpolation policy, measured domain, or units is a science/data version change and must be reflected in scenario/data provenance before it can alter authoritative trajectories. Latent-queue schema/state becomes checkpoint/replay-critical once integrated into the authoritative engine; restoring or reordering pending cohorts must reproduce the same maturation sequence.

## Verification

Deterministic tests cover all measured rows, source uncertainty round-trip, derived interpolation, OOD refusal, units, host/phage identity, and source context. No browser/render test can substitute for these evidence checks. Latent-queue tests additionally cover deterministic maturity order, exact delay boundaries, zero-delay controls, monotonic biological time, integer infection counts, and corrupt-state rejection.
