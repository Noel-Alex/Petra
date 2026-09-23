# Scientific Claim Ledger

This is the contract between PETRA's visuals and the underlying science.

| PETRA behavior | Tier | Basis | Limitation |
|---|---:|---|---|
| Growth slows when a limiting nutrient is depleted | A | Monod / consumer-resource modeling and spatial colony work | One/few resources rather than full metabolism |
| Spatial colonies can become diffusion-limited | A | Spatial nutrient-growth models validated on bacterial colonies | MVP uses a 2D surface |
| Drug effect varies continuously with concentration | A | Regoes et al. Hill/Emax pharmacodynamic function | Parameters are drug/strain/context specific |
| Heritable mutations can arise before selection | A | Luria–Delbrück fluctuation principle | PETRA uses phenotype/genotype transitions rather than whole-genome sequence |
| Resistance can carry a drug-free fitness cost | A | Resistance-fitness experiments and reviews | Cost is genotype specific |
| Compensatory mutations can restore part of lost fitness | A/B | Compensatory-evolution literature | Only represented when a curated transition exists |
| Shared-resource competitors can suppress one another indirectly | A | Consumer-resource competition | Does not model every ecological interaction |
| Temperature changes growth rate | A | Ratkowsky/cardinal temperature models | Uniform temperature in MVP |
| Nutrients/drugs diffuse across agar-like space | A/B | Reaction-diffusion / Fickian models | Effective coefficients |
| Lytic phage has adsorption, latent period and burst size | A | Classical phage-host models | Needs a named calibrated phage-host preset before Science Mode |
| Each visible bacterium is literally one simulated cell | D | none | False; rendering samples cohort density |
| A simulated antibiotic setting predicts a human treatment | D | none | False; PETRA is not a clinical tool |

## UI requirement

Every scenario should expose a compact **Why? / Sources** panel showing the active rules, equations, source identifiers and simplifications. Scientific honesty should be visible, not buried.
