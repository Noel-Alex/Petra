# R388 / E. coli K-12 BW27783 conjugation evidence pack

Issue: #551  
Engine owner: #552  
Physical areal-density calibration prerequisite: #914

## Status

**Selected first HGT pack:** conjugative plasmid **R388** in isogenic *Escherichia coli* K-12 **BW27783** donor/recipient backgrounds.

**Research flag: OFF for plasmid/host selection, transfer-law form, steady carriage cost, and acquisition-cost phenotype.**

The pack is not yet runnable as a physically labelled Petra spatial scenario because the source transfer law requires recipient density in `cells/µm²`. Petra must bind a scenario-owned physical area + population scale under #914 before evaluating the measured `K_on` in Science Mode.

Segregational loss remains disabled/unbound in the first pack because no exact BW27783 wild-type R388 loss rate was identified.

## Why this is the first HGT pack

R388/BW27783 is unusually coherent for Petra because primary studies on the same plasmid and E. coli K-12 host background provide:

- a density-aware surface-conjugation law with measured encounter and engagement parameters;
- exact solid-LB/37 °C assay context;
- long-term plasmid carriage burden in BW27783;
- a distinct short-term acquisition burden in newly formed BW27783 transconjugants;
- explicit R388 resistance determinants/phenotype;
- strong supporting evidence that wild-type R388 is vertically stable, while still allowing Petra to refuse an unsourced BW27783 segregation rate.

This is preferable to a generic fixed “HGT probability per cell”.

## Biological identity

### Host

The transfer-law experiments use isogenic selectable-marker derivatives of *E. coli* K-12 BW27783.

BW27783 is an E. coli K-12 strain. Published genotype descriptions include:

`F− Δ(araD-araB)567 ΔlacZ4787(::rrnB-3) λ− Δ(araH-araF)570(::FRT) ΔaraEp-532::FRT φPcp8-araE535 rph-1 Δ(rhaD-rhaB)568 hsdR514`.

The conjugation studies distinguish otherwise-isogenic donors/recipients using spontaneous nalidixic-acid and rifampicin resistance markers. Fernandez-Lopez et al. 2014 reports no observable growth-rate difference between the two marker variants used in its comparison.

The selectable markers are assay identity, not Petra biology to generalize to other E. coli strains.

### Plasmid

R388 is a low-copy broad-host-range IncW/PTU-W conjugative plasmid. It carries the In3 class-1 integron and resistance determinants that confer trimethoprim and sulfonamide resistance.

Those resistance determinants authorize **plasmid phenotype metadata only** in this pack. They do not supply a BW27783 trimethoprim/sulfonamide MIC, pharmacodynamic curve, or treatment-effect law.

## Primary quantitative transfer authority

Rodriguez-Grande et al. 2025, DOI `10.1371/journal.pgen.1011560`.

### Source context

- host: isogenic E. coli BW27783 donor/recipient marker variants;
- medium: LB;
- mating surface: LB agar;
- temperature: 37 °C;
- short mating interval: normally 1 h for density-law fitting;
- donor:recipient ratios include 1:100 and 1:10,000;
- cell density is **physical surface density**, calculated from viable counts divided by the mating surface area;
- short assays are designed to limit confounding by vegetative growth.

Source surface densities span density-limited and engagement-limited regimes. The transition occurs around `0.02–0.05 cells/µm²`; source kinetic experiments commonly begin around `~1 cell/µm²`.

### Transfer law

For susceptible recipient areal density `R`, encounter/search rate `K_on`, engagement time `tau`, and short mating time `t`, the source models conjugation with a Holling type-II-like rate. For conjugative plasmids, newly formed transconjugants become donors, yielding the autocatalytic short-time relation:

`ln(1 + T/D) = (R * K_on / (1 + R * K_on * tau)) * t`

where `T/D` is transconjugants per initial donor.

For R388:

| Quantity | Value | 95% confidence interval | Unit |
| --- | ---: | ---: | --- |
| `K_on` | 90 | 45–130 | µm²/h |
| engagement time `tau` | 0.33 | 0.25–0.40 | h |

At high recipient density, the transfer rate saturates at approximately `1/tau`, around three transconjugants per donor per hour for R388 in the source regime. At low density the encounter term dominates.

The source's stochastic-model check reports the short-time analytic approximation within about 10% estimation error for mating times up to roughly one generation. This is a **short-time/source-context law**, not permission to run the closed-form expression over arbitrary long Petra trajectories without executing the actual state transitions.

### Critical unit boundary

`K_on` is not a dimensionless probability and recipient density is not “biomass intensity”.

To use this law, Petra needs:
- eligible donor and susceptible-recipient **cell-equivalent counts**;
- a physical surface area for the local numerical region;
- a derived `cells/µm²` recipient density.

Camera pixels, renderer glyphs, normalized dish coordinates, grid-cell index, colony opacity, or model-biomass alone cannot provide that quantity.

#914 owns this bridge. Missing area/population calibration must keep quantitative R388 transfer fail-closed.

## Steady plasmid carriage cost

Fernandez-Lopez et al. 2014, DOI `10.1371/journal.pgen.1004171`, measured BW27783 cells carrying R388 for at least ten generations.

In that LB/37 °C context, established R388-carrying cells had an approximately **17% longer generation time** than plasmid-free cells.

Petra may use this as:
- a source-context steady-carriage validation target; and
- a candidate source-backed relative growth penalty only in a compatible R388/BW27783 LB/37 °C execution pack.

It must not be treated as a universal R388 cost across hosts/media.

## Acquisition cost is a distinct transient state

The same 2014 study performed 30-minute R388 conjugation on LB agar at 37 °C, then followed donor, recipient and new transconjugant growth in liquid LB.

Measured behavior:
- fresh transconjugants had a first apparent generation time about **2.5×** that of donor cells;
- the relative transconjugant deficit recovered after roughly **90 min**;
- after the unusually long first generation, transconjugants recovered sufficiently to achieve the same total number of divisions as donor cells over the seven-generation experiment.

The study's mobilizable-vector control did not reproduce the same growth deficit, supporting the interpretation that the transient burden comes from acquisition/establishment of the conjugative plasmid rather than simple mating-pore injury.

### Petra consequence

A single permanent “plasmid cost” scalar cannot honestly represent both effects.

If #552 enables acquisition cost, authoritative state needs a recent-acquisition phase/age or another explicit stateful policy. The first-generation ~2.5× slowdown and ~90-minute recovery are validation targets. The exact interpolation/relaxation curve between measured points is not itself directly measured as a reusable law and must be versioned as an engineering/calibrated policy if Petra needs one.

## Segregational loss

Guynet et al. 2011, DOI `10.1371/journal.pgen.1002073`, shows strong vegetative stability of wild-type R388 in E. coli LN2666: 100% retention after 80 generations under the reported nonselective serial-culture assay. Deleting `stbA` causes approximately 5% loss per generation.

This demonstrates a real R388 stability mechanism and shows why a generic plasmid-loss rate is inappropriate.

However, the quantitative stability assay is **not the selected BW27783 pack host/context**. Therefore:

- first R388/BW27783 pack: `segregationalLoss = disabled/unbound`;
- Petra must not convert “100% retained after 80 generations in LN2666” into an exact zero loss probability for BW27783;
- an enabled loss process needs compatible BW27783 evidence or an explicit transferred/calibrated decision.

## Resistance phenotype boundary

R388 is reported as trimethoprim- and sulfonamide-resistant (`Tp^R Su^R`), with the In3 integron carrying `dfrB2` and `sul1/sulI`-associated resistance authority.

This pack may expose:
- plasmid identity;
- resistance-gene identity;
- qualitative resistance phenotype provenance.

It may **not** enable a trimethoprim or sulfonamide concentration-response mechanism without a separate compatible MIC/PD pack.

R388 does not confer ciprofloxacin authority and must not be mapped to Petra's existing ciprofloxacin genotype effects.

## Environment and transfer limits

Supported source domain for the first quantitative conjugation pack:
- R388;
- E. coli K-12 BW27783 marker variants;
- solid LB-agar surface;
- 37 °C;
- short mating intervals where source approximations were validated;
- explicit physical recipient areal density.

Do not silently transfer the numbers to:
- MG1655;
- Bacillus, fungi, or other taxa;
- liquid conjugation;
- minimal medium;
- arbitrary temperature/pH;
- biofilm matrices;
- clinical environments;
- renderer-contact events.

Fernandez-Lopez et al. explicitly uses the fact that R388 does not conjugate in liquid LB under its post-mating growth assay conditions to separate growth from new transfer. The first Petra pack therefore keeps liquid transfer OFF.

## Minimum authoritative HGT state for #552

A replayable implementation should distinguish at least:

1. plasmid-free susceptible host cohort;
2. established R388 carrier/donor cohort;
3. newly formed R388 transconjugant cohort when acquisition cost is enabled;
4. exact plasmid identity separate from chromosomal genotype/lineage identity;
5. cell-equivalent eligible counts and physical local area needed for the source transfer law;
6. deterministic biological RNG and exact accepted-transfer event identity.

A successful conjugation:
- consumes one eligible susceptible recipient state;
- creates one R388-bearing transconjugant without creating biomass;
- makes that new carrier eligible to donate according to the declared update order;
- is distinct from chromosomal mutation and lineage ancestry mutation;
- preserves exact plasmid provenance.

The transfer operator must be bounded by eligible donor/recipient opportunities and replay identically for fixed state/config/RNG.

## Validation contract

Before Science Mode activation, add deterministic/local evidence through `python run_local_experiments.py` covering:

- zero donors -> zero HGT;
- zero susceptible recipients -> zero HGT;
- missing physical area or population calibration -> fail closed;
- low-density approximately encounter-limited behavior;
- high-density saturation toward the engagement-time limit;
- R388 source-like T/D-vs-density checks over the measured density regime;
- no transfer in an explicitly unsupported liquid-R388 configuration;
- donor/recipient marker-label symmetry where biology is otherwise identical;
- established-carrier growth penalty vs plasmid-free control in the compatible context;
- fresh-transconjugant first-generation slowdown/recovery if acquisition state is enabled;
- no segregation event while loss is disabled;
- exact checkpoint/restore/replay and RNG continuation;
- no resistance/drug effect merely from a renderer label.

## Machine-readable content-pack handoff

#586 should represent this pack without hard-coding R388 in engine logic. Minimum content fields:

- plasmid ID, incompatibility/PTU class and resistance-gene metadata;
- donor taxon/background ID and recipient taxon/background ID;
- selectable-marker assay context separated from biological identity;
- medium, surface/liquid mode, temperature, mating-time validity;
- transfer-law kind `holling-type-ii-conjugation`;
- `K_on`, confidence interval and `µm²/h` unit;
- `tau`, confidence interval and `h` unit;
- recipient density unit `cells/µm²`;
- steady carriage-cost evidence;
- acquisition-cost evidence/state requirements;
- segregation-loss policy explicitly disabled/unbound;
- phenotype metadata for `Tp^R/Su^R` with no inferred PD;
- source keys, classification, limitations and #914 calibration dependency.

## Decision

The named biological pack is selected and the transfer/cost evidence question is no longer open-ended.

**Research is OFF for #551's named-pack selection and source-law decision.**

Remaining work is implementation/calibration:
- #914 — physical areal-density + population bridge;
- #552 — replayable HGT engine;
- #586 — reusable machine-readable content-pack representation.

Do not resume broad plasmid literature collection unless one of those implementation steps exposes a specific missing evidence question.
