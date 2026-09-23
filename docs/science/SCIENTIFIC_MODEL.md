# Petra scientific model — authoritative contract

## 1. Scope

Petra models **population-level microbial ecology and evolution on a spatial substrate**. It intentionally does not model atoms, full genomes, transcription networks, host immunity, human pharmacokinetics, or every physical bacterium.

The scientific state is a 2-D dish divided into spatial demes. Continuous environmental fields coexist with discrete/aggregate lineage populations. Rare evolutionary events remain stochastic.

### State per spatial cell `x`
- `S(x,t)` — limiting resource concentration.
- `A_d(x,t)` — concentration of antimicrobial `d`.
- optional `P_v(x,t)` — free phage density.
- local biomass/counts `B_g(x,t)` for genotype/lineage `g`.
- optional reversible phenotype compartments such as normal/persister.

### Global run identity
`scenario_id + scenario_version + engine_version + RNG_seed` must be sufficient to reproduce a run within the same numerical backend.

## 2. Resource-limited growth

The baseline local specific growth rate uses a Monod-style resource response:

```
f_S(S) = S / (K_S + S)
mu_g(x,t) = mu_max * f_S(S) * f_environment * relative_fitness_g
```

Resource consumption is coupled to biomass production through a yield parameter rather than an arbitrary visual depletion rate.

A baseline field equation is:

```
∂S/∂t = D_S ∇²S - uptake(B,S)
```

The dish uses a circular/no-flux boundary unless a scenario explicitly defines external feeding.

**Scientific status:** Monod/resource-limited growth is a mechanistic approximation at Petra's scale; spatial diffusion-limited colony behavior is supported by colony models/experiments including Shao et al. 2017 (DOI `10.1371/journal.pcbi.1005679`).

## 3. Antibiotic field and pharmacodynamics

Drug concentration evolves spatially:

```
∂A/∂t = D_A ∇²A - λ_A A
```

`λ_A` is zero unless a named scenario supports/chooses decay.

For the ciprofloxacin flagship, the reference concentration-response follows Regoes et al. 2004. In the paper's log10-density-slope convention:

```
psi(a) = psi_max
       - ((psi_max - psi_min) * (a / zMIC)^kappa)
         / ((a / zMIC)^kappa - psi_min / psi_max)
```

The continuous population equation must convert conventions consistently. If `psi` is a log10 density slope:

```
dB/dt = ln(10) * psi(a) * B
```

when using that rate directly.

### Cross-study genotype composition

The flagship combines a Regoes *E. coli* CAB1/LB pharmacodynamic **shape** with Marcusson MG1655 genotype MIC/fitness values. This is not one measured experiment.

Until genotype-specific time-kill curves are calibrated, Petra may shift the reference zero-growth concentration by an MIC ratio:

```
zMIC_g = zMIC_reference * (MIC_g / MIC_reference_genotype)
```

while reusing `kappa` and `psi_min` as a **transferred mechanistic approximation**.

This assumption must be visible in provenance and sensitivity tests.

## 4. Resource × drug composition

Drug action and starvation physiology are not universally separable. Petra therefore defines a versioned composition policy rather than silently mixing formulas.

Flagship policy:
1. calculate no-drug resource-limited growth;
2. calculate the drug effect relative to the reference no-drug PD state;
3. compose them into local net growth/death with explicit unit conversion;
4. test zero-drug, zero-resource, very-high-drug, and intermediate cases.

The model must not claim quantitative stationary-phase fluoroquinolone killing without source-matched calibration.

## 5. Birth, death, and mutation

Mutation occurs on reproduction, not on an independent “mutation animation timer.”

For a lineage producing `D` divisions during a step and rare mutation probability `u`:

```
M ~ Poisson(D * u)
```

is appropriate when `u` is small and `D` is large. For small populations, exact binomial/event sampling is preferred.

Each mutation event records:
- parent lineage;
- genotype transition;
- time and spatial origin;
- source/transition rule;
- child lineage identity.

Antibiotic exposure changes survival/relative growth; it does not instruct the simulator to generate a useful mutation.

## 6. Spatial expansion and competition

Competition should emerge primarily from:
- shared limiting resources;
- finite local occupancy/biomass;
- spatial access to fronts;
- genotype-specific growth/death.

Biomass expansion between neighboring demes is a **mechanical spatial approximation** unless calibrated to a specific colony system. The renderer must not create biological spread independent of the engine.

The MEGA-plate experiment (Baym et al. 2016, DOI `10.1126/science.aag0822`) is a qualitative validation target: multiple fronts/lineages, location-dependent access to new drug zones, and spatial trapping can emerge without hard-coded winners.

## 7. Stochastic numerical strategy

Exact Gillespie SSA is scientifically clean but inefficient for millions of divisions. Petra uses a hybrid:
- exact SSA/binomial events at low counts or for rare events where discreteness matters;
- Poisson/binomial tau-leaping for high-rate aggregate birth/death;
- deterministic finite-difference/finite-volume field diffusion;
- delayed/event-queue or staged compartments for phage lysis;
- adaptive time stepping constrained by diffusion stability and event probabilities.

Reference implementation tests must compare accelerated trajectories/distributions with slower exact/smaller-step cases.

Foundations: Gillespie 1977 DOI `10.1021/j100540a008`; tau-leaping literature including Cao, Gillespie & Petzold 2006 DOI `10.1063/1.2159468`.

## 8. Inherited vs reversible state

Petra distinguishes:
- **genotype:** heritable resistance/fitness traits;
- **phenotype state:** reversible tolerance/persistence/growth state;
- **lineage:** ancestry/history label;
- **rendered organism:** visual sample/proxy.

Persisters must not become genetically resistant merely because they survived a pulse.

## 9. Extension interfaces

Future modules plug into explicit event/field interfaces:
- persistence/tolerance switching;
- named bacteriophage-host systems;
- plasmid/HGT;
- multiple resources/cross-feeding;
- collateral sensitivity across antibiotics;
- species-specific temperature/pH response;
- direct antagonism/cooperation when sourced.

No extension gets a generic arbitrary slider presented as biological truth.

## 10. Scientific output contract

Every run can expose:
- scenario + engine version + seed;
- active equations/policies;
- active parameter records and citations;
- intervention timeline;
- lineage/mutation history;
- approximation labels;
- uncertainty/transfer warnings.

The UI's “Why?” panel is part of scientific integrity, not optional decoration.
