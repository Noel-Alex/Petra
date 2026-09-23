# Plasmids and horizontal gene transfer — evidence note

## Mechanism
Conjugative plasmids can transfer resistance/adaptive genes horizontally. Persistence of plasmids reflects both vertical fitness effects and horizontal transfer.

## Modeling cautions
A simple mass-action term `gamma * donor * recipient` is useful at low density, but transfer is not universally proportional to density across all regimes.

Evidence:
- “Conjugation dynamics depend on both the plasmid acquisition cost and the fitness cost” (2021), DOI `10.15252/msb.20209913`: newly formed transconjugants can have a transient acquisition cost distinct from steady plasmid fitness cost.
- “Encounter Rates and Engagement Times Limit the Transmission of Conjugative Plasmids,” DOI `10.1371/journal.pgen.1011560`: density-dependent encounter behavior can saturate because successful mating requires engagement time, motivating a Holling type-II-like local transfer law at high density.
- Spatial plasmid models (e.g. DOI `10.1099/MIC.0.2006/004531-0`) show why well-mixed mass-action assumptions can miss persistence/spread in structured communities.

## Petra design
A science preset identifies:
- plasmid;
- donor/recipient host;
- transfer law and parameters;
- plasmid fitness effect;
- acquisition lag/cost if represented;
- segregation/loss if represented;
- resistance phenotype conferred.

No generic “HGT rate” should be presented as species-independent.
