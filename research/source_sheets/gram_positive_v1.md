# Gram-positive growth physiology & resistance — source sheet v1

**Scope.** Mechanistic growth, stress-tolerance and resistance parameters for Gram-positive organisms in a
2-D gelified-surface (agar plate) simulator. Priority order: *Staphylococcus aureus* (NCTC 8325 / USA300),
*Staphylococcus epidermidis*, *Enterococcus faecalis*, *Listeria monocytogenes* EGD-e, *Bacillus subtilis*
168, *Micrococcus luteus*.

**Author / session:** Pixel Canary (quantitative-microbiology literature research agent).
**Date compiled:** 2026-09-26.
**Companion machine-readable file:** `gram_positive_v1.json`.

## Method and integrity rules used for this sheet

- Every number below was read off a page retrieved with `fetch_web_content` during this session; the
  `quote` field in the JSON is a short verbatim fragment of that retrieved text.
- Nothing is reported from memory. Values that could not be located in retrieved text are listed in
  §"Gaps" with `verification: unverified-secondary` or "could not retrieve" and MUST NOT be admitted
  into a parameter pack.
- Units, strain background, medium, temperature, aeration and assay basis are preserved per record.
  Conflicting values are kept as separate records, never averaged.
- A gram-negative (broth/chemostat) value is never silently reused for an agar surface; such records
  carry an explicit `transfer_note`.
- Classification vocabulary: `measured` | `derived` | `transferred` | `mechanistic-approximation` |
  `visual-only` | `hypothesis`.
- Key comparative goal: establish the real Gram-positive-vs-*E. coli* `mu_max` contrast that lets the
  simulator show genuine competitive exclusion rather than cosmetic coexistence.

## Status board

| Priority | Organism | Parameter | Status |
|---|---|---|---|
| (a) | S. aureus | mu_max rich medium + lambda, T, aeration | AWAITING SOURCE |
| (a) | S. aureus | mu_max defined/glucose-limited + lambda | AWAITING SOURCE |
| (b) | S. aureus | glucose Monod Ks | AWAITING SOURCE |
| (b) | S. aureus | Y_x/glucose | AWAITING SOURCE |
| (c) | S. aureus | cardinal T (T_min/T_opt/T_max), Ratkowsky/CTMI fit | AWAITING SOURCE |
| (d) | S. aureus | colony radial expansion mm/h, agar %, T | AWAITING SOURCE |
| (e) | S. aureus | oxacillin/methicillin MIC MSSA vs MRSA | AWAITING SOURCE |
| (e) | S. aureus | rif^r spontaneous mutation frequency | AWAITING SOURCE |
| (f) | S. epidermidis | mu_max / lag; oxacillin MIC | AWAITING SOURCE |
| (g) | E. faecalis | mu_max / lag; Ks | AWAITING SOURCE |
| (g) | E. faecalis | intrinsic aminoglycoside + cephalosporin MIC ranges | AWAITING SOURCE |
| (h) | L. monocytogenes | cardinal T incl. growth at 4 C, CTMI/Ratkowsky fit | AWAITING SOURCE |
| (i) | B. subtilis 168 | mu_max / lag defined medium; swarm/spread rate semi-solid agar | AWAITING SOURCE |
| (i) | B. subtilis 168 | rif^r mutation frequency; cardinal T | AWAITING SOURCE |
| (j) | Micrococcus luteus | mu_max / cardinal T | AWAITING SOURCE |
| (k) | all | NaCl % and pH growth limits | AWAITING SOURCE |
| (l) | all | max stationary density on agar (CFU/cm2) | AWAITING SOURCE |

---

## 1. Staphylococcus aureus — mu_max and lag

AWAITING SOURCE

## 2. Staphylococcus aureus — glucose Ks, yield, surface capacity

AWAITING SOURCE

## 3. Staphylococcus aureus — cardinal growth temperatures

AWAITING SOURCE

## 4. Staphylococcus aureus — colony expansion on agar

AWAITING SOURCE

## 5. Staphylococcus aureus — resistance MICs and mutation frequency

AWAITING SOURCE

## 6. Staphylococcus epidermidis

AWAITING SOURCE

## 7. Enterococcus faecalis

AWAITING SOURCE

## 8. Listeria monocytogenes EGD-e

AWAITING SOURCE

## 9. Bacillus subtilis 168

AWAITING SOURCE

## 10. Micrococcus luteus

AWAITING SOURCE

## 11. Osmotic and pH tolerance across Gram-positives

AWAITING SOURCE

## 12. Gaps and negative evidence

(none written yet)
