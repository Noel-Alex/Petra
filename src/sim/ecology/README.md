# Ecology kernel

This directory turns resource availability into deterministic **continuous biomass fluxes** for local growth/division, death/loss, and coarse colony-front spread.

## Current slice

`growth.ts` provides:
- Monod response `S / (K_s + S)`;
- genotype/lineage relative-fitness scaling of division demand;
- simultaneous proportional allocation of shared resource across lineages;
- biomass yield accounting;
- local-capacity limiting;
- explicit per-lineage/per-cell division-biomass and death-biomass ledgers;
- bounded first-order death hazards, uniform or spatial;
- conservative four-neighbour effective colony spread;
- aggregate flux/resource/biomass metrics.

All numeric parameters are passed by the scenario/composition layer. This module intentionally contains **no E. coli constant** and no ciprofloxacin-specific value.

## Authority boundaries

`maxDivisionRate`, `halfSaturation`, `biomassYield`, and lineage `relativeFitness` require biological provenance in a Science-Mode preset. `localCapacity` and `spreadRate` may be calibrated/engineering parameters but must be labeled as such. The spread operator is an effective colony-front approximation, **not bacterial motility or single-cell mechanics**.

`deathHazardPerTime` is an input contract, not a hidden stress model. The caller must identify the mechanism and provenance that produced it. For the ciprofloxacin flagship, Issue #4 owns the resource×drug composition that will derive spatial loss pressure from the documented Regoes/MIC policy.

Division demand and death are computed from the same pre-step biomass. Death uses the exact constant-hazard survival fraction `1 - exp(-h * dt)`, which prevents a finite non-negative first-order hazard from deleting more than the available pre-step biomass. Same-step death does not create extra growth capacity until the next step; that operator-order policy is deterministic and should be versioned if changed.

`localCapacity` is also a scientific state-domain invariant, not only a growth/spread limiter. `capacity.ts` owns the single numerical allowance for binary32 storage: one Float32 relative spacing at the configured capacity (with the minimum-subnormal envelope near zero). The raw ecology preflight, composed initial/continued-state validation, and composed checkpoint restore all consume that same helper. Materially over-capacity state is rejected before mutation; Petra never clips or silently renormalizes biomass to make it fit. This tolerance is engineering representation policy, **not biological headroom**.

## Mutation boundary

The division ledger is **continuous biomass production**, not an integer count of cell-division events. It must not be passed directly to `sampleDivisionMutations`, whose input is an integer event count.

Issue #5 therefore still needs a reviewed bridge from Petra's aggregate population units to discrete/accelerated mutation opportunities (for example, an explicitly defined cell-equivalent scale or a statistically validated aggregate event sampler). This boundary is deliberate: Petra must not manufacture integer births by rounding an unlabeled biomass quantity.

## Issue #3 completion boundary

Issue #3's ecology mechanism and integration gates are now complete. The authoritative composed simulation owns and checkpoints the resource/lineage state consumed by this kernel, and the bundled flagship resolves its runnable growth inputs through a versioned **engineering** execution profile with model-resource/model-biomass units, explicit behavioral targets, and visible limitations.

This does **not** turn the flagship into a physically calibrated MG1655 Monod system. Its physical limiting-resource identity/concentration/biomass mapping remains explicitly UNBOUND, and the shared Science Mode admission gate therefore keeps that research scenario experimental. A future source-compatible physical parameter pack is a new scenario/data calibration task, not unfinished Issue #3 kernel work.

The continuous-division-flux → discrete mutation-opportunity boundary is likewise owned separately by the shared population/evolution authority (#562/#5); it must not be reopened as ecology rounding logic.

## Verification

`growth.test.ts`, capacity-focused ecology tests, and composed-state/engine tests cover the Monod half-saturation identity, zero-resource behavior, yield/capacity limiting, materially over-capacity refusal, Float32 boundary round-trips, atomic composed checkpoint rejection, lineage-order independence, high-resource early exponential behavior, nutrient-depletion slowdown, relative-fitness scaling, bounded death bookkeeping, spatial death fields, and spread mass conservation. Run the repository-level `python tools/verify.py premerge` gate for executable evidence.
