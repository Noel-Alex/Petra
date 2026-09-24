# Scientific claim ledger

This is the compact contract between Petra's interface, simulator, and evidence base.

| Petra behavior/statement | Class | Basis | Limit / transfer note |
|---|---|---|---|
| Growth slows when a limiting resource is depleted | mechanistic approximation, strongly grounded | Monod/consumer-resource literature; spatial colony work | one/few resources, not full metabolism |
| Genotype relative fitness can be composed as a multiplier on local resource-limited division demand | transferred mechanistic approximation | Marcusson 2009 fitness measurements + Petra growth composition | assay/background specific; multiplier composition is not a direct time-course measurement |
| Continuous aggregate division biomass is automatically an integer count of mutation opportunities | **false** | aggregate ecology/event boundary | requires an explicitly defined and validated population-unit/event bridge before integer mutation sampling |
| A generic first-order death hazard is itself a measured ciprofloxacin killing law | **false** | model-composition boundary | hazard is an input mechanism; #4 must derive/provenance drug-associated loss from the named PD policy |
| Spatial colonies can become diffusion-limited | measured/model-validated mechanism | Shao et al. 2017, DOI 10.1371/journal.pcbi.1005679 | Petra begins in 2-D |
| Ciprofloxacin effect changes continuously with concentration | measured model form | Regoes et al. 2004, DOI 10.1128/AAC.48.10.3670-3676.2004 | CAB1/LB parameters are context-specific |
| Petra may compose the MIC-shifted Regoes decrement as a non-negative first-order ecology loss hazard | transferred mechanistic approximation | Regoes model form + explicit Petra resource×drug composition | separates drug decrement from Monod division; starvation interaction is not source-matched calibration |
| Regoes zMIC automatically guarantees zero net growth in Petra's full resource-limited model | **false** | model-composition boundary | zMIC is the transferred PD-curve crossing; whole-model crossing also depends on the separately calibrated ecology baseline |
| MG1655 resistance genotypes differ in MIC and fitness | measured | Marcusson et al. 2009, DOI 10.1371/journal.ppat.1000541 | assay/background specific |
| More resistance mutations do not imply a monotonic fitness cost | measured | Marcusson genotype table | only curated genotypes |
| Resistant mutants can arise before selection | established mechanism | Luria–Delbrück; Huseby fluctuation tests | curated transitions rather than whole genome |
| Huseby 3.8e-6 rate is one exact mutation edge | **false** | Huseby 2017 | aggregate selected mutational target |
| Spatial position/front access can change which lineage succeeds | measured qualitative phenomenon | Baym et al. 2016 | not a quantitative MEGA-plate replica |
| Shared-resource competitors can suppress each other without direct attack | mechanistic | consumer-resource ecology | direct interactions need separate sources |
| Persister survival is equivalent to inherited resistance | **false** | Balaban et al. 2004 | persistence is reversible phenotype |
| Lytic phage dynamics depend on adsorption/latency/burst and host state | measured/mechanistic | Hadas 1997; You et al. 2002 | Science Mode needs a named pair/calibration |
| Plasmid transfer is a universal fixed probability per cell | **false** | conjugation literature | encounter, engagement, host/plasmid, density matter |
| Temperature can use one universal symmetric optimum curve | **false** | Ratkowsky literature | species/range-specific |
| Cardinal temperature/pH models can parameterize growth response with organism-specific minima/optima/maxima | measured/model-supported mechanism | Ratkowsky 1983; Rosso et al. 1995 | parameters and validity range are strain/medium specific |
| Growth stopping outside a cardinal growth range automatically means a validated death rate | **false** | environmental modeling boundary | growth and inactivation/death require separate evidence |
| Tau-leaping may simply clamp negative populations to zero after an unsafe draw | **false** | stochastic simulation literature | use bounded sampling/adaptive leap control; post-hoc clamp can bias trajectories |
| Each rendered bacterium is literally one simulated bacterium | **false** | rendering architecture | visuals sample/aggregate local state |
| Petra predicts human antibiotic treatment outcomes | **false** | scope | not a clinical tool |

## UI requirement
Each curated scenario exposes a **Why? / Sources / Assumptions** surface containing active rules, source identifiers, transfers/approximations, and non-claims. Scientific honesty is part of the product.
