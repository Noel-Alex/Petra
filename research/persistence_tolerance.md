# Persistence and tolerance — evidence note

## Core distinction

Antibiotic **resistance** is a heritable change in susceptibility. **Persistence** is a reversible phenotypic state in which a subpopulation survives antibiotic exposure without stably inheriting resistance.

Primary anchor: Balaban et al. (2004), *Science*, DOI `10.1126/science.1099390`.

Key result relevant to Petra: cells regrown from persisters remain sensitive, and single-cell experiments linked persistence to pre-existing growth-state heterogeneity and reversible phenotype switching. A follow-up modeling anchor is Kussell et al. (2005), *Genetics*, DOI `10.1534/genetics.104.035352`, which treats switching as a bet-hedging strategy but also demonstrates why one fitted rate set must not be promoted as a universal E. coli constant.

## Selected named pack for #549

Petra's first bounded persistence authority is the **Balaban 2004 type-I hipA7 system**, not the type-II hipQ system.

Machine-readable evidence: `data/persistence/ecoli_mg1655_hipa7_balaban_2004_v1.json`.

### Exact biological context

Balaban et al. transferred the `hipA7` mutation from HM22 into MGY, an MG1655-derived constitutive-YFP background, and sequence-verified the selected MGYA7 strain. Their supplementary methods report:

- LB Lennox (LBL) for growth;
- 37 °C;
- stationary-phase inoculum prepared for 15 h at 250 rpm;
- 100 µg/mL ampicillin for the persistence assays;
- hipA7 microfluidic experiments started from overnight cultures with continuously flowed aerated LBL.

This context is part of the parameter identity. The pack must not silently transfer the rates to another medium, growth history, antibiotic, or temperature.

### State model Petra may implement

Use two **phenotype compartments inside one genotype**:

- `N`: normally growing / susceptible;
- `Q`: type-I persister / growth-arrested and transiently tolerant.

The state transition itself never changes genotype or MIC. A genetic resistance mutation, when/if enabled by another authority, is a separate event.

For the source high-persistence, post-stationary-phase hipA7 context:

- spontaneous `N -> Q` during exponential growth is approximated as `a ≈ 0`;
- `Q -> N` in fresh LBL has `b ≈ 0.07 h^-1`, inferred by Balaban et al. from the approximately 14 h long-lag subpopulation;
- type-I `Q` cells are growth-arrested in the source single-cell observations and source model (`mu_p ≈ 0`);
- type-I entry is **triggered by stationary-phase history**, not represented by a source-measured portable continuous rate.

The `a≈0` statement has an important source caveat: Balaban et al. say this approximation is valid in the high-persistence hipA7 experiments after passage through stationary phase, where substantially smaller subpopulations can be occluded. Petra therefore must not advertise a universal zero `N -> Q` switching rate.

### Ampicillin-response authority

At 100 µg/mL ampicillin, the hipA7 population shows biphasic killing. Balaban et al. report characteristic killing times of approximately:

- normal cells: **25 min**;
- persister subpopulation: **6 h**.

The reciprocals, 2.4 h^-1 and 1/6 h^-1, are useful **derived effective exponential time-scale reciprocals**. They are not independently measured raw `mu_n` / `mu_p` values. A coupled implementation must reproduce the source survival behavior before treating any chosen internal hazards as authoritative.

Supplementary Table S1 supplies direct validation windows:

| Inoculum history | Ampicillin time | Surviving fraction |
|---|---:|---:|
| overnight / stationary phase | 5 h | 1–5 × 10^-2 |
| overnight / stationary phase | 24 h | 1–2 × 10^-3 |
| exponentially growing | 5 h | 5–7 × 10^-5 |
| exponentially growing | 24 h | 4–7 × 10^-7 |

These ranges are validation targets, **not initial Q fractions**.

### Reversibility target

The supplementary repeat-challenge experiment shows that progeny recovered from hipA7 persisters become susceptible again. Petra's deterministic/stochastic validation for #550 therefore needs to prove:

1. a Q survivor can recover to N;
2. recovered N cells use the ordinary susceptible response;
3. persistence alone never changes resistance genotype or MIC;
4. replay/checkpoint restoration preserves the N/Q population state exactly once that mechanism exists.

## Why hipQ is not the first pack

Balaban's type-II hipQ system is scientifically interesting because persisters arise continuously and grow slowly, but the return-to-growth parameter `b` was only constrained over a wide range. Kussell et al. (2005) report `b = 10^-6–10^-4 h^-1` for hipQ and explicitly note that the full range is consistent with the experiments.

Selecting one value from that interval merely to make a demo run would invent authority. hipQ remains a future pack unless a later source or calibration decision binds the missing rate honestly.

## Explicitly UNBOUND for the selected hipA7 pack

The research does **not** establish:

- a portable stationary-phase `N -> Q` trigger rate;
- one exact stationary-phase initial Q fraction;
- a mapping from Petra's current dimensionless resource field to the Balaban stationary-phase trigger;
- an absolute normal-cell growth rate compatible with Petra's current ecology;
- an ampicillin concentration-response curve away from 100 µg/mL;
- ampicillin diffusion, decay, or delivery geometry;
- ciprofloxacin or another antibiotic's phenotype-specific killing law;
- a quantitative wild-type MG1655 three-subpopulation persistence model.

The first three points are the principal implementation boundary. The source supports the state mechanism and validation targets, but Petra must calibrate or explicitly initialize stationary-phase history rather than manufacturing a universal entry fraction.

## Implementation handoff to #550

The minimal scientifically honest engine slice is:

1. add N/Q phenotype compartments without changing genotype identity;
2. support source-context Q growth arrest and Q->N recovery;
3. keep exponential-growth N->Q at the source-bounded `a≈0` approximation;
4. represent stationary-phase entry as an explicit scenario/history boundary until a source-compatible trigger calibration exists;
5. validate against the four Table S1 survival ranges plus repeat-challenge reversibility;
6. keep the pack non-selectable in quantitative Science Mode until those tests pass and stationary-phase initialization/trigger authority is versioned.

Do **not** reuse the ciprofloxacin PD curve for ampicillin, infer a clinical dose, or call surviving Q cells resistant.

## Research decision

`RESEARCH_NEEDED` for choosing the first named persistence system is **OFF**.

The selected model/context and its refusal boundaries are sufficient to implement the phenotype mechanism without guessing a universal switching rate. The unresolved stationary-phase entry quantity is now a bounded calibration/implementation dependency rather than an open-ended literature search.

## Sources

- Balaban, N.Q. et al. (2004). *Bacterial Persistence as a Phenotypic Switch*. Science 305:1622–1625. DOI `10.1126/science.1099390`. Primary mechanism, single-cell observations, fitted switching model, characteristic killing times; supplementary methods/Table S1 provide strain construction, medium, treatment concentration, culture history, and survival windows.
- Kussell, E. et al. (2005). *Bacterial Persistence: A Model of Survival in Changing Environments*. Genetics. DOI `10.1534/genetics.104.035352`. Useful follow-up modeling context and explicit hipQ identifiability boundary.
