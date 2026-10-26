# Fungi (yeast + mould) growth physiology — source sheet v1

**Scope.** Quantitative growth physiology of fungi on solid / semisolid (gelified-surface) media, for a
2-D agar petri-dish simulator. Priority taxa: *Saccharomyces cerevisiae* S288C, *Candida albicans*
SC5314, *Aspergillus niger*, *Aspergillus nidulans*, *Neurospora crassa* OR74A, plus
*Penicillium*/*Trichoderma* where genuinely quantified.

**Author / session:** Pixel Canary (quantitative fungal-growth literature research agent).
**Date compiled:** 2026-09-27.
**Companion machine-readable file:** `fungi_v1.json`.

## Method and integrity rules used for this sheet

- Every number below was read off a page retrieved with `fetch_web_content` during this session; the
  `quote` field in the JSON is a short verbatim fragment of that retrieved text.
- **Nothing is reported from memory.** Values that could not be located in retrieved text are listed in
  §Gaps with `verification: "unverified-secondary"` or "could not retrieve" and MUST NOT be admitted
  into a parameter pack.
- Units, strain background, medium, temperature, water activity, aeration and assay basis are preserved
  per record. Conflicting values are kept as separate records, never averaged, never reconciled silently.
- Classification vocabulary: `measured` | `derived` | `transferred` | `mechanistic-approximation` |
  `visual-only` | `hypothesis`.
- **Transfer rule for this sheet:** a yeast (unicellular, budding) growth constant is NEVER presented as
  if it applied to a filamentous mould. Every cross-form use carries an explicit `transfer_note`.
- Petra is an educational/research simulator; antifungal dose-response records here are provenance
  records, not clinical dosing guidance.

## Status board

| Priority | Taxon | Parameter | Status |
|---|---|---|---|
| (a) | S. cerevisiae (CEN.PK113-7D + industrial) | mu_max at 12/30/39 C, anaerobic glucose | **SOURCE-VERIFIED** FUN-MU-020..022 |
| (b) | S. cerevisiae | **fitted CTMI coefficients, 2 independent sources** | **SOURCE-VERIFIED** FUN-CTMI-001..012 |
| (b+) | S. cerevisiae | fitted cardinal pH model coefficients | SOURCE-VERIFIED FUN-CTMI-005 |
| (c) | S. cerevisiae | Y_x/glucose, Y_ethanol/glucose, Y_glycerol/glucose | SOURCE-VERIFIED FUN-YLD-032..035 |
| (c) | S. cerevisiae | glucose Monod **Ks** | NOT SOURCED - Gap G-04 |
| (c) | S. cerevisiae | **AEROBIC** mu_max / Y_x/s | NOT SOURCED - Gap G-05 |
| (c) | S. cerevisiae S288C | S288C-specific mu_max | NOT SOURCED - Gap G-06 |
| (d) | S. cerevisiae | colony radial expansion on agar | NOT SOURCED |
| (d) | A. niger / A. nidulans / N. crassa | radial hyphal extension | NOT SOURCED |
| (e) | C. albicans SC5314 | mu_max / doubling time | NOT SOURCED |
| (f) | all | aw growth limits | NOT SOURCED |
| (g) | C. albicans / S. cerevisiae | antifungal MIC + kill kinetics | NOT SOURCED |
| (h) | filamentous | agar-surface O2 limitation | NOT SOURCED |

---

## 1. Saccharomyces cerevisiae — mu_max and doubling time

**Sourced (anaerobic).** Lip et al. 2020, *Biotechnol Rep* 26:e00462, DOI
`10.1016/j.btre.2020.e00462`, Table 2: "Maximum specific growth rates (h−1) in anaerobic SBR
cultivations at 12 °C, 30 °C, and 39 °C. Standard errors for each strain and for each growth
temperature were obtained from three independent batches."

| Strain | 12 °C | 30 °C | 39 °C |
|---|---|---|---|
| ADY5 | 0.059 ± 0.001 | 0.416 ± 0.004 | 0.236 ± 0.003 |
| CEN.PK113-7D | 0.051 ± 0.001 | 0.361 ± 0.001 | 0.121 ± 0.009 |
| Ethanol Red | 0.045 ± 0.001 | 0.358 ± 0.001 | 0.392 ± 0.002 |

Petra-derived doubling times (ln2/μ, **derived** by Petra — not printed by the source):
CEN.PK113-7D at 30 °C = 1.92 h; ADY5 at 30 °C = 1.67 h; Ethanol Red at 39 °C = 1.77 h.

**Two critical caveats.**

1. Every one of these values is **anaerobic**. Petra's colony sits on an oxygen-exposed agar surface,
   so these are a lower-bound / different-metabolism basis, not a surface match. Flagged as an
   explicit transfer in every record.
2. Thermal shape is strain-dependent: at 39 °C Ethanol Red (0.392) is *faster* than at 30 °C (0.358),
   while CEN.PK113-7D collapses to 0.121. One generic yeast μ(T) curve is not defensible.

**No S288C-specific μ_max was located in retrieved text.** CEN.PK113-7D is a *different lineage* from
S288C and must not be labelled S288C. See Gap G-06.

## 2. Saccharomyces cerevisiae — fitted cardinal temperature model (HIGHEST-VALUE ITEM: FOUND)

**Two independent fitted CTMI parameter sets were retrieved.** That is enough to replace a
`mechanistic-approximation` temperature label with `derived`, provided Petra stores the fitted
coefficients plus their valid range rather than a hand-drawn curve.

### 2a. Canseco Grellet et al. 2026, *Front Microbiol* 17:1783848, DOI `10.3389/fmicb.2026.1783848`

Table 2 verbatim caption: *"Growth parameters for autochthonous and control S. cerevisiae strains as a
function of temperature, estimated using the cardinal temperature model with inflection."* Columns:
`Strain | μmax (h–1) | Tmin (°C) | Topt (°C) | Tmax (°C)`, each as Mean ± SD with a 95% CI.

Verbatim model definition: *"In this model, Tmin is the minimum temperature below which growth is not
observed, Tmax is the maximum temperature above which growth ceases, and Topt corresponds to the
optimal temperature at which μmax reaches its optimal value (μopt)."*
Verbatim fitting method: *"Model parameters for CTMI and CPM were estimated via nonlinear regression,
and the goodness-of-fit was assessed by the coefficient of determination (R2), using the Quasi-Newton
algorithm implemented in Statistica 7.0 (StatSoft Inc., Tulsa, OK, United States)."*

Selected rows from the 14 assayed strains:

| Strain | μmax (h⁻¹) | Tmin (°C) | Topt (°C) | Tmax (°C) |
|---|---|---|---|---|
| Calsa (control) | 0.21 ± 0.00 | 7.46 ± 0.13 | 31.86 ± 0.67 | 45.28 ± 0.22 |
| SB31 | 0.23 ± 0.00 | 7.01 ± 0.13 | 31.45 ± 0.67 | 45.08 ± 0.22 |
| M57 | 0.14 ± 0.01 | 7.40 ± 0.17 | 30.42 ± 0.18 | 44.36 ± 0.03 |
| LC376 | 0.16 ± 0.01 | 6.34 ± 0.44 | 30.60 ± 0.67 | 45.63 ± 0.22 |
| BV37 | 0.21 ± 0.01 | 6.63 ± 0.17 | 29.74 ± 0.83 | 44.39 ± 0.03 |

Within-species fitted μmax spread = 0.14–0.23 h⁻¹ (factor ~1.6). The paper states the fitted thermal
limits span *"a broad thermal growth range, from 6.3 to 45.6°C"*. Table 3 of the same paper gives the
companion **cardinal pH model** fit (pHmin/pHopt/pHmax) for the identical strains.

### 2b. Lip et al. 2020, DOI `10.1016/j.btre.2020.e00462`, Table 1

Verbatim caption: *"Estimated parameters with standard deviation from the CTMI fit for all the 13
strains. Standard deviations for each parameter were obtained from three independent non-linear
fits."* **Column order is μopt (h−1), Tmax (°C), Tmin (°C), Topt (°C)** — NOT ascending cardinal
order, so a naive column read would silently assign Tmax to Tmin.

| Strain | μopt (h⁻¹) | Tmax (°C) | Tmin (°C) | Topt (°C) |
|---|---|---|---|---|
| CEN.PK113-7D | 0.368 ± 0.018 | 41.21 ± 0.81 | 3.08 ± 0.92 | 30.03 ± 0.85 |
| ADY5 | 0.409 ± 0.002 | 40.61 ± 0.02 | 4.06 ± 0.39 | 29.17 ± 0.65 |
| Ethanol Red | 0.467 ± 0.004 | 41.48 ± 0.05 | 1.45 ± 0.09 | 35.26 ± 0.18 |
| ADY21 | 0.302 ± 0.010 | 40.00 ± 0.00 | 2.11 ± 0.75 | 35.00 ± 0.17 |
| ADH30 | 0.236 ± 0.004 | 40.00 ± 0.00 | 4.00 ± 0.10 | 31.77 ± 0.64 |

The source cross-validates fit against measurement: *"The μmax values of ADY5 and CEN.PK113-7D at
30 °C were very similar to the estimated optimal μmax obtained from the CTMI."*

**Documented conflict, deliberately NOT reconciled:** CEN.PK113-7D T_min ≈ 3.1 °C versus the distillery
strains' T_min ≈ 6.3–7.6 °C; μopt 0.368 versus 0.14–0.23 h⁻¹. Different strains and different assay
formats, so both sets stand as separate records.

**Recommendation for Petra:** the CEN.PK113-7D set (T_opt 30.03 °C, T_max 41.2 °C, T_min 3.1 °C) is the
best-matched cardinal set for a 25/28/30 °C dish. The thermotolerant bioethanol sets (T_opt
31.9–35.3 °C, T_max 44–46 °C) would over-peak a 30 °C simulation. Note that the two sources' μmax
are mutually inconsistent by up to a factor 2.4 (0.467 vs 0.19) — strain identity, not model form,
dominates. Petra must pin a strain when it pins a CTMI parameter set.

## 3. Saccharomyces cerevisiae — glucose yield, overflow products, and Monod Ks

**Sourced** (Lip et al. 2020 Table 5, anaerobic glucose-limited chemostat, 30 °C). Units are exactly as
published: **mol per mol glucose**; Petra must not silently convert to g/g without stating the molar
basis the authors used.

| Strain | Y biomass | Y CO2 | Y ethanol | Y glycerol |
|---|---|---|---|---|
| ADY5 | 0.625 ± 0.014 | 1.422 ± 0.042 | 1.587 ± 0.049 | 0.174 ± 0.004 |
| CEN.PK113-7D | 0.498 ± 0.011 | 1.717 ± 0.033 | 1.636 ± 0.032 | 0.144 ± 0.003 |
| Ethanol Red | 0.601 ± 0.013 | 1.649 ± 0.034 | 1.554 ± 0.033 | 0.178 ± 0.004 |

Plus, verbatim: *"the total yield of by-products on glucose was very similar for all chemostat
cultivations and was on average 0.100 ± 0.005 mol of carbon produced per mol of carbon consumed as
glucose."*

This is the documented yeast **overflow/product stoichiometry** that is the legitimate analogue of
Petra's *E. coli* acetate-overflow term: ~1.64 mol ethanol per mol glucose (82 % of the 2 mol
theoretical maximum) while still committing ~0.50 mol/mol to biomass at 30 °C. Petra's *E. coli*
overflow coefficient must not be numerically reused. Note Y biomass spans 0.498–0.625 mol/mol
between strains at the SAME temperature and dilution rate — the authors attribute this to cellular
energy demand, so Y_x/s is not a species constant.

**NOT SOURCED:** a Monod K_s for glucose in *S. cerevisiae* (Gap G-04) and any **aerobic** μ_max or
Y_x/s (Gap G-05). The Crabtree/respiro-fermentative transition threshold glucose concentration was
also not located in retrieved text; the values above are all fully fermentative anaerobic steady
states and therefore describe the post-transition regime only.

## 4.–10. Sections with NO source-verified values yet

Sections 4 (*S. cerevisiae* colony radial expansion on agar), 5 (*Candida albicans* SC5314 growth and
cardinal temperature), 6 (*Aspergillus niger* radial expansion), 7 (*A. nidulans* / *N. crassa* OR74A
hyphal extension), 8 (water-activity limits), 9 (antifungal dose-response) and 10 (agar-surface oxygen
limitation) remain **empty by design**. No number in those domains was located in text actually
retrieved this session, so none is reported. See the gap register below; nothing here may be admitted
into a parameter pack.

## 11. Gaps and negative evidence

Each gap names the exact missing authority and the search that failed, so a later session can resume.

| Gap | Missing parameter | Status / what was tried |
|---|---|---|
| **G-01** | Growth medium + assayed temperature list for the Canseco Grellet 2026 CTMI/CPM assay | Primary methods text sits in the middle of a >150 KB document that the fetcher middle-truncates. Table 1 footnote confirms spot-screening used **Yeast Malt Peptone Glucose (YMPG)** plates, but that footnote is for the tolerance screen, NOT proven to be the CTMI assay medium. All FUN-CTMI-001..008 `medium` fields are therefore deliberately null/placeholder. **Do not fill from the YMPG footnote.** |
| **G-02** | Microtitre-plate medium for the Lip et al. 2020 CTMI fit | Same truncation problem. The μ_opt values are still admissible because Table 1 caption and values were retrieved verbatim; the medium is not. |
| **G-03** | Glucose concentration and medium composition of the Lip anaerobic SBR/chemostat series | Not retrieved. μ_max and yields are still admissible as measured/derived steady-state values with the medium named only as "anaerobic glucose". |
| **G-04** | **Monod K_s for glucose in *S. cerevisiae*** | NOT FOUND. Note for the next session: yeast glucose uptake is commonly described by HRT/KM rather than a Monod K_s, so a "K_s" may not exist in the form Petra's `f_S(S) = S/(K_s+S)` kernel expects. This is a model-form risk, not just a missing number. |
| **G-05** | **AEROBIC** *S. cerevisiae* μ_max and Y_x/glucose | NOT FOUND. Every sourced rate is anaerobic. Petra's agar surface is oxygen-exposed, so the flagship yeast growth rate is currently **UNBOUND** — the same class of gap Petra already records for its *E. coli* flagship (`CLAIM_LEDGER.md`: growth parameters UNBOUND until medium/unit context is versioned). |
| **G-06** | *S. cerevisiae* **S288C**-specific μ_max / doubling time | NOT FOUND. Do not substitute CEN.PK113-7D: different lineage. |
| **G-07** | *Candida albicans* SC5314 μ_max, doubling time, cardinal temperatures | NOT FOUND in retrieved text. Candidate lead: Boone et al. 2024, *Microbiol Spectr*, DOI `10.1128/spectrum.01571-24`, PMC11537104 (*C. albicans* in RPMI-1640, micronutrient/farnesol effects) — retrieved but no numeric rate extracted; retry against its figures/tables. |
| **G-08** | Radial colony / hyphal extension rate in mm per hour for *A. niger*, *A. nidulans*, *N. crassa*, and for *S. cerevisiae* on agar | NOT FOUND. Broad Europe PMC queries for `radial growth rate` returned off-target antimicrobial-screening papers rather than quantitative colony-front kinetics. Petra's existing *A. niger* authority (`data/fungi/aspergillus_niger_no10_surface_agar_1997_v1.json`, Larralde-Corona et al. 1997) was **not** re-derived or contradicted here; this sheet adds no filamentous rate. |
| **G-09** | Minimum water activity (a_w) for growth, per species | NOT FOUND. One lead: Zhao et al. 2026, *Foods* 15:2975, DOI `10.3390/foods15172975`, PMC13565433, models colony radius against **T ∈ [10, 20] °C and a_w ∈ [0.75, 0.85]**, but it is a control-theory (forward-reachable-set) paper re-using prior parameters from another source and is **not** a Petra taxon; its intervals are not measured a_w limits. Not admitted. |
| **G-10** | Fluconazole MIC / kill kinetics for *C. albicans*; intrinsic fluconazole MIC range for *S. cerevisiae* | NOT FOUND as numbers. Lead: Sakrikar, Agarwal, Suresh & Gresham 2026 bioRxiv DOI `10.64898/2026.07.12.738117` establishes that *S. cerevisiae* acquires fluconazole resistance via whole-chromosome VIII aneuploidy spanning *ERG11* and that **CNV emergence is temperature-dependent** — qualitatively valuable, but the retrieved abstract page contains **no numeric IC50/MIC**, so nothing is admissible. Retry against the full text or its source data. |

### Negative / boundary findings worth keeping

- **Yeast μ_max values conflict across strains by up to a factor 2.4** (0.19 vs 0.467 h⁻¹) and thermal
  fits disagree on T_min by ~4.5 °C. Both are kept. Any Petra parameter pack must pin **strain + assay**
  alongside a CTMI set; a species-level "yeast cardinal temperature" is not supported.
- **No fitted death/inactivation rate** accompanies either CTMI source. Consistent with
  `CLAIM_LEDGER.md` ("Growth stopping outside a cardinal growth range automatically means a validated
  death rate" = **false**), T_min/T_max in this sheet may only gate growth, never mortality.
- **Anaerobic-to-surface transfer is the dominant error risk in this sheet.** All sourced *S. cerevisiae*
  rates and yields are anaerobic steady states; the Crabtree transition threshold glucose concentration
  was not found, so Petra cannot yet place a respiro-fermentative boundary on quantitatively sourced data.
- **Nothing in this sheet is `visual-only`.** No morphology/branching parameter was sourced, and Petra's
  existing rule stands: filamentous/hyphal morphology does not imply a sourced branch probability,
  branch-angle or anastomosis rate (`data/fungi/AGENTS.md`).
