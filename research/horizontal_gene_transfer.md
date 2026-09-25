# Plasmids and horizontal gene transfer — evidence note

## Mechanism
Conjugative plasmids can transfer resistance/adaptive genes horizontally. Persistence of plasmids reflects both vertical fitness effects and horizontal transfer.

## Modeling cautions
A simple mass-action term `gamma * donor * recipient` is useful at low density, but transfer is not universally proportional to density across all regimes.

Evidence:
- “Conjugation dynamics depend on both the plasmid acquisition cost and the fitness cost” (2021), DOI `10.15252/msb.20209913`: newly formed transconjugants can have a transient acquisition cost distinct from steady plasmid fitness cost.
- “Encounter Rates and Engagement Times Limit the Transmission of Conjugative Plasmids,” DOI `10.1371/journal.pgen.1011560`: density-dependent encounter behavior can saturate because successful mating requires engagement time, motivating a Holling type-II-like local transfer law at high density.
- Spatial plasmid models (e.g. DOI `10.1099/MIC.0.2006/004531-0`) show why well-mixed mass-action assumptions can miss persistence/spread in structured communities.

## Petra design
A science preset identifies:
- plasmid;
- donor/recipient host;
- transfer law and parameters;
- plasmid fitness effect;
- acquisition lag/cost if represented;
- segregation/loss if represented;
- resistance phenotype conferred.

No generic “HGT rate” should be presented as species-independent.


## R388 surface-density calibration boundary (2026-09-25)

### Decision

**Research flag for the source-law area interpretation: OFF.**

The first Petra HGT validation target is the R388 conjugation system measured by Rodriguez-Grande et al. 2025 (DOI `10.1371/journal.pgen.1011560`). The source provides enough information to bind the **source assay's physical mating area and areal recipient-density units**. It does **not** provide a mapping from Petra's existing `model-biomass` or the flagship's effective mutation-supply `cell-equivalent` to physical cells.

Petra may therefore prepare a source-assay HGT validation scenario with explicit discrete donor/recipient counts and an explicit source-assay area. A production HGT scenario coupled to general ecology remains fail-closed until it owns a physical population-count bridge.

### Exact source system

For the R388 density-law fit used by the candidate pack:

- host background: isogenic *Escherichia coli* BW27783 donor/recipient derivatives;
- plasmid: R388 (PTU-W);
- medium/context: solid LB agar;
- temperature: 37 °C;
- short density-sweep mating: 1 h;
- donor:recipient density-sweep ratio: 1:100;
- observable: transconjugants per donor, `T/D`;
- source model: Holling type-II conjugation response;
- fitted encounter rate: `K_on = 90 µm² h^-1` (95% CI 45–130);
- fitted engagement time: `tau = 0.33 h` (95% CI 0.25–0.4);
- reported density-to-frequency limitation transition: approximately `0.02–0.05 cells/µm²`.

These values are source-context-specific, not universal plasmid-transfer parameters.

### Physical mating-area authority

The density-sweep methods deposit 100 µL of serially diluted mating mixture onto a 10 cm LB-agar Petri plate. The source calculates Petri-plate cell density by dividing recovered cell counts by a reported **58 cm² mating surface**.

For Petra source-law validation only:

```
source_mating_area = 58 cm²
                   = 5.8e9 µm²
```

The conversion is a unit identity (`1 cm² = 1e8 µm²`), not a fitted biological parameter.

A uniform computational tessellation may assign

```
patch_area_um2 = 5.8e9 / in_mask_patch_count
recipient_density_cells_per_um2 = recipient_count_in_patch / patch_area_um2
```

only in a versioned source-assay scenario whose whole numerical mask explicitly represents that 58 cm² source mating surface. This is numerical discretization of the source assay, not a universal physical size for Petra's dish, camera/pixel geometry, or authority for a different culture format.

The paper separately reports a 2 cm² density denominator for 24-well surface assays. Do not substitute the 2 cm² and 58 cm² geometries: the R388 density-sweep fit in Fig. 1/Table 1 is tied to the Petri-plate density-sweep context.

### Population-count boundary

Issue #796 deliberately defines the current flagship's candidate `cell-equivalent` scale as an **effective mutation-supply calibration**. It explicitly does not claim physical CFU, cell mass, volume, or areal density.

Therefore:

- do **not** divide #796 effective cell-equivalents by physical area and call the result `cells/µm²`;
- do **not** infer HGT recipient density from continuous `model-biomass`;
- do **not** infer physical cells from renderer glyphs, opacity, density textures, pixels, or colony contours;
- HGT evaluation requiring `cells/µm²` must fail closed when exact physical discrete-count authority is absent.

This is a dimensional-authority requirement, not a numerical preference.

### Two-stage implementation handoff

#### Stage A — source-law validation fixture

A future #552/#983 validation helper may reproduce the R388 law without waiting for the flagship ecology to become physical if it owns explicit source-assay counts directly:

1. bind `58 cm²` / `5.8e9 µm²` as the source assay area;
2. initialize exact donor and recipient integer counts/densities for the source-like sweep;
3. keep short-time growth disabled or independently source-matched so the validation observable remains the source's short mating regime;
4. evaluate the exact R388 `K_on` / `tau` law;
5. compare `T/D` across a source-like density sweep spanning the reported transition region;
6. preserve deterministic RNG/checkpoint/replay plus zero-donor, zero-recipient, and zero-transfer controls.

This fixture validates the implemented conjugation law and units. It does not make Petra's flagship biomass physical.

#### Stage B — production spatial HGT coupled to ecology

A general spatial HGT scenario must additionally own a versioned physical population bridge sufficient to produce actual donor/recipient counts per physical patch from authoritative biological state. That bridge must state:

- what one discrete count means;
- how counts couple to any continuous biomass/growth state;
- physical domain area and patch-area mapping;
- validity context and uncertainty;
- configuration/fingerprint identity;
- fail-closed OOD behavior.

Until that exists, production HGT coupled to the current model-biomass ecology remains unavailable.

### Validation / OOD rules

Source-like validation should include the exact R388 `K_on` and `tau` identity and confidence intervals, BW27783/R388/LB-agar/37 °C context, exact 58 cm² area identity, density sweep around the reported transition, source-defined `T/D`, replay/checkpoint parity, transfer-opportunity bounds, and refusal when physical area or counts are missing.

Treat MG1655 flagship ecology, a different plate/well area, liquid culture, different medium/temperature, long growth-dominated experiments, renderer-derived contact, other plasmids/hosts, and unsupported antibiotic phenotypes as OOD unless separately sourced/calibrated.

### Product/render boundary

HGT source-law state belongs to simulation/checkpoint authority. Renderers may later visualize accepted donor/recipient/transconjugant or transfer-event authority, but pixels, camera zoom, glyph counts, colony masses, or visible overlap never determine conjugation probability or physical density.
