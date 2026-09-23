# Stochastic Simulation Strategy

## Why not one JavaScript object per bacterium?

A visible colony can correspond to enormous cell counts. Per-cell simulation would be computationally wasteful and would falsely encourage the user to interpret every visual sprite as one physical cell.

PETRA therefore represents **lineage-density cohorts on a spatial lattice** and samples event counts.

## Gillespie foundation

Gillespie's stochastic simulation algorithm (SSA) samples exact event timing for continuous-time Markov reaction systems.

Source:

- Gillespie D.T. (1977), *Journal of Physical Chemistry*, DOI `10.1021/j100540a008`.

Exact SSA is ideal when event counts are small. It becomes too expensive when births/deaths occur at huge rates.

## PETRA hybrid

Use a tau-leap/cohort strategy:

1. calculate expected births, deaths, mutations, dispersal and optional infections over `dt`;
2. for low counts, sample discrete binomial/Poisson events;
3. for high counts, use a bounded tau-leap or deterministic expectation with controlled stochastic sampling;
4. never allow a destructive sampled event to exceed the available population;
5. reduce `dt` or subdivide when propensities change too strongly.

Diffusion of environmental fields is handled separately with a deterministic PDE step.

## Event channels

Per lineage and tile:

- division;
- baseline death;
- drug-mediated change in net growth/death;
- mutation on division;
- effective local dispersal;
- optional phage adsorption/infection;
- optional infected-stage progression and lysis.

## Required numerical invariants

- no negative concentrations;
- no negative populations;
- same seed + actions + engine version -> same result;
- mutation count <= births;
- passive diffusion conserves total field mass under no-flux boundary within tolerance;
- all approximations have explicit regime/threshold tests.

## Rendering separation

The renderer samples glyphs/texture from density fields. It must never feed random visual particle positions back into the biology unless a future agent-based mode explicitly says so.
