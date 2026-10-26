# Antimicrobial PK/PD + Resistance Source Sheet v1

**Owner lane:** quantitative antimicrobial pharmacology (PK/PD, breakpoints, kill-curve kinetics,
mutant selection window, resistance genotype → MIC fold-change).
**Created:** 2026-09-26 (retry run; first run was killed by a socket error before writing anything).
**Status:** LIVE — parameters are appended as soon as each value is located in retrieved page text.

## Rules this sheet obeys

- **Nothing is written from memory.** Every number carries a short verbatim `quote` taken from text
  actually retrieved with `fetch_web_content`, plus DOI/URL. If a value could not be located in
  retrieved text it is recorded as `verification: "unverified-secondary"` or as *"could not retrieve"*
  and is **not admissible** into Petra's parameter registry.
- **Units are preserved exactly** as published (mg/L for concentrations; log10 CFU/mL for counts;
  h for time).
- **EUCAST and CLSI are never reconciled.** If the two bodies disagree, both values are recorded as
  *separate* records with their table version and year.
- **Never average incompatible studies**, never merge organism+drug pairs, never merge MIC values
  from different assays (broth microdilution vs agar dilution vs disc diffusion).
- Classification of each value: `measured | derived | transferred | mechanistic-approximation |
  visual-only | hypothesis`.
- Inoculum density, medium, strain, exposure duration and temperature are recorded because kill
  curves are inoculum-effect sensitive.

## Machine-readable twin

`antimicrobial_pkpd_v1.json` (same directory) is the authoritative machine-readable form.
Fields: `drug, organism, parameter, value, unit, classification, method,
breakpoint_standard_and_version, inoculum_cfu_per_ml, temperature_c, model_form, doi, url, quote,
verification, uncertainty, transfer_note`.

## Target matrix (drug × organism)

| Drug | E. coli K-12 MG1655 | S. aureus | S. epidermidis | E. faecalis | P. aeruginosa |
|---|---|---|---|---|---|
| Ciprofloxacin | **P0** | P1 | P2 | P2 | **P0** |
| Chloramphenicol | **P1** | P2 | P2 | — | — |
| Ampicillin | P2 | P1 | P2 | P1 | intrinsic resistant |
| Vancomycin | intrinsically resistant | P1 | P1 | P1 | intrinsic resistant |
| Rifampicin | P2 | P1 | P1 | P2 | intrinsic resistant |
| Gentamicin | P2 | P2 | P2 | P2 | P1 |

## Parameter slots (A–G)

- **A. MIC distributions** — ECOFF/wild-type epidemiological cut-off + clinical breakpoints (S, R)
  with exact table version and year, plus mechanism basis.
- **B. Kill-curve model parameters** — Emax, EC50, Hill coefficient n, regrowth parameters from an
  Emax / semi-mechanistic (HFIM) model, with the model equation in words.
- **C. Time-kill classification** — concentration-dependent vs time-dependent, with the supporting
  PK/PD index target (Cmax/MIC, %T>MIC, AUC/MIC).
- **D. Mutant selection window (MSW)** — MPC (mg/L) and mutant selection window ratio.
- **E. Resistance mutations with measured MIC fold-change** — gene + substitution → fold-change.
- **F. In vitro resistance emergence frequency** — spontaneous mutation frequency per cell.
- **G. Agar-specific facts** — drug diffusion/zone data; stability at 37 °C in agar over 18–24 h.

---

## Section A — MIC cut-offs and clinical breakpoints

AWAITING SOURCE

## Section B — Quantitative kill-curve / Emax model parameters

AWAITING SOURCE

## Section C — Time-kill kinetics classification and PK/PD index targets

AWAITING SOURCE

## Section D — Mutant selection window and mutant prevention concentration

AWAITING SOURCE

## Section E — Resistance mutations with measured MIC fold-change

AWAITING SOURCE

## Section F — In vitro resistance emergence frequency

AWAITING SOURCE

## Section G — Agar/plate-specific facts and drug stability

AWAITING SOURCE

## Section H — Human PK for one-compartment scenario (Cmax, AUC, t½)

AWAITING SOURCE

## Section I — Negative evidence / gaps

AWAITING SOURCE
