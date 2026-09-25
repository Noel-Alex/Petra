# Collateral sensitivity and cross-resistance

Resistance evolution can change susceptibility to other antibiotics, but Petra must bind those effects to an exact strain/genotype or experimentally identified resistant state, drug pair, assay environment, and susceptibility endpoint. A generic rule that “resistance to drug A makes drug B stronger” is not scientifically defensible.

## Current flagship: negative evidence matters

Petra's current *E. coli* K-12 MG1655 ciprofloxacin graph uses combinations drawn from `gyrA S83L`, `gyrA D87N`, `parC S80I`, `acrR` loss, and `marR` loss.

Chauhan et al. (Communications Biology, DOI `10.1038/s42003-025-09303-1`) is unusually relevant to that exact background. The study:

- used *E. coli* K-12 MG1655, generally in LB at 37 °C;
- constructed all 64 combinations of six clinically relevant ciprofloxacin-resistance mutations: `gyrA S83L`, `gyrA D87N`, `parC S80I`, `ΔacrR`, `ΔmarR`, and `ΔsoxR`;
- found **no detectable collateral sensitivity to gentamicin in any of those 64 constructed strains**;
- separately screened 13 clinically relevant resistance mutants against 23 antibiotics and found only two weak collateral-sensitivity cases, both involving `rpoB S531L`, not the current ciprofloxacin genotype graph.

Therefore Petra must **not** add a current-flagship rule such as “ciprofloxacin resistance increases gentamicin sensitivity.” The current Petra ciprofloxacin states are a subset of the clinically relevant mutation vocabulary explicitly tested in this MG1655 study.

The same study did observe gentamicin collateral sensitivity after laboratory ciprofloxacin evolution in 43/150 isolates. Sequencing and reconstruction associated that phenotype with reduced/lost function in `guaA`, `metG`, `mnmA`, `sspA`, and `tusC` (with the study also discussing `yheO` through its effect on the `tusDCB` operon). Those trajectories are **not** interchangeable with the clinical `gyrA/parC/acrR/marR/soxR` trajectory used by Petra.

Important limits from that work:

- the collateral-sensitive isolates had a substantial growth-fitness cost;
- after 100 generations of compensatory evolution, improved growth was accompanied by reduced/lost gentamicin collateral sensitivity in 9/15 improved lineages;
- the collateral-sensitivity-causing mutations were not enriched in 835 clinical *E. coli* genomes classified by ciprofloxacin resistance;
- the 23-antibiotic collateral profiles were measured primarily as changes in **disc-diffusion inhibition zone**, not as a genotype-specific concentration-to-growth/death pharmacodynamic curve.

A disc-zone change in millimetres is useful phenotype evidence. It is **not** permission to invent an MIC multiplier, a Hill coefficient, a kill-rate curve, or a concentration-field effect.

## Quantitative candidate lane: sequenced MG1655 mutants with dose-response IC90

Allen, Pfrunder-Cardozo & Hall (2021), DOI `10.1128/mSystems.01055-21`, provides a stronger quantitative substrate for a future Petra multidrug pack:

- ancestral background: *E. coli* K-12 MG1655;
- basal assay context: LB buffered to pH 7.0 at 37 °C;
- additional contexts: pH 6.5, 42 °C, and LB + 0.5 g/L bile salts;
- resistant isolates were whole-genome sequenced;
- selection/paired-drug dose-response curves were measured and summarized as IC90;
- raw sequence and phenotype data are public in Dryad, DOI `10.5061/dryad.6m905qg16`.

The tested selection → paired-drug lanes include:

- cefuroxime → gentamicin;
- gentamicin → cefuroxime;
- streptomycin → tetracycline;
- trimethoprim → nitrofurantoin.

The paper reports genotype-dependent collateral effects. For example, streptomycin-selected `atpG` mutants were on average more sensitive to tetracycline (reported model effect `β = -0.452` on log2 relative IC90), while gentamicin-selected `ubi` mutants were on average more sensitive to cefuroxime.

That group-level statistic is **not yet a Petra parameter**. The implementation-quality next step is to extract one exact isolate from the Dryad genotype table and its replicate basal-environment dose-response/IC90 values for both antibiotics.

The paper also provides a critical guardrail: collateral phenotype can change with environment. Gentamicin-resistant `cpxA` mutants switched between cefuroxime cross-resistance and collateral sensitivity depending on assay conditions. Petra must therefore carry environment identity with a collateral-sensitivity record; it cannot store one environment-free edge between two drugs.

## Pharmacodynamic shape is a separate authority

Regoes et al. (2004), DOI `10.1128/AAC.48.10.3670-3676.2004`, measured concentration-to-net-growth/death pharmacodynamic functions for ampicillin, ciprofloxacin, rifampin, **streptomycin**, and **tetracycline** in *E. coli* CAB1 in LB at 37 °C.

This makes the Allen streptomycin/tetracycline lane a potentially useful first engineering target: exact MG1655 IC90/genotype evidence could be combined with a source drug-shape model only through an explicit **transferred mechanistic approximation**, analogous in spirit to Petra's current ciprofloxacin transfer. It would not become a directly measured MG1655 pharmacodynamic curve merely because both studies used LB at 37 °C.

Before enabling such a transfer, #573 must identify:

1. one exact MG1655 isolate/genotype from the raw Allen data;
2. replicate basal-environment susceptibility values for both selected drugs;
3. the exact concentration units and tested concentration domain;
4. whether Petra uses source IC90 directly, a source MIC, or a separately justified conversion;
5. one named pharmacodynamic shape source per drug and its source strain/context;
6. a versioned transfer policy and validity envelope;
7. the antibiotic-free growth/fitness phenotype for the selected state if it is used by ecology;
8. a validation target that reproduces the source dose-response/susceptibility ordering without feeding renderer state back into biology.

## Multiple drugs do not imply a free combination rule

Even after two single-drug authorities exist, simultaneous exposure needs its own evidence. Petra must not assume Bliss independence, Loewe additivity, simple summed hazards, synergy, or antagonism merely because two concentration fields exist.

Sequential drug switching can be supported before simultaneous-combination pharmacology if the selected pack has exact per-drug susceptibility and replayable intervention authority.

## Promotion decision for #573

**RESEARCH_NEEDED remains ON.**

What is decided now:

- keep the current ciprofloxacin flagship free of a fabricated gentamicin collateral-sensitivity edge;
- do not convert Chauhan disc-diffusion zone changes into MIC/PD parameters;
- prefer a new, explicitly named experimental multidrug pack over silently changing the clinical ciprofloxacin genotype graph;
- use the Allen/Dryad MG1655 genotype + dose-response dataset as the leading source for selecting an exact first quantitative pair;
- treat any Regoes CAB1 drug-shape reuse as a versioned transfer, not a same-context measurement.

The research switch may turn OFF for the first pack only after the exact isolate × environment × drug susceptibility record and the per-drug PD/transfer policy are fully specified.

## Prior educational anchor

Imamovic & Sommer (2013), DOI `10.1126/scitranslmed.3006609`, evolved MG1655 resistance to many antibiotics, mapped MIC/IC90 collateral networks, and demonstrated gentamicin/cefuroxime cycling. It remains strong proof-of-principle, but its evolved phenotypic states should not be substituted for Petra's existing named ciprofloxacin genotypes without genotype-compatible evidence.
