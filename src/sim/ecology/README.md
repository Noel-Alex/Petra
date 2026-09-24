# Ecology kernel

This directory turns resource availability into deterministic **potential division biomass** before later stochastic mutation/death channels are composed.

## Current slice

`growth.ts` provides:
- Monod response `S / (K_s + S)`;
- simultaneous proportional allocation of shared resource across lineages;
- biomass yield accounting;
- local-capacity limiting;
- conservative four-neighbour effective colony spread;
- aggregate division/resource/biomass metrics.

All numeric parameters are passed by the scenario layer. This module intentionally contains **no E. coli constant** and no physical grid calibration.

## Authority boundaries

`maxDivisionRate`, `halfSaturation`, and `biomassYield` require biological provenance in a Science-Mode preset. `localCapacity` and `spreadRate` may be calibrated/engineering parameters but must be labeled as such. The spread operator is an effective colony-front approximation, **not bacterial motility or single-cell mechanics**.

Growth demand is computed for every lineage from the same pre-step local state. If resource or capacity is limiting, all potential divisions are scaled proportionally. This prevents lineage array order from deciding which lineage gets first access to resource.

## Still required for Issue #3

This bounded slice deliberately does not yet add a biological death channel: basal/stress death needs an explicit scenario composition rule, and antibiotic killing belongs with the pharmacodynamic work in Issue #4. Before Issue #3 closes, integrate separate division/death bookkeeping with the authoritative engine state and choose/provenance the flagship growth/resource parameters. Mutation in Issue #5 must consume the **division** count, not net population change.

## Verification

`growth.test.ts` covers the half-saturation identity, zero-resource no-growth, resource/yield limiting, capacity limiting, lineage-order independence, and spread mass conservation. These tests require executable TypeScript/Vitest verification before merge; source presence is not runtime evidence.
