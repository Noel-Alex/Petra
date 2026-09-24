# Pharmacodynamics core

This directory implements source-backed concentration-response functions. It does **not** own scenario parameter selection.

## Ciprofloxacin flagship composition

`ciprofloxacin.ts` implements the four-parameter relation recorded from Regoes et al. (2004), DOI `10.1128/AAC.48.10.3670-3676.2004`.

For the reference *E. coli* CAB1 ciprofloxacin fit used by Petra's flagship research preset, the repository records approximately:

- `psi_max = 0.88 h^-1` in the paper's log10-density slope convention;
- `psi_min = -6.5 h^-1`;
- `kappa = 1.1`;
- `zMIC = 0.017 µg/mL`;
- conventional MIC ≈ `0.03 µg/mL`.

The implementation intentionally keeps the source log10 rate convention explicit and provides a named conversion to a natural-log population rate. Never add a log10 slope directly to an exponential/natural-log growth rate.

## Genotype MIC transfer

Marcusson et al. (2009), DOI `10.1371/journal.ppat.1000541`, measured MICs and relative fitness for curated *E. coli* MG1655 resistance genotypes. Petra's first composed model shifts the Regoes reference curve horizontally using:

`effective_zMIC = reference_zMIC * genotype_MIC / reference_MIC`.

This is a **transferred/mechanistic composition assumption**. It is not evidence that every MG1655 genotype has the same measured time-kill curve shape as CAB1. The returned response object therefore retains reference/effective MIC information so later provenance/inspector surfaces can expose the assumption.

Resistance shifts the concentration response; it never creates immunity. At sufficiently high concentration the shared reference shape still approaches its finite `psi_min` asymptote.

## Authority boundary

- scenario/preset data owns biological parameter values and citations;
- this module owns the deterministic equation and rate conversion;
- spatial drug transport belongs to `src/sim/spatial/`;
- ecology composition must state how resource-limited division and drug-associated net loss are combined;
- UI/rendering may display these values but may not alter the response.
