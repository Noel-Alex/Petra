# Serratia marcescens – Aspergillus niger: carbon-competition evidence boundary

Issue: #886

## Decision

Rosenzweig & Stotzky's 1979/1980 soil studies support a **named, environment-dependent carbon-competition interpretation** for *Serratia marcescens* suppressing the spread/growth of *Aspergillus niger*. They do **not** support a universal bacteria→fungus attack coefficient.

The machine-readable evidence/control record is:

`data/interactions/serratia_marcescens_aspergillus_niger_soil_carbon_competition_v1.json`

This is validation/mechanism evidence only. It is deliberately not an executable Petra kinetic pack.

## What the nutrient study establishes

In the reported K soil and 6% kaolinite/montmorillonite variants, adding 0.25%, 0.5%, or 1.0% glucose eliminated the observed inhibition of *A. niger* by *S. marcescens* under both same-site and separate-site inoculation tests. Adjusting C/N from 23/1 to 10/1 with ammonium nitrate also eliminated inhibition, while C/N 15/1 and C/P 100/1 did not.

The source also reports a direct correlation between the degree of fungal inhibition and bacterial glucose-utilization rate, and interprets the antagonism of *A. niger* by some tested bacteria as primarily carbon competition.

That mechanism is environmentally conditional. Higher nutrient additions could cause *S. marcescens* to disappear from some soils, apparently through pH reduction associated with increased metabolism. With CaCO3 buffering, glucose still eliminated or reduced inhibition whereas ammonium nitrate did not. This matters: a Petra validation scenario cannot simply encode "more nutrient = less competition" independently of pH and competitor viability.

## What the clay/pH study establishes

The companion study shows that spatial placement and soil mineralogy strongly alter the phenotype:

- with organisms at separate sites, montmorillonite at 3–12% maintained inhibition;
- 3% kaolinite reduced it and 6–12% kaolinite eliminated it;
- with both organisms at the same site, *A. niger* was inhibited across the tested soils;
- spores were inhibited more than mycelial fragments;
- inoculating fungus 96 h after *S. marcescens* increased inhibition, while 1% glucose reduced that delayed-inoculation effect;
- antagonism generally increased with pH.

These controls are useful precisely because they reject a context-free pairwise interaction law.

## What Petra may implement later

A future #553/#615-compatible scenario may use this literature as a **validation system for shared-resource competition** if Petra first owns a compatible physical resource/context contract. The minimum causal state would be:

1. explicit bacterial and fungal taxon/strain identity;
2. a source-bound carbon resource field with physical units;
3. species-specific uptake/growth/yield laws in compatible conditions;
4. pH/environment state if the intended validation reproduces the soil experiment;
5. exact inoculation geometry/timing;
6. independent organism viability/biomass state.

The interaction should then emerge through shared resource depletion. No separate "damage" term is justified by this record.

## What remains UNBOUND

This evidence record does not currently bind:

- the exact bacterial/fungal strains used in the papers;
- a reusable continuous glucose uptake equation for either organism;
- biomass yields compatible across both organisms;
- glucose transport in Petra's chosen spatial geometry;
- a pH dynamics model;
- clay cation-exchange physics;
- a continuous quantitative inhibition function.

Until those are curated, #886 is a **go** for named validation/control design and a **no-go** for numeric engine coefficients.

## Relation to the first fungal pack

The current #556/#885 filamentous-surface work uses an *A. niger* no. 10 agar system for morphology/growth evidence. This Rosenzweig/Stotzky interaction record does not establish that their soil-study *A. niger* is the same strain. Do not silently join the two records. A future combined scenario requires explicit compatibility or a declared transfer.

## Renderer/UI boundary

The dish may show authoritative bacterial density, fungal density/network support, and carbon-resource depletion once those states exist. Colony overlap, touching silhouettes, merged contours, glow, or representative glyphs never create a causal competition effect.

## Sources

- Rosenzweig WD, Stotzky G. *Influence of Environmental Factors on Antagonism of Fungi by Bacteria in Soil: Nutrient Levels.* Appl Environ Microbiol. 1980;39(2):354-360. DOI `10.1128/aem.39.2.354-360.1980`.
- Rosenzweig WD, Stotzky G. *Influence of Environmental Factors on Antagonism of Fungi by Bacteria in Soil: Clay Minerals and pH.* Appl Environ Microbiol. 1979;38(6):1120-1126. DOI `10.1128/aem.38.6.1120-1126.1979`.
