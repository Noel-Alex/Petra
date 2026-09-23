# Scientific limitations and non-claims

Petra is deliberately honest about what it does not know.

## Structural limitations
- 2-D demes approximate a real 3-D/agar colony.
- A lineage/deme represents many cells; within-lineage heterogeneity is omitted unless modeled as explicit compartments.
- One/few limiting resources do not reproduce full metabolism.
- Mechanical colony expansion is simplified.
- Most parameters are scenario-specific and can vary across labs, media, strains, temperature, oxygen, and assay.
- Full genome sequence space is replaced with curated phenotype-relevant transition graphs.

## Flagship limitations
- Regoes PD parameters and Marcusson genotype phenotypes come from different *E. coli* systems.
- MIC shifting assumes genotype differences can be represented primarily by horizontal movement of a shared concentration-response curve.
- Starvation × fluoroquinolone killing is not fully calibrated; stationary-phase behavior must not be overclaimed.
- Huseby selected mutation rates reflect mutational target sizes; they are not one-edge probabilities.
- Spatial coefficients are initially calibrated/normalized for plausible qualitative dynamics rather than claimed physical diffusion constants.

## Visual limitations
- A rendered bacterium can be a representative sample of local biomass.
- Close zooms may illustrate targets/DNA changes without simulating molecules.
- Animation interpolation never counts as evidence that the underlying model took those exact microscopic steps.

## Clinical limitation
Petra is not intended to recommend antibiotic choice, dose, duration, cycling, or phage therapy for humans/animals. Experimental drug-sequence modules are educational evolutionary models only.

## How the UI should communicate limits
Each preset exposes:
- “Grounded in” primary papers;
- “Transferred/approximated” seams;
- “Not modeled” list;
- confidence/validation level;
- link to the exact scenario/parameter manifest.
