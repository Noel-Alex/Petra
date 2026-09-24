# Primary-Source Audit — Flagship Scenario

This file records the directly checked scientific anchors for PETRA's first scenario: spatial *E. coli* evolution under ciprofloxacin.

## 1. Ciprofloxacin pharmacodynamics — VERIFIED

**Regoes et al. (2004), Antimicrobial Agents and Chemotherapy**  
DOI: `10.1128/AAC.48.10.3670-3676.2004`

The paper models bacterial net growth under antibiotic concentration with a four-parameter Hill/Emax-style function using:

- maximum drug-free net growth `psi_max`;
- minimum net growth at high concentration `psi_min`;
- pharmacodynamic zero-growth concentration `zMIC`;
- Hill coefficient `kappa`.

For the paper's *E. coli* CAB1 ciprofloxacin experiment, the fitted table reports approximately:

- `psi_max = 0.88 h^-1` in the paper's log10-density slope convention;
- `psi_min = -6.5 h^-1`;
- `kappa = 1.1`;
- `zMIC = 0.017 µg/mL`;
- conventional MIC about `0.03 µg/mL`.

**Evidence classification:** the four pharmacodynamic parameters are **derived fit estimates**, not raw measured scalars. Regoes et al. derive net growth rates from the first 60 minutes of log10 viable-density time-kill data, then fit the four-parameter pharmacodynamic function with nonlinear least squares. The conventional MIC is separately determined by a twofold dilution protocol.

**Use:** reference concentration-response shape.

**Transfer warning:** CAB1 in LB at 37 °C is not identical to every strain/environment. Exact parameter transfer to an MG1655 genotype set is an approximation that must be labeled.

## 2. Isogenic resistance genotype phenotypes — VERIFIED

**Marcusson, Frimodt-Møller & Hughes (2009), PLOS Pathogens**  
DOI: `10.1371/journal.ppat.1000541`

Reported *E. coli* MG1655 ciprofloxacin phenotypes include:

| Genotype | Cipro MIC µg/mL | Relative fitness |
|---|---:|---:|
| wild type | 0.016 | 1.00 |
| gyrA S83L | 0.38 | 1.01 |
| gyrA D87N | 0.25 | 0.99 |
| parC S80I | 0.016 | 0.99 |
| delta-marR | 0.032 | 0.83 |
| delta-acrR | 0.047 | 0.91 |
| gyrA S83L + D87N | 0.38 | 0.97 |
| gyrA S83L + parC S80I | 1.0 | 0.98 |
| gyrA S83L + delta-marR | 1.0 | 0.86 |
| gyrA S83L + delta-acrR | 0.5 | 0.95 |
| gyrA D87N + parC S80I | 0.38 | 1.02 |
| gyrA D87N + delta-marR | 1.0 | 0.83 |

Important consequence: fitness is **not** a simple monotonic penalty with mutation count. PETRA must not implement “minus 5% fitness per resistance mutation.”

## 3. Mutation supply / evolutionary path — VERIFIED

**Huseby et al. (2017), Molecular Biology and Evolution**  
DOI: `10.1093/molbev/msx052`

The study used fluctuation tests to estimate spontaneous appearance of ciprofloxacin-reduced-susceptibility phenotypes.

Useful reported values include:

- from wild type at 4× MIC: approximately `3.6e-9 mutations/cell/generation`;
- from a `gyrA S83L` background at 4× MIC: approximately `3.8e-6 mutations/cell/generation`.

The large second value reflects a much larger mutational target including many possible efflux-regulator disruptions. It is **not** the probability of one specific desired next mutation.

**Critical engine rule:** sample mutation from divisions and mutational target classes; never interpret a selected aggregate rate as a single-edge point-mutation probability.

## 4. Spatial evolution — VERIFIED

**Baym et al. (2016), Science**  
DOI: `10.1126/science.aag0822`

The MEGA-plate experiment visualized *E. coli* evolving across spatial antibiotic gradients. Qualitative behaviors PETRA may reproduce include:

- multiple lineages coexisting;
- adaptation at advancing spatial fronts;
- spatial position influencing which lineage expands;
- highly resistant mutants not automatically winning if trapped behind another lineage.

PETRA is inspired by the mechanism, not a quantitative replica unless geometry, medium, concentrations and strains are explicitly calibrated.

## 5. Spatial resource limitation — VERIFIED

**Shao et al. (2017), PLOS Computational Biology**  
DOI: `10.1371/journal.pcbi.1005679`

This work extends Monod-style growth to spatial colonies with diffusing nutrients and validates against *E. coli* colony data, including a diffusion-limited sub-exponential regime.

**Use:** explicit nutrient field + local consumption + spatial growth instead of unlimited exponential animation.

## 6. Fitness cost / compensation — VERIFIED GENERAL MECHANISM

**Andersson & Hughes (2010), Nature Reviews Microbiology**  
DOI: `10.1038/nrmicro2319`

Resistance mechanisms often carry fitness costs, but magnitudes vary and compensatory evolution can reduce costs.

## 7. T4 / MG1655 phage life history — VERIFIED; narrow transport calibration selected

**Nabergoj, Modic & Podgornik (2018), MicrobiologyOpen**  
DOI: `10.1002/mbo3.558`

The study used bacteriophage T4 DSM 4505 with *E. coli* K-12 MG1655 DSM 18039 in low-salt LB at pH 7 and 37 °C. It directly measured adsorption constant, latent period and burst size across eight chemostat growth rates from `0.06` to `0.98 h^-1`.

Across that measured domain, latent period decreased from roughly 80 to 27 min and burst size increased from roughly 8 to 89 PFU/cell; adsorption also varied with host growth state.

**Decision:** this exact pair is Petra's first phage life-history pack. The source table is the primary evidence object; interpolation is derived and application to local spatial growth state is a disclosed transfer.

**Transport audit:** Hu, Miyanaga & Tanji 2010 (DOI `10.1002/btpr.447`) measured apparent T4 diffusion of about `2.8e-11 m^2/s` in water through filter paper. Hu & Tanji 2012 (DOI `10.1002/btpr.742`) measured `4.2e-12 m^2/s` in 0.5% agarose without embedded hosts and `2.4e-12 m^2/s` with dead *E. coli* K-12 embedded; the paper attributes the slowdown to host adsorption.

**Decision:** Petra uses `4.2e-12 m^2/s` only as a **transferred 0.5% host-free agarose extracellular baseline**. Other matrix concentrations/materials and host-bearing regions are OOD. The dead-host coefficient is not a living-host constant.

**Still unbound:** separate eclipse time, living-host transport behavior and a general free-phage loss constant. Nabergoj's zero-loss term was a model assumption for its controlled context, not a universal measured constant.

## Audit status

**Implementation-ready:** nutrient-limited growth, ciprofloxacin pharmacodynamics, MG1655 resistance phenotype table, mutation-supply framework, spatial selection.

**Named life-history pack ready with transfer caveat:** T4 DSM 4505 / MG1655 DSM 18039 phage adsorption + latent period + burst.

**Calibration pending:** general free-phage loss, living-host transport/composition and any eclipse-vs-latent subdivision. Host-free 0.5% agarose transport is selected with an explicit transfer caveat.

**Post-MVP:** HGT/plasmids, detailed fungi, quorum sensing, host immune system, cross-feeding networks.
