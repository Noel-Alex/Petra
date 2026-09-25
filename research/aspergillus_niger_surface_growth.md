# Aspergillus niger no. 10 — surface-growth evidence boundary

## Decision

Petra's preferred first **filamentous fungal** evidence pack is *Aspergillus niger* var. *hennebergi* no. 10 from the agar-surface experiments of Larralde-Corona, López-Isunza, and Viniegra-González (1997), DOI `10.1002/(SICI)1097-0290(19971105)56:3<287::AID-BIT6>3.0.CO;2-F`.

This choice is about **evidence compatibility with a Petri-dish surface simulation**, not about choosing a universal or clinically representative fungus.

The machine-readable source table lives at:

`data/fungi/aspergillus_niger_hennebergi_no10_surface_v1.json`

## Why this system is useful

The study measured two complementary scales in the same named strain and agar system:

- sparse germ tubes: specific elongation, length just before first branching, hyphal diameter, time to first branching, and a fitted maximum elongation rate;
- dense colonies: radial extension, distal hyphal lengths, maximum surface biomass density, and dry-weight specific growth.

Glucose was deliberately varied while C/N was held fixed. The measured colony behavior is **not monotonic** in glucose: radial extension rose from 346 µm/h at 10 g/L to 614 µm/h at 70 g/L and then fell at higher concentrations, while dry-weight specific growth also fell substantially at high glucose. That is exactly the kind of source-backed response Petra should validate rather than replacing with a visually convenient constant-speed front.

## Source context that must remain attached

The organism is reported as *A. niger* var. *hennebergi* no. 10 from the ORSTOM collection. The experimental medium used glucose 10, 40, 70, 120, 200, or 300 g/L at C/N = 12, with a 4:1 urea:ammonium-sulfate nitrogen-source ratio, agar and trace nutrients. Approximately 10^5 spores were used per plate. Lawn inoculation supplied biomass/germ-tube data; central point inoculation supplied radial-colony data.

The paper explicitly states 35 °C for **spore preparation**. This note does not promote that preparation temperature into an authoritative growth-temperature parameter because the extracted experimental-method text does not separately establish the surface-growth incubation temperature.

## Measured versus derived

### Measured/source-tabulated

The repository record preserves the source tables for:

- germ-tube specific elongation rate;
- critical germ-tube length immediately before the first branch;
- hyphal diameter (with reported SD);
- elapsed growth time to first branch;
- dense-colony radial extension;
- distal hyphal length;
- maximum biomass density;
- observed dry-weight specific growth.

A table dash at 200 g/L for maximum biomass density is stored as `null`, not imputed.

### Source-derived

The authors fit a high-substrate inhibition relation, reporting `mu_max = 0.30 ± 0.035 h^-1` and `K_i = 132 ± 52 g/L` for this context. They also compared a morphometric first-order relation,

`mu_calc = u_r ln(2) / [L_av ln(L_av / D_h)]`,

against dry-weight growth and found it close to the observed rates in their data.

Petra may use those relations as **validation equations for this evidence pack**. They are not automatically a complete runtime law.

## What is still UNBOUND

A scientifically honest executable fungal model still needs source-compatible authority for:

1. **glucose transport** in the selected agar/dish geometry;
2. **glucose uptake** by active fungal biomass/tips;
3. **biomass yield / maintenance** linking glucose depletion to dry biomass;
4. **dense-colony branching dynamics** rather than a decorative random tree;
5. a mapping between conserved/accumulated fungal biomass and a replay-critical **hyphal network/tip state**;
6. any three-dimensional thickness/vertical growth claim.

Favela-Torres et al. (1998), DOI `10.1016/S0032-9592(97)00032-0`, is useful negative/contextual evidence: the same strain had different growth behavior in agar-surface, submerged, and solid-state systems. Petra must not pool those values as if culture format were irrelevant.

## Proposed future authoritative state boundary

For #615, the safest target architecture is:

- a scalar physical-resource field **only after** the glucose context is actually bound;
- a fungal biomass channel for mass/resource accounting;
- an append-only or otherwise deterministic hyphal network/tip representation sufficient to express extension and branching;
- replay-critical tip/network state separate from presentation geometry;
- step-local derived observations for radial-front speed, tip extension, branch events, biomass growth, and resource uptake.

Renderer-facing density, contours, glow, merged silhouettes and sparse representative hyphae remain presentation. Blob/contour merging can reduce visual-object count and make adjacent high-density regions appear continuous, but it must not merge biological lineages or network topology.

## Validation plan

An eventual implementation should reproduce source-level observables under source-compatible conditions, not merely “look fungal”:

- direction/magnitude of radial-extension changes across the glucose series;
- germ-tube elongation and first-branch length/time bands;
- dense-colony distal-length ranges;
- observed dry-weight specific-growth values;
- maximum biomass-density behavior where reported.

Until the missing resource/branch authorities are resolved, #556 research remains ON and #615 should stay blocked from science-labelled fungal execution.

## References

- Larralde-Corona CP, López-Isunza F, Viniegra-González G. *Morphometric evaluation of the specific growth rate of Aspergillus niger grown in agar plates at high glucose levels.* Biotechnol Bioeng. 1997;56(3):287–294. DOI `10.1002/(SICI)1097-0290(19971105)56:3<287::AID-BIT6>3.0.CO;2-F`.
- Favela-Torres E, Córdova J, García-Rivero M, Gutiérrez-Rojas M. *Kinetics of growth of Aspergillus niger during submerged, agar surface and solid state fermentations.* Process Biochemistry. 1998;33(2):103–107. DOI `10.1016/S0032-9592(97)00032-0`.
