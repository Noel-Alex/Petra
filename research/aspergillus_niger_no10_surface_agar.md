# *Aspergillus niger* var. *hennebergi* no. 10 — surface-agar evidence pack

## Status and decision

Issue #885 narrows Petra's first fungal biology target to the named ORSTOM strain reported as *Aspergillus niger* var. *hennebergi* no. 10 in Larralde-Corona, López-Isunza & Viniegra-González (1997).

This is the preferred first pack because the primary study measures **surface-grown agar cultures** and ties dry-weight growth to fungal morphometry in the same experimental system. The pack is deliberately narrower than “fungi” in general.

The supported evidence subset is sufficient to authorize:

- the exact source taxon/strain identity;
- a coarse **filamentous / hyphal** biological and presentation class;
- source-table validation targets for germ-tube elongation, first branching length, hyphal diameter, colony radial extension, distal-hypha length, maximum biomass density, and dry-weight specific growth;
- the paper's morphometric first-order equation as a **source-derived validation observable**.

It is **not** sufficient to authorize a dynamic Petra glucose field, a glucose-to-biomass yield law, a stochastic branching probability, a temperature/pH response curve, an antifungal response, or a bacteria–fungus attack coefficient. Those quantities remain explicitly UNBOUND.

Research can therefore turn **OFF for the named surface-growth validation pack**, while remaining **ON for any future physical resource-coupling or explicit hyphal-network parameterization**.

## Primary sources

### Surface morphometry and dry-weight growth

Larralde-Corona CP, López-Isunza F, Viniegra-González G. “Morphometric evaluation of the specific growth rate of *Aspergillus niger* grown in agar plates at high glucose levels.” *Biotechnology and Bioengineering* 56(3):287–294 (1997). DOI:

`10.1002/(SICI)1097-0290(19971105)56:3<287::AID-BIT6>3.0.CO;2-F`

The paper identifies the organism as *A. niger* var. *hennebergi* no. 10 from the ORSTOM fungal collection. It studies surface growth with two inoculation modes and explicitly compares sparse germ-tube morphometry with dense colony behavior.

### Culture-format dependence

Favela-Torres E, Córdova J, García-Rivero M, Gutiérrez-Rojas M. “Kinetics of growth of *Aspergillus niger* during submerged, agar surface and solid state fermentations.” *Process Biochemistry* 33(2):103–107 (1998). DOI:

`10.1016/S0032-9592(97)00032-0`

This same-strain study is contextual evidence that kinetic values depend strongly on culture format. It must not be pooled with the 1997 agar-plate rows into one universal parameter set.

## 1997 source context

### Strain and inoculum

- Source label: *Aspergillus niger* var. *hennebergi* no. 10.
- Collection: ORSTOM fungal collection, Centre ORSTOM, Montpellier, France.
- Spore-production cultures used PDA at 35 °C for 5 days.
- Approximately (10^5) spores were deposited per experimental plate.

**Temperature boundary:** the accessible source methods used for this curation explicitly state 35 °C for spore production. This pack does **not** promote that value into a measured experimental surface-growth temperature or a fungal temperature-response curve. Product/runtime temperature remains unbound until the actual growth-condition temperature is source-verified and a validity range is curated.

### Surface medium

Initial glucose treatments:

`10, 40, 70, 120, 200, 300 g/L`

The study kept C/N = 12 and used urea:ammonium sulfate at 4:1 w/w. Other reported medium components were:

- KH₂PO₄: 0.50 g/L
- MgSO₄·7H₂O: 0.6 g/L
- yeast extract: 0.1 g/L
- bacteriological agar: 12 g/L
- trace-mineral solution: 2 mL/L

Fifteen millilitres of medium were poured into each 9-cm-diameter Petri dish, with each treatment in triplicate.

### Inoculation modes are different authority contexts

The paper deliberately uses two inoculation protocols. Petra must keep them distinct.

**Lawn-type inoculation** supports:

- dry-weight biomass time courses and `mu_obs`;
- germ-tube elongation kinetics `k`;
- hyphal diameter `D_h`;
- mean critical germ-hypha length before first ramification `L_c`.

**Central point/puncture inoculation** supports:

- colony radial extension `u_r`;
- average distal-hypha length `L_av`;
- maximum unbranched distal length `L_max`.

Do not claim that a value measured under one inoculation geometry is a direct measurement under the other.

## Source-table targets

### Sparse germ-tube stage

| glucose (g/L) | k (h⁻¹) | Lc (µm) | Dh (µm) | time to first branch (h) | KL (µm) | Vmax (µm/h) |
|---:|---:|---:|---:|---:|---:|---:|
| 10 | 1.1 | 461 | 6.32 ± 0.69 | 6.0 | 150 ± 30 | 183 ± 11 |
| 40 | 1.0 | 312 | 5.44 ± 0.90 | 8.6 | 100 ± 5 | 119 ± 2 |
| 70 | 0.9 | 277 | 4.95 ± 0.64 | 8.5 | 130 ± 40 | 121 ± 16 |
| 120 | 0.8 | 157 | 4.85 ± 0.84 | 9.2 | 150 (SD unverified) | 153 ± 34 |
| 300 | 0.5 | 286 | 3.37 ± 0.36 | 15.0 | 75 ± 44 | 9 ± 2 |

The paper notes onset of germination at approximately 6 h after inoculation when defining the interval to first branching. The 200 g/L treatment was not reported in this germ-tube table. The accessible text extraction for the 120 g/L saturation-length uncertainty is ambiguous (it appears concatenated as `150 ±160`); Petra therefore records the central value but leaves that SD unverified rather than promoting an uncertain OCR token into numeric authority.

### Dense colony stage

| glucose (g/L) | radial extension ur (µm/h) | Lav (µm) | Lmax (µm) | Xmax (mg/cm²) | ur/Lav (h⁻¹) |
|---:|---:|---:|---:|---:|---:|
| 10 | 346 | 220 ± 95 | 542 | 2 | 1.6 |
| 40 | 556 | 540 ± 270 | 1219 | 7.5 | 1.0 |
| 70 | 614 | 460 ± 250 | 1200 | 15 | 1.3 |
| 120 | 580 | 450 ± 230 | 874 | 19 | 1.3 |
| 200 | 430 | 550 ± 270 | 1340 | not reported | 0.8 |
| 300 | 381 | 640 ± 290 | 1166 | 13 | 0.6 |

The paper reports radial-extension standard deviation below 2% for these rows. Radial extension and maximum biomass density showed a non-monotonic response to high initial glucose; the colony became denser/slower at high glucose rather than behaving like a simple Monod-limited low-substrate series.

### Dry-weight specific growth and morphometric prediction

| glucose (g/L) | mu_obs dry-weight (h⁻¹) | mu_calc morphometric (h⁻¹) | mu_calc / mu_obs |
|---:|---:|---:|---:|
| 10 | 0.30 | 0.31 | 1.0 |
| 40 | 0.18 | 0.16 | 0.8 |
| 70 | 0.20 | 0.20 | 1.0 |
| 120 | 0.19 | 0.20 | 1.1 |
| 300 | 0.09 | 0.08 | 0.9 |

The paper reports mean `mu_calc / mu_obs = 0.97 ± 0.09`.

Its proposed first-order morphometric estimator is:

`mu_calc = u_r * ln(2) / (L_av * ln(L_av / D_h))`

For Petra, this equation is a **validation relationship** between source-measured morphology and dry-weight growth. It is not automatically the numerical update law for a simulated hyphal graph.

The paper also fits the dry-weight growth response over its high-glucose series with:

- fitted `mu_max = 0.30 ± 0.035 h^-1`;
- fitted glucose-inhibition `K_i = 132 ± 52 g/L`.

These are source-context high-glucose inhibition fit parameters. **K_i is not a Monod half-saturation constant**, and neither value authorizes treating the instantaneous local glucose concentration as a dynamic growth-control law.

## 1998 cross-format evidence

The 1998 same-strain comparison reports that the maximum specific growth rate depended strongly on culture format:

- solid-state fermentation: 0.323 h⁻¹ at the lowest tested SSF glucose condition (50 g/L);
- agar-surface fermentation: 0.247 h⁻¹ at the lowest tested ASF glucose condition (30 g/L);
- submerged fermentation: 0.134 h⁻¹ at the lowest tested SMF glucose condition (30 g/L).

It also reports complete glucose consumption up to different initial concentrations by format (SSF 200 g/L, ASF 150 g/L, SMF 100 g/L).

Petra uses this evidence as a **refusal boundary**: agar, submerged and packed solid-state numbers cannot be averaged or freely transplanted into one fungal growth pack.

## Resource-coupling decision

A physical glucose field is **not yet admitted**.

Why:

1. The 1997 paper is excellent for surface-growth and morphology targets, but it does not by itself provide a local glucose diffusion + uptake + biomass-yield law suitable for Petra's two-dimensional reaction–diffusion update.
2. The 1998 paper demonstrates glucose uptake and consumption are format dependent. Its abstract-level values are not enough to define a local spatial uptake law for Petra.
3. Later *A. niger* uptake studies use different strains/culture systems. They are useful mechanistic context, not a license to silently graft their uptake constants onto ORSTOM no. 10.

Therefore:

- the current E. coli `model-resource` field must **not** be relabelled glucose for this fungus;
- no glucose diffusion coefficient, uptake `K_s`, biomass yield, or local resource-consumption coefficient enters #615 from this pack;
- #657 may later fit explicitly eligible engineering parameters against the source-table targets, but fitted values must remain calibrated/engineering, not measured.

## Hyphal-state decision

The first fungal engine should not be “bacteria with a hyphal sprite”, but it also should not allocate millions of literal hyphal segments without a sourced branching law.

### Source-backed biological authority available now

- organism is filamentous/hyphal;
- colony front has measured radial extension under each source glucose condition;
- germ tubes have measured elongation/diameter/first-branch-length observables;
- distal hyphae have measured length summaries.

### Still unbound

- stochastic branch-initiation probability per unit length/time;
- branch-angle distribution;
- local anastomosis/fusion probability;
- biomass ↔ total hyphal length conversion;
- local thickness / vertical colony structure;
- spore-germination probability distribution;
- physical tip density per unit biomass.

### Recommended #615 first slice

Implement a **source-constrained surface-plate validation mode**, not a generic fungus.

Replay/checkpoint authority should minimally include:

- exact fungal taxon/content-pack identity;
- source glucose-treatment identity (a fixed experimental condition, not a dynamic resource field);
- founder/point-inoculation position for radial-front tests;
- biological time;
- a physical colony-front/radius quantity tied to the 9-cm source plate geometry when using point-inoculation validation;
- any explicit fungal biomass state only if its unit/mapping is declared and independently validated.

The first slice may advance the source-supported colony front at the selected measured `u_r` and compare against the source treatment matrix. It may expose the measured morphometric targets for validation.

Do **not** create biological branch segments by drawing random renderer paths and then feed those paths back into state. If #615 later chooses a literal hyphal graph, it needs a separate reviewed branching-state policy and validation target.

## Renderer/UI handoff

The renderer may use a source-backed fungal presentation record to show **filamentous / hyphal representative structure**. That record is presentation evidence only.

For the requested dense-colony look:

- authoritative fungal support/density == 0 must render transparent;
- increasing authoritative support may increase visual mass/opacity;
- overlapping presentation masses may visually merge for legibility/performance;
- bounded deterministic representative hyphal paths may sit above the mass;
- one Pixi object per simulated hyphal segment/cell is not required and is likely undesirable.

A merged visual mass is **not evidence of biological anastomosis**. Until a source-backed fusion mechanism exists, visual merging stays Layer-5 presentation only.

## Interaction and antimicrobial boundaries

- No direct *E. coli* ↔ *A. niger* attack/cooperation coefficient is authorized here.
- #886 / #647 own named bacteria–fungus interaction research.
- Ciprofloxacin has **no fungal-effect authority in this pack**. A bacterial antibiotic field must not kill or suppress this fungus merely because it overlaps the colony.
- Fungal competition with another organism requires a resource context whose units/uptake laws are compatible for both organisms; simply placing two independently sourced packs in the same dish is not enough.

## Validation matrix for the first implementation

A #615 implementation can be considered source-consistent only if it has deterministic tests/experiments that:

1. preserve exact fixed source-treatment identity and refuse unsupported glucose conditions rather than silently interpolate as “measured”;
2. reproduce the source radial-extension targets for the six point-inoculation conditions within an explicitly declared numerical tolerance;
3. reproduce or independently compute the source morphometric `mu_calc` relationship for the five complete rows;
4. preserve the difference between lawn biomass targets and point-inoculation radial targets;
5. do not claim a dynamic glucose depletion law;
6. do not create direct bacterial antagonism or ciprofloxacin sensitivity;
7. keep unsupported temperature/pH/resource controls unavailable.

A later calibrated model may interpolate or fit between source conditions, but that must be a separate versioned **calibrated/engineering** layer with hold-out validation, not a silent reclassification of source measurements.

## Research flag

For #885's **named surface-growth evidence pack**: **OFF after the machine-readable record and claim ledger land**.

Remaining research remains ON only for explicitly separate upgrades:

- physical glucose transport/uptake/yield coupling;
- literal stochastic hyphal branching/anastomosis;
- temperature/pH response;
- antifungal pharmacodynamics;
- named cross-species interaction.

That boundary is sufficient for #615 to implement the first honest fungal validation mode without waiting for every future fungal feature.
