# Phage simulation evidence contract

## Purpose

This subtree owns pure phage evidence resolution, explicit spatial-unit/transport bridges, a framework-neutral delayed latent-infection queue, and the versioned discrete burst-count policy. Full infection/lysis composition remains gated on authoritative host-state integration.

## Authority boundary

- `lifeHistory.ts` imports canonical measured evidence from `data/phage/**`; it must not duplicate published numeric rows.
- Exact source-row lookup is classified `measured`.
- In-domain interpolation is classified `derived` and must identify both measured bracket rows plus its transformation.
- Out-of-domain host growth must return an explicit OOD result. Do not extrapolate as if measured.
- Interpolation computes reported parameter means only. It must not invent an interpolated uncertainty distribution; measured bracket-row uncertainties remain available to callers.
- A life-history lookup does not cause adsorption, infection, lysis, mutation, or any other biological state change.
- `latentQueue.ts` schedules already-authoritative **integer infection cohorts** using a caller-supplied total latent period. It owns delayed maturity bookkeeping only: it does not infer that an adsorbed PFU successfully created an infected host, remove host biomass, or generate progeny PFU.
- Cohort maturity time is derived from infection time + total latent period rather than stored redundantly. Queue order is deterministic by maturity time then stable sequence identity, and biological queue time may never move backward.
- A matured cohort reports the number of infections whose total latent delay has elapsed. `burstPolicy.ts` is the only reviewed bridge from that authoritative integer infection count plus the reviewed life-history burst mean to discrete progeny PFU. It uses versioned deterministic fractional-residual carry and deliberately assumes **no** individual-burst stochastic distribution. Source mean/SD evidence stays owned by `lifeHistory.ts`; the burst policy must never relabel a numerical discretization as measured biology.
- Product/runtime composition should use `applyMaturedPhageBurst(...)`. It accepts a `MaturedLatentInfections` handoff plus an in-domain `PhageLifeHistoryResolution`, verifies aggregate/cohort count identity, unique deterministic cohort order, and that every cohort has actually reached its lysis boundary, then delegates to the numerical residual-carry primitive. OOD life history fails closed.
- `applyDeterministicPhageBurst(...)` remains the low-level numerical primitive for focused mechanism tests. It accepts an explicit mean by design and must not become the product/scenario authority for choosing a biological burst mean.
- Authority-bound burst results retain `sourceEvidenceClass` and `sourceResolution` so measured rows and derived interpolation remain distinguishable downstream.
- Burst output keeps `lysedInfections` separate from `releasedPfu`. Composition must remove/transition infected host state exactly once per authoritative lysis event; this pure module does not mutate host biomass or latent cohorts itself.
- Burst residual state is replay-critical numerical bookkeeping, must remain finite in `[0, 1)`, and must be checkpointed together with the exact burst-policy identity once integrated. Zero infections are a state-preserving no-op; zero mean burst is currently a mechanism control that releases zero PFU and must not be presented as a measured T4 condition.
- `transport.ts` imports canonical Hu transport evidence and resolves only Petra's exact selected 0.5% host-free agarose context. The selected coefficient is **transferred** from a measured agarose-membrane experiment; all other materials, agarose concentrations, or embedded-host conditions return OOD rather than extrapolating.
- The measured dead-K-12 agarose transport anchor is adsorption-confounded and must never be substituted for living-host diffusion. Free-phage loss remains unbound.

## Pending gates

- `unitBridge.ts` owns #139's versioned scenario/provenance-controlled spatial unit mapping. It converts continuous model biomass to continuous host cell-equivalents, derives cell-equivalents/mL and PFU/mL from an explicit interaction volume, and uses the same physical grid pitch as #140 transport. There are no physical defaults.
- Free extracellular phage low-count authority is discrete PFU. `sampleExactAdsorbedPfu(...)` remains the trial-by-trial reference sampler; runtime composition uses `sampleAdsorbedPfuWithPolicy(...)` so arbitrary large safe-integer PFU counts cannot trigger an unbounded Bernoulli loop.
- Large-count adsorption uses the shared `exact-sparse-binomial-v1` algorithm only when the caller-owned numerical policy admits it. This remains an exact Binomial(free PFU, adsorption probability) draw; no rate/probability approximation or post-hoc clamping is allowed.
- Sampling-policy expected/hard-budget refusal is a numerical runtime result, is transactional over Petra RNG state, and must never be presented as biological adsorption failure. Policy identity is replay-critical and must join authoritative configuration fingerprinting before enabled phage dynamics enter checkpoints. See `../SAMPLING.md`.
- Renderer density, glyph counts, CSS pixels, canvas geometry, and normalized presentation coordinates are forbidden as sources of cells/mL, PFU/mL, interaction volume, or physical grid pitch.
- The canonical phage spatial-unit bridge identity is replay-critical configuration and must join the authoritative scenario/configuration fingerprint before enabled phage dynamics can enter checkpoints.
- #140 binds a narrow host-free 0.5% agarose extracellular transport baseline; live host-bearing transport and general free-phage loss remain outside that calibration.
- Total latent period may drive the reviewed delayed-infection representation, but a separate eclipse/assembly split remains experimental unless separately sourced.
- The delayed queue is the reviewed total-latent-period representation and `burstPolicy.ts` supplies the reviewed discrete progeny-count law plus the authority-bound mature-cohort/life-history handoff. A future authoritative composition must still define adsorption-to-infected-host multiplicity and atomic host/infected-state bookkeeping before lysis can change biological state.
- The mechanism-test zero-burst path is currently represented by a zero mean passed to the low-level numerical primitive. Before product-facing intervention controls expose it, give that control its own explicit engineering policy identity so replay provenance cannot confuse a control with source life-history evidence.

## Replay and provenance

Changing source rows, interpolation policy, measured domain, or units is a science/data version change and must be reflected in scenario/data provenance before it can alter authoritative trajectories. Latent-queue schema/state becomes checkpoint/replay-critical once integrated into the authoritative engine; restoring or reordering pending cohorts must reproduce the same maturation sequence. Burst-policy identity plus `residualExpectedPfu` are likewise replay/checkpoint-critical: changing the discretization policy or restoring a mismatched/corrupt residual must fail rather than silently continue. Authority-bound burst results retain the exact life-history evidence class/resolution that supplied the mean; composed configuration must ultimately fingerprint the source/scenario identity rather than trusting a presentation-layer number.

## Verification

Deterministic tests cover all measured rows, source uncertainty round-trip, derived interpolation, OOD refusal, units, host/phage identity, and source context. No browser/render test can substitute for these evidence checks. Latent-queue tests additionally cover deterministic maturity order, exact delay boundaries, zero-delay controls, monotonic biological time, integer infection counts, and corrupt-state rejection. Burst-policy tests cover integer output, fractional residual carry across batches, exact zero-infection/zero-burst controls, stable replay identity, corrupt-state refusal, and safe-integer overflow refusal without inventing a stochastic burst distribution. Authority-handoff tests additionally cover measured/derived provenance retention, no release before latent maturity, OOD refusal, aggregate/cohort count mismatch, duplicate sequence refusal, and deterministic matured-cohort ordering.
