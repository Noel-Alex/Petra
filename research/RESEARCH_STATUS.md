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

### Strong mechanism
T4/T7 literature supports:
- adsorption;
- eclipse/latent period;
- burst;
- host-physiology dependence.

Hadas et al. 1997 and You et al. 2002 are strong anchors.

### Pending
Choose one host/phage/medium/growth condition and extract compatible numeric:
- adsorption rate;
- latent/eclipse distribution;
- burst/rise behavior;
- free-phage decay if modeled;
- growth-rate dependence.

Do not mix a convenient adsorption constant from one phage with a burst/latency curve from another and call it a measured preset.

Status: **mechanism ready; numeric science pack pending**.

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

