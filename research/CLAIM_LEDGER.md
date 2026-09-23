# Scientific claim ledger

This is the compact contract between Petra's interface, simulator, and evidence base.

| Petra behavior/statement | Class | Basis | Limit / transfer note |
|---|---|---|---|
| Growth slows when a limiting resource is depleted | mechanistic approximation, strongly grounded | Monod/consumer-resource literature; spatial colony work | one/few resources, not full metabolism |
| Spatial colonies can become diffusion-limited | measured/model-validated mechanism | Shao et al. 2017, DOI 10.1371/journal.pcbi.1005679 | Petra begins in 2-D |
| Ciprofloxacin effect changes continuously with concentration | measured model form | Regoes et al. 2004, DOI 10.1128/AAC.48.10.3670-3676.2004 | CAB1/LB parameters are context-specific |
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
| Each rendered bacterium is literally one simulated bacterium | **false** | rendering architecture | visuals sample/aggregate local state |
| Petra predicts human antibiotic treatment outcomes | **false** | scope | not a clinical tool |

## UI requirement
Each curated scenario exposes a **Why? / Sources / Assumptions** surface containing active rules, source identifiers, transfers/approximations, and non-claims. Scientific honesty is part of the product.
