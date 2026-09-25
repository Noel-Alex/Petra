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

## Selected first named pack — R388 / E. coli K-12 BW27783

#551 selects plasmid **R388** in isogenic *E. coli* K-12 **BW27783** donor/recipient backgrounds as Petra's first HGT evidence pack. See `r388_bw27783_hgt_pack.md` for the exact source context and validation contract.

Source-backed transfer authority from Rodriguez-Grande et al. 2025 (DOI `10.1371/journal.pgen.1011560`) is a Holling type-II-like surface-conjugation law with R388 `K_on = 90 µm²/h` (95% CI 45–130) and engagement time `tau = 0.33 h` (95% CI 0.25–0.40) on solid LB agar at 37 °C. The measured law consumes recipient areal density in `cells/µm²`; it is not a universal per-cell probability.

Fernandez-Lopez et al. 2014 (DOI `10.1371/journal.pgen.1004171`) provides same-host evidence for two distinct costs: established R388 carriers have approximately 17% longer generation time than plasmid-free BW27783, while newly formed transconjugants have an approximately 2.5× first-generation time and then recover from that transient deficit. Petra must keep acquisition state distinct from steady carriage cost if both are enabled.

Wild-type R388 segregation loss is **disabled/unbound** in the first BW27783 pack. Strong stability evidence exists in another E. coli host (Guynet et al. 2011, DOI `10.1371/journal.pgen.1002073`), but Petra does not transfer that host-specific loss rate silently.

Physical evaluation of `K_on` is blocked on #914: normalized grid geometry, renderer pixels and glyph counts are not physical area or recipient density authority.

Research is OFF for named-pack selection/law choice. #552 owns the replayable engine and #586 owns reusable machine-readable content packaging.
