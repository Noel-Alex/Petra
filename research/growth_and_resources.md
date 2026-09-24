# Growth, Nutrients, Space and Temperature

## Resource-limited growth

A compact mechanistic core is the Monod response:

`mu(S) = mu_max * S / (K_s + S)`

where `S` is a local limiting substrate, `mu_max` is maximum specific growth rate and `K_s` is the half-saturation parameter.

Because PETRA explicitly simulates nutrient, pure logistic growth should not be the only biological rule. Saturation/stationarity can emerge from resource depletion and local space constraints.

Relevant work:

- Shao et al. (2017), DOI `10.1371/journal.pcbi.1005679`.
- A practical guide for optimal designs of experiments in the Monod model (2009), DOI `10.1016/j.envsoft.2009.02.006`.


## Flagship growth-parameter compatibility gate (2026-09-24)

**Binding decision: keep the flagship Monod/resource parameters UNBOUND.** The
current `ecoli-ciprofloxacin-spatial` preset names MG1655 for the resistance
genotype table and a 37 °C reference temperature, but it does not yet identify
the limiting resource, medium formulation, resource concentration unit, or
initial resource condition that defines Petra's authoritative `S` field. A
numerical `mu_max`, `K_s`, or yield cannot be called measured for the
flagship until that environmental identity is chosen.

Primary/source-near candidates establish useful bounds and future calibration
options, but they are not one compatible parameter pack:

- **Nev et al. 2021**, DOI `10.1371/journal.pcbi.1008817`, directly studies
  *E. coli* K-12 MG1655 with glucose as the limiting resource across 0.05–0.4%
  (w/v) glucose. The cultures use DM medium plus 0.1% casamino acids and are
  grown at **30 °C**. The study fits nutrient-uptake half-saturation, maximal
  uptake, and yield parameters and shows that maximal uptake and yield depend
  on initial nutrient concentration. This is highly relevant mechanistically,
  but the temperature and medium do not match Petra's currently declared
  37 °C flagship context.
- **LaCroix et al. 2015**, DOI `10.1128/AEM.02246-14`, characterizes
  wild-type MG1655 in glucose minimal medium at 37 °C. Their reported
  wild-type phenotype includes a growth rate of about 0.69 h^-1 and biomass
  yield about 0.44 gDW/g glucose. These are useful 37 °C MG1655 transfer
  candidates, but they are measurements at a particular glucose-minimal
  condition rather than a complete Monod saturation curve and therefore do
  not supply a source-matched `K_s`.
- **Shao et al. 2017**, DOI `10.1371/journal.pcbi.1005679`, experimentally
  fits a Monod-style model for glucose-limited *E. coli* growth in liquid and
  3-D soft agar, with fitted `g_max = 0.73 h^-1`, `K = 122 µg/L`, and
  liquid yield `0.61 × 10^6 CFU/µg glucose` in that study's system. It
  strongly supports the spatial diffusion-limited mechanism Petra uses, but it
  is not a source-matched MG1655/flagship parameter set and its population/yield
  units do not directly equal Petra's continuous model-biomass unit.

### Required decision before numerical binding

A future flagship parameter-binding change must first version the resource
context itself: limiting substrate identity (for example glucose), medium,
temperature, concentration unit, initial/boundary condition, and the mapping
between Petra model biomass and the source's biomass/CFU unit. Only then may it
either:

1. choose one compatible measured parameter set; or
2. declare a transparent calibration/transfer that jointly fits
   `mu_max`, `K_s`, yield, and any biomass-unit conversion.

Do not assemble `mu_max` from a 37 °C source, `K_s` from a 30 °C source,
and yield from a third assay and label the result measured. Parameter
compatibility is part of scientific identity, not merely a UI citation.

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

## Aggregate flux and loss implementation boundary

Petra's current ecology kernel represents lineage state as continuous aggregate biomass/density channels. Resource-limited growth therefore produces a **continuous division-biomass flux**, not an integer cell-division event count. This distinction matters for evolution: an exact mutation sampler that accepts integer divisions cannot consume aggregate biomass gain by implicit rounding. A later event bridge must define the population unit and validate its stochastic approximation.

The ecology kernel may also accept a non-negative first-order death/loss hazard and integrate the constant-hazard survival fraction over a numerical step. That hazard is a **composition input**, not a biological claim by itself. In particular, ciprofloxacin-associated loss must be derived by the flagship pharmacodynamic/resource composition policy rather than assigning a universal death constant here.

Marcusson genotype relative-fitness values can enter Petra as a multiplier on local division demand, but doing so is a cross-study/mechanistic composition choice. Preserve the assay/background provenance and do not describe the multiplier as a directly measured spatial Monod growth curve.

## Temperature

Temperature should not be a linear “growth boost” slider.

Ratkowsky et al. found a useful suboptimal relation:

`sqrt(mu) = b * (T - T_min)`

Source: Ratkowsky et al. (1982), DOI `10.1128/jb.149.1.1-5.1982`.

Extended/cardinal forms can represent the full minimum–optimum–maximum range; see DOI `10.1128/JB.154.3.1222-1226.1983`.

For the MVP, a single source-backed `f_T(T)` multiplier is enough. If no validated species-specific parameter set is loaded, hide the temperature control rather than invent constants.
