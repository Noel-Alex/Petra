# Petra Research Coverage / Gaps

This document answers a practical question for future agents: **what science is already strong enough to implement, and what still needs primary-source parameter work before it can be called Science Mode?**

## Flagship: E. coli + ciprofloxacin

### Strong / implementation-ready
- concentration-dependent antibiotic pharmacodynamics — Regoes et al. 2004;
- curated MG1655 ciprofloxacin-resistance genotype MIC + relative fitness — Marcusson et al. 2009;
- mutation-supply / evolutionary accessibility — Huseby et al. 2017;
- spatial nutrient limitation — Shao et al. 2017;
- qualitative spatial evolutionary contingency — Baym et al. 2016;
- resource-limited growth model family — Monod-style literature.

### Explicit composition caveats
The flagship composes evidence from different strains/assays:
- Regoes PD reference is not the same MG1655 experiment as Marcusson;
- genotype PD curves are currently an MIC-ratio transfer approximation;
- spatial spread coefficients need engineering calibration before physical-distance claims;
- starvation × ciprofloxacin interaction is not yet calibrated as a specific stationary-phase kill model.

These caveats are acceptable for an educational mechanistic simulator **only because Petra exposes them**.

### Research still useful
- locate genotype-specific ciprofloxacin time-kill curves for one or more flagship genotypes to replace/shared-shape assumption;
- curate compatible E. coli growth/resource parameters for a named medium and dish/agar condition;
- find an experimentally supported effective drug diffusion coefficient/geometry if Petra wants physical millimeter/time concentration claims rather than normalized spatial transport;
- quantify uncertainty/ranges around selected genotype fitness/MIC measurements where paper data permits.

None of these gaps should block a scientifically honest first build if the transfer/calibration status remains visible.

## Persistence / tolerance

### Strong mechanism
Balaban et al. 2004 supports reversible phenotypic persistence distinct from inherited resistance.

### Not yet Science-Mode parameterized
A universal persister switching rate does not exist. Need a named strain/condition/antibiotic experiment for enabled quantitative defaults.

Status: **mechanism ready; preset calibration pending**.

## Phage

### Selected named pack
The first phage pack is **T4 DSM 4505 / E. coli K-12 MG1655 DSM 18039**, calibrated from Nabergoj, Modic & Podgornik 2018 (DOI 10.1002/mbo3.558) in low-salt LB, pH 7, 37 °C continuous culture.

The source directly measures growth-rate-dependent:
- adsorption constant;
- latent period;
- burst size;

at eight MG1655 specific growth rates from 0.06 to 0.98 h^-1. See `phage_t4_mg1655_pack.md` for the measured table and provenance rules.

### Ready with an explicit transfer
The measured table is ready to implement as a named life-history evidence object. Applying homogeneous chemostat growth-rate relationships to Petra's local spatial growth state is a **transferred mechanistic approximation**, not a direct spatial measurement. Out-of-range growth rates must be treated as OOD rather than silently extrapolated.

### Spatial transport calibration
Hu et al. 2010/2012 establish that T4 apparent diffusion is strongly matrix-dependent. Petra's selected physical transport baseline is now **0.5% agarose without embedded hosts**, using the measured Hu 2012 value `4.2e-12 m^2/s` as a **transferred** extracellular transport calibration. This does not cover living host-bearing regions; the dead-K-12 `2.4e-12 m^2/s` result is retained as adsorption-confounded evidence, not promoted as a living-host coefficient.

### Explicit boundary decisions and remaining research
- a separately measured eclipse-time subdivision remains pending only if Petra wants eclipse distinct from total latent delay;
- #139 has completed the explicit concentration/population unit bridge required before the measured mL/min adsorption constant can act on authoritative spatial state;
- #750 found no compatible measured general free-phage environmental loss constant for the selected active Phase 10 context, so physical Science Mode keeps free-phage loss **UNBOUND** rather than treating Nabergoj's zero-loss model term or storage-stability data as a decay measurement;
- #750 also keeps living-host physical transport **OUT OF DOMAIN**. Hu 2012 shows apparent transport is changed by adsorption and proliferation, and exact-pair MG1655/T4 biofilm/starvation studies (Lisac et al. 2022, DOI 10.1111/1751-7915.14079; Lisac & Podgornik 2025, DOI 10.1186/s12985-025-02934-0) couple propagation to host physiology rather than isolating a passive diffusion coefficient.

Hadas et al. 1997 (T4 / E. coli B/r) and You et al. 2002 (T7 / BL21) remain corroborating host-physiology evidence, not sources of numeric values for the MG1655/T4 preset.

Status: **named life-history pack ready with transfer label; adsorption unit bridge complete; host-free 0.5% agarose transport baseline ready as transferred calibration; general loss remains unbound and living-host physical transport remains explicitly OOD by #750 decision**. Research on those two seams is OFF unless a later scenario requires a new physical claim.

## Temperature

Ratkowsky-style suboptimal/full-range models are well established.

Pending:
- choose a named E. coli strain/medium curve and cardinal values compatible with the desired scenario;
- determine whether temperature also changes resource parameters in the selected model;
- keep killing/inactivation separate from no-growth boundary.

Status: **model family ready; flagship-specific parameterization pending**.

## pH

Rosso et al. 1995 supports cardinal pH + temperature modeling and includes an E. coli O157:H7 evaluation.

Pending:
- do not transfer O157:H7 cardinal values to MG1655 silently;
- source a compatible strain/medium parameter set before enabling a flagship pH slider.

Status: **model family ready; flagship-specific parameterization pending**.

## HGT / plasmids

Strong literature supports:
- vertical fitness cost;
- acquisition cost;
- contact/density dependence;
- spatial effects.

Pending:
- choose a named plasmid + donor/recipient host pair;
- curate conjugation law/rate, cost and loss data from compatible conditions.

Status: **mechanism ready; named pack pending**.

## Multi-species / fungi

Consumer-resource competition framework is appropriate for bacterial strain/species competition.

A fungal competitor is **not yet researched enough** for Science Mode. Need species-specific:
- growth form/morphology abstraction;
- resource usage;
- temperature/pH behavior;
- interaction mechanism;
- spatial spread.

Status: **do not enable as scientifically grounded yet**.

## Numerical methods

Strong enough to implement:
- exact SSA conceptual reference;
- adaptive/bounded tau-leaping;
- binomial/multinomial conditioning;
- finite-difference diffusion with no-flux tests.

Important implementation research boundary:
Do not “fix” unsafe stochastic steps by simply clamping negative populations to zero.

## Rendering / interaction

Engineering evidence supports:
- Web Worker simulation;
- transferable ArrayBuffers;
- PixiJS particle rendering;
- optional OffscreenCanvas;
- Motion reduced-motion accessibility;
- optional Three.js/WebGPU explanatory scenes.

These are implementation choices, not scientific claims.

## Research workflow for new features

Before promoting a feature to Science Mode:
1. choose a named biological system;
2. identify original/primary sources;
3. extract equations/parameters + units/context;
4. record transfer/calibration assumptions;
5. add machine-readable parameter records;
6. add a validation fixture;
7. update claim ledger;
8. only then expose it as a grounded scenario.

