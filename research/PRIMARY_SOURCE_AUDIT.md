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

## 7. Phage model form — VERIFIED; preset pending

Adsorption, host density, latent period, burst size and phage decay are established modeling variables, but values differ strongly by host-phage pair.

**Decision:** no generic “virus” slider with invented constants. Pick a named lytic phage/host pair before enabling a scientifically labeled phage scenario.

## Audit status

**Implementation-ready:** nutrient-limited growth, ciprofloxacin pharmacodynamics, MG1655 resistance phenotype table, mutation-supply framework, spatial selection.

**Mechanism ready, calibration pending:** phage.

**Post-MVP:** HGT/plasmids, detailed fungi, quorum sensing, host immune system, cross-feeding networks.
