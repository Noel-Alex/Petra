# Flagship scenario — spatial *E. coli* / ciprofloxacin evolution

## Purpose

This is Petra's first defensible end-to-end scenario because the literature supports pharmacodynamics, resistance genotype phenotypes, mutation supply, and spatial evolutionary behavior unusually well.

It is still a **composed educational model**, not a calibrated prediction for an arbitrary lab plate.

## Evidence stack

### Drug response
Regoes et al. 2004, DOI `10.1128/AAC.48.10.3670-3676.2004`.

Reported *E. coli* CAB1 ciprofloxacin fit (LB, 37 °C; paper rate convention):
- `psi_max ≈ 0.88 h^-1`
- `psi_min ≈ -6.5 h^-1`
- `kappa ≈ 1.1`
- `zMIC ≈ 0.017 µg/mL`
- conventional MIC ≈ `0.03 µg/mL`

Use: reference concentration-response **shape**. Do not pretend these are MG1655 time-kill measurements.

### Genotype phenotype/fitness
Marcusson, Frimodt-Møller & Hughes 2009, DOI `10.1371/journal.ppat.1000541`, *E. coli* MG1655 background.

| State | Genotype | Cipro MIC µg/mL | Relative fitness |
|---|---|---:|---:|
| WT | wild type | 0.016 | 1.00 |
| A | gyrA S83L | 0.38 | 1.01 |
| B | gyrA D87N | 0.25 | 0.99 |
| C | parC S80I | 0.016 | 0.99 |
| D | ΔmarR | 0.032 | 0.83 |
| E | ΔacrR | 0.047 | 0.91 |
| AB | gyrA S83L + D87N | 0.38 | 0.97 |
| AC | gyrA S83L + parC S80I | 1.0 | 0.98 |
| AD | gyrA S83L + ΔmarR | 1.0 | 0.86 |
| AE | gyrA S83L + ΔacrR | 0.5 | 0.95 |
| BC | gyrA D87N + parC S80I | 0.38 | 1.02 |
| BD | gyrA D87N + ΔmarR | 1.0 | 0.83 |
| ACB | gyrA S83L + parC S80I + gyrA D87N | 32 | 1.01 |

Key lesson: fitness is genotype-specific and epistatic. Mutation count is not a valid fitness proxy.

### Mutation supply
Huseby et al. 2017, DOI `10.1093/molbev/msx052`.

Reported selected appearance rates at 4× MIC include approximately:
- WT → reduced susceptibility: `3.6×10^-9` per cell/generation;
- gyrA S83L background → reduced susceptibility: `3.8×10^-6`;
- gyrA S83L + parC S80I background → higher resistance: `1.2×10^-9`.

The large middle value represents a large **mutational target**, including many possible efflux-regulator disruptions. It is not the probability of one desired edge.

Huseby's population modeling used point-mutation targets around `10^-10/generation` and regulator-disruption classes around `10^-7/generation`. Petra can use those orders of magnitude for curated transition classes while preserving the aggregate-rate validation targets separately.

A high-value canonical path is:
`WT → gyrA S83L → parC S80I → gyrA D87N`.

### Spatial behavior
- Shao et al. 2017, DOI `10.1371/journal.pcbi.1005679`: spatial colonies become nutrient-diffusion limited.
- Baym et al. 2016, DOI `10.1126/science.aag0822`: spatial antibiotic landscapes generate front-dependent evolutionary dynamics.

## Scenario composition

1. Start MG1655 WT biomass at one or more inoculation points.
2. Diffuse/consume limiting nutrient.
3. Grow/reproduce locally according to resource state and genotype relative fitness.
4. Apply ciprofloxacin as a uniform pulse, painted region, radial/linear gradient, or MEGA-like bands.
5. Convert local drug concentration to a genotype-specific MIC-shifted PD response, then map only the decrement from the Regoes drug-free reference to the versioned first-order ecology loss policy `reference_pd_decrement_as_first_order_loss_v1`.
6. Keep the resource-limited division baseline separately provenance-owned; do not silently set it equal to the Regoes `psi_max`.
7. Sample mutations from reviewed birth/event opportunities; create child lineages at their local origin.
8. Allow fronts to spread into neighboring capacity; no lineage receives a hidden “selection bonus.”
9. Record lineage ancestry, mutation event, spatial origin, extinction, and front breakthroughs.

## Demonstrations Petra should be able to produce

### A. Selection is not mutation
Run identical seed/state until the intervention fork:
- branch 1: no drug;
- branch 2: ciprofloxacin.
A rare resistant lineage may pre-exist both branches; it expands only when the environment favors it.

### B. Fitness trade-off
Compare ΔmarR or ΔacrR states against near-neutral gyrA states without drug and under drug.

### C. Spatial contingency
A more resistant lineage can fail to dominate because another lineage occupies/accesses the advancing front first.

### D. Gradient adaptation
MEGA-like increasing zones create sequential front stalls/breakthroughs. This is qualitative inspiration unless geometry/medium/PD are reconstructed.

## Explicit non-claims
- not a patient treatment simulator;
- not a prediction of an arbitrary clinical isolate;
- not a whole-genome evolution model;
- not exact replication of Regoes, Marcusson, Huseby, Shao, or Baym experiments simultaneously;
- not evidence that resistance always follows the canonical path.
