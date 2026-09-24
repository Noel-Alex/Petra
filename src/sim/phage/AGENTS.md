# Phage simulation evidence contract

## Purpose

This subtree owns pure phage evidence resolution, explicit spatial-unit/transport bridges, a framework-neutral delayed latent-infection queue, the versioned discrete burst-count policy, and the pure matured-cohort→lysis authority handoff. Full infection/lysis composition remains gated on authoritative host-state integration.

## Authority boundary

- `lifeHistory.ts` imports canonical measured evidence from `data/phage/**`; it must not duplicate published numeric rows.
- Exact source-row lookup is classified `measured`.
- In-domain interpolation is classified `derived` and must identify both measured bracket rows plus its transformation.
- Out-of-domain host growth must return an explicit OOD result. Do not extrapolate as if measured.
- Interpolation computes reported parameter means only. It must not invent an interpolated uncertainty distribution; measured bracket-row uncertainties remain available to callers.
- A life-history lookup does not cause adsorption, infection, lysis, mutation, or any other biological state change.
- `latentQueue.ts` schedules already-authoritative **integer infection cohorts** and persists the canonical in-domain phage life-history identity captured at infection time. The queue owns delayed maturity bookkeeping only: it does not infer that an adsorbed PFU successfully created an infected host, remove host biomass, or generate progeny PFU.
- Cohort maturity time is derived from infection time + the latent period inside that captured life-history identity rather than stored as a separate mutable parameter. Queue order is deterministic by maturity time then stable sequence identity, and biological queue time may never move backward. Latent-queue schema v2 therefore makes life-history identity replay/checkpoint-critical state.
- A matured cohort reports the number of infections whose total latent delay has elapsed. `burstPolicy.ts` is the only reviewed bridge from that authoritative integer infection count plus a caller-supplied life-history mean to discrete progeny PFU. It uses versioned deterministic fractional-residual carry and deliberately assumes **no** individual-burst stochastic distribution. Source mean/SD evidence stays owned by `lifeHistory.ts`; the burst policy must never relabel a numerical discretization as measured biology.
- `lysis.ts` is the reviewed pure authority handoff from `MaturedLatentInfections` to `burstPolicy.ts`. It rejects malformed count sums, duplicate/out-of-order cohort identity, cohorts whose lysis boundary is still in the future, out-of-domain life history, and any cohort whose full infection-time life-history identity differs from the supplied lysis resolution. Matching latent-period minutes alone is insufficient: two measured T4/MG1655 states can share a delay while carrying different burst authority. A batch that spans different life-history states must therefore be split by the caller rather than silently borrowing one burst mean.
- Burst output keeps `lysedInfections` separate from `releasedPfu`. Composition must remove/transition infected host state exactly once per authoritative lysis event; this pure module does not mutate host biomass or latent cohorts itself.
- Burst residual state is replay-critical numerical bookkeeping, must remain finite in `[0, 1)`, and must be checkpointed together with the exact burst-policy identity once integrated. Zero infections are a state-preserving no-op; zero mean burst is an explicit mechanism control that releases zero PFU.
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
- Total latent period may drive a reviewed delayed-infection representation, but a separate eclipse/assembly split remains experimental unless separately sourced.
- The delayed queue is the reviewed total-latent-period representation, `lysis.ts` binds matured cohorts to one matching in-domain life-history state, and `burstPolicy.ts` supplies the reviewed discrete progeny-count law. A future authoritative composition must still define adsorption-to-infected-host multiplicity and atomically commit queue advancement, infected-host decrement, burst residual state, and released PFU before lysis can change product-facing biological state.

## Replay and provenance

Changing source rows, interpolation policy, measured domain, or units is a science/data version change and must be reflected in scenario/data provenance before it can alter authoritative trajectories. Latent-queue schema/state is checkpoint/replay-critical once integrated into the authoritative engine: restoring or reordering pending cohorts must reproduce the same maturation sequence **and the same infection-time life-history identity for every cohort**. Burst-policy identity plus `residualExpectedPfu` are likewise replay/checkpoint-critical: changing the discretization policy or restoring a mismatched/corrupt residual must fail rather than silently continue.

## Verification

Deterministic tests cover all measured rows, source uncertainty round-trip, derived interpolation, OOD refusal, units, host/phage identity, and source context. No browser/render test can substitute for these evidence checks. Latent-queue tests additionally cover deterministic maturity order, exact delay boundaries, zero-delay controls, monotonic biological time, integer infection counts, and corrupt-state rejection. Burst-policy tests cover integer output, fractional residual carry across batches, exact zero-infection/zero-burst controls, stable replay identity, corrupt-state refusal, and safe-integer overflow refusal without inventing a stochastic burst distribution. Lysis-handoff tests additionally cover no release before maturity, measured/derived provenance preservation, cohort-count/order validation, out-of-domain refusal, exact infection-time life-history identity binding (including equal-latency/different-burst source rows), and state-preserving zero-maturity behavior.
