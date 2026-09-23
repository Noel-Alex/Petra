# Growth, Nutrients, Space and Temperature

## Resource-limited growth

A compact mechanistic core is the Monod response:

`mu(S) = mu_max * S / (K_s + S)`

where `S` is a local limiting substrate, `mu_max` is maximum specific growth rate and `K_s` is the half-saturation parameter.

Because PETRA explicitly simulates nutrient, pure logistic growth should not be the only biological rule. Saturation/stationarity can emerge from resource depletion and local space constraints.

Relevant work:

- Shao et al. (2017), DOI `10.1371/journal.pcbi.1005679`.
- A practical guide for optimal designs of experiments in the Monod model (2009), DOI `10.1016/j.envsoft.2009.02.006`.

## Spatial nutrient field

Dish discretization:

- circular mask over an `N x N` lattice;
- each tile holds nutrient concentration;
- each lineage has local density;
- nutrient diffuses and is consumed locally.

Minimal field equation:

`dS/dt = D_s * Laplacian(S) - sum_c uptake_c`

with uptake tied to growth/yield.

This allows colony interiors and fronts to behave differently because nutrient flux differs in space.

Relevant work:

- Ginovart et al. (2002), DOI `10.1016/S0378-4371(01)00581-7`.
- Modeling of spatiotemporal patterns in bacterial colonies (1999), DOI `10.1103/PHYSREVE.59.7036`.
- Shao et al. (2017).

## Competition

For the first competitor module, prefer **shared-resource competition** over arbitrary Lotka–Volterra “attack strengths.”

If two strains consume the same local nutrient, competition emerges from:

- `mu_max`;
- `K_s`;
- yield;
- temperature response;
- drug susceptibility;
- local spatial position.

Mechanistic consumer-resource models provide a cleaner biological interpretation than unexplained pairwise coefficients.

## Temperature

Temperature should not be a linear “growth boost” slider.

Ratkowsky et al. found a useful suboptimal relation:

`sqrt(mu) = b * (T - T_min)`

Source: Ratkowsky et al. (1982), DOI `10.1128/jb.149.1.1-5.1982`.

Extended/cardinal forms can represent the full minimum–optimum–maximum range; see DOI `10.1128/JB.154.3.1222-1226.1983`.

For the MVP, a single source-backed `f_T(T)` multiplier is enough. If no validated species-specific parameter set is loaded, hide the temperature control rather than invent constants.
