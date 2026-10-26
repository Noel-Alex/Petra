# Enterobacteriaceae growth physiology — source sheet v1

**Scope.** Mechanistic growth parameters for a 2-D gelified-surface (agar plate) simulator at 37 °C.
Primary anchor: *Escherichia coli* K-12 MG1655. Context: *E. coli* other backgrounds, *Salmonella enterica*
Typhimurium LT2, *Klebsiella pneumoniae* subsp. *pneumoniae* MGH 78578, *Enterobacter cloacae* /
*Serratia marcescens*.

**Author / session:** Pixel Canary (quantitative-microbiology literature research agent).
**Date compiled:** 2026-09-26.
**Companion machine-readable file:** `enterobacteriaceae_v1.json`.

## Method and integrity rules used for this sheet

- Every number below was read off a page retrieved with `fetch_web_content` during this session; the
  `quote` field in the JSON is a short verbatim fragment of that retrieved text.
- Nothing is reported from memory. Values that could not be located in retrieved text are listed in
  §"Gaps" with `verification: unverified-secondary` or "could not retrieve" and MUST NOT be admitted
  into a parameter pack.
- Units, strain background, medium, temperature, aeration and assay basis are preserved per record.
  Conflicting values are kept as separate records, never averaged.
- Classification vocabulary: `measured` | `derived` | `transferred` | `mechanistic-approximation` |
  `visual-only` | `hypothesis`.

## Status board

| Priority | Parameter | Status |
|---|---|---|
| (a) | E. coli MG1655 mu_max rich broth (+lambda) | AWAITING SOURCE |
| (a) | E. coli MG1655 mu_min minimal glucose (+lambda) | AWAITING SOURCE |
| (a) | E. coli surface/agar growth rate | AWAITING SOURCE |
| (b) | glucose Monod Ks (defined minimal) | AWAITING SOURCE |
| (b) | Y_x/glucose (g DCW / g glucose) | AWAITING SOURCE |
| (b) | max cell density on plate (CFU/cm2) | AWAITING SOURCE |
| (c) | cardinal temperatures T_min/T_opt/T_max + CTMI fit | AWAITING SOURCE |
| (d) | colony radial expansion mm/h, agar % | AWAITING SOURCE |
| (e) | per-bp mutation rate u | AWAITING SOURCE |
| (e) | fluoroquinolone minimum selective concentration | AWAITING SOURCE |
| (e) | chloramphenicol minimum selective concentration | AWAITING SOURCE |
| (f) | S. enterica LT2 mu_max / lag | AWAITING SOURCE |
| (f) | K. pneumoniae MGH 78578 mu_max / lag | AWAITING SOURCE |
| (f) | E. cloacae / S. marcescens context | AWAITING SOURCE |

---

## 1. Escherichia coli K-12 MG1655 — mu_max and lag

AWAITING SOURCE

## 2. E. coli — glucose Monod half-saturation Ks and yield

AWAITING SOURCE

## 3. E. coli — cardinal growth temperatures

AWAITING SOURCE

## 4. E. coli — colony radial expansion on agar

AWAITING SOURCE

## 5. E. coli — doubling time, maintenance, death/lysis

AWAITING SOURCE

## 6. E. coli — mutation supply and antibiotic minimum selective concentration

AWAITING SOURCE

## 7. Salmonella enterica Typhimurium LT2

AWAITING SOURCE

## 8. Klebsiella pneumoniae MGH 78578

AWAITING SOURCE

## 9. Enterobacter cloacae / Serratia marcescens

AWAITING SOURCE

## 10. Gaps and negative evidence

(none written yet)
