# MG1655 ciprofloxacin response scaling decision

Issue: #632

## Decision

**RESEARCH_NEEDED: OFF for genotype-specific ciprofloxacin response shape.**

Do not add genotype-specific `psi_min`, Hill-slope, or other killing-shape parameters to the flagship merely because the resistance genotype changes. Primary evidence in the exact *E. coli* K-12 MG1655 resistance background supports a simpler boundary: a shared response/model structure with genotype-specific potency or concentration-axis shift.

This strengthens the scientific basis for Petra's existing `mic_ratio_shift_reference_curve` *concept*. It does **not** turn Petra's current Regoes-CAB1-to-MG1655 ecology composition into a direct measurement or authorize replacing the current model with the Uppsala PKPD model without a separate model-selection/calibration change.

## Exact-MG1655 bactericidal evidence

Khan et al. 2015, DOI `10.1093/jac/dkv233`, developed a mechanism-based ciprofloxacin PKPD model from viable-count time-kill experiments using MG1655 WT plus six isogenic Marcusson-derived mutants carrying one to four resistance mutations.

The model used one common state/effect structure across strains. Strain-specific antibacterial potency was represented by `EC50`; those fitted `EC50` values correlated strongly with measured MIC (`r^2 = 0.99`). The authors concluded that mutant time-kill profiles were reasonably predictable from MIC alone within this experimental/model context.

Nielsen et al. 2017, DOI `10.1093/jac/dkx269`, externally evaluated the model. The time-kill work used Mueller-Hinton II broth and viable counts on MHII agar. The MG1655-derived strain set covers much of Petra's exact resistance vocabulary:

- model-development set: WT, `ΔmarR` (LM202), `gyrA S83L` (LM378), `gyrA D87N` (LM534), `gyrA S83L + D87N` (LM625), `gyrA S83L + D87N + parC S80I` (LM693), and a four-mutation derivative;
- external MG1655-derived set: `ΔacrR` (LM351), `gyrA S83L + ΔmarR` (LM421), and `gyrA S83L + parC S80I` (LM862).

For the external MG1655-derived strains, the model predicted killing using MIC as the new strain-specific input. At ciprofloxacin concentrations at or above 2× the strain MIC, those strains showed rapid pronounced killing in the reported experiments.

### Assay boundary

The Uppsala MIC values were determined by macrobroth in MHII and are not numerically interchangeable with Petra's current Marcusson Etest-derived MIC table. For example, assay-specific values differ for some exact genotypes. Petra must retain assay provenance rather than overwrite or average those values.

The Uppsala model is also a multi-state viable-population PKPD model with inoculum/state effects. Its fitted parameters are **not** drop-in replacements for Petra's Regoes four-parameter curve or current first-order ecology-loss composition.

## Exact-MG1655 growth-inhibition evidence

Das et al. 2020, DOI `10.7554/eLife.55155`, measured ciprofloxacin growth-rate dose-response curves for isogenic MG1655 WT, all five single mutants from Petra's resistance vocabulary, and eight double mutants:

- `gyrA S83L`;
- `gyrA D87N`;
- `parC S80I`;
- `ΔmarR`;
- `ΔacrR`.

The bacteria were assayed in Miller-formulation LB at 37 °C in microplates. Growth was measured by optical density across ciprofloxacin concentration series. After rescaling ciprofloxacin concentration by each strain's `IC50` and growth rate by drug-free fitness, the dose-response curves collapsed onto a common normalized shape approximated by `(1 + x^4)^-1`.

This is direct evidence for a shared normalized **growth-inhibition** shape across the exact MG1655 mutation vocabulary. It is not viable-count killing evidence and does not by itself determine a bactericidal `psi_min`.

Raw experimental growth-rate data are publicly deposited at Edinburgh DataShare, DOI `10.7488/ds/2756`.

## Petra implementation boundary

For the current flagship:

1. Keep `mic_ratio_shift_reference_curve`; do not create genotype-specific shape constants from unsupported inference.
2. Keep Marcusson 2009 as the authoritative flagship MG1655 MIC/fitness table unless a future scenario explicitly switches assay authority.
3. Treat Khan 2015 / Nielsen 2017 as exact-background support for **shared kill-model structure + potency/MIC shift**, not as direct calibration of Petra's current Regoes loss function.
4. Treat Das 2020 as exact-background support for **shared normalized growth-inhibition shape + IC50 shift**, not as bactericidal time-kill authority.
5. Continue to label Regoes CAB1/LB → MG1655/resource-ecology composition as transferred. The evidence here reduces uncertainty about genotype-dependent *shape divergence*; it does not remove strain/medium/model-transfer uncertainty.
6. Do not average or substitute MICs across Etest, macrobroth, or IC50 assays.

## What would justify reopening this question?

Reopen genotype-specific shape research only if a future feature requires a stronger claim, for example:

- evidence that one of Petra's exact genotypes has a reproducibly different normalized viable-count killing shape under a scenario-matched medium/growth state;
- explicit persistence/tolerance state modeling tied to a named genotype and condition;
- a move from the current Regoes-based loss composition to the Uppsala multi-state PKPD model or another named model family;
- a physical medium/resource calibration that makes the assay context materially scenario-defining.

Until then, extra genotype-specific curve parameters would add degrees of freedom without evidence.
