# T4 / E. coli MG1655 phage science pack research gate

## Decision

Petra's first scientifically labelled lytic-phage pack should use:

- **phage:** bacteriophage T4, DSM 4505;
- **host:** *Escherichia coli* K-12 MG1655, DSM 18039;
- **life-history calibration context:** low-salt LB (10 g/L tryptone, 5 g/L NaCl, 5 g/L yeast extract, pH 7), aerobic continuous culture, 37 °C;
- **primary calibration source:** Nabergoj, Modic & Podgornik, *MicrobiologyOpen* 2018, DOI 10.1002/mbo3.558.

This pair is preferred over transferring the older T4/*E. coli* B/r or T7/BL21 measurements because it preserves the MG1655 host background already used by Petra's flagship resistance scenario.

## What is directly measured

Nabergoj et al. measured T4 adsorption constant, latent period, and burst size at eight steady-state MG1655 growth rates. Three chemostat experiments were performed at each rate; values below are mean ± SD.

| MG1655 specific growth rate (h^-1) | adsorption constant (10^-9 mL min^-1) | latent period (min) | burst size (PFU cell^-1) |
|---:|---:|---:|---:|
| 0.06 | 2.60 ± 0.24 | 80 ± 4 | 8 ± 2 |
| 0.13 | 2.00 ± 0.12 | 60 ± 4 | 13 ± 3 |
| 0.26 | 1.10 ± 0.19 | 41 ± 1 | 20 ± 5 |
| 0.50 | 0.81 ± 0.04 | 36 ± 4 | 33 ± 6 |
| 0.60 | 0.53 ± 0.04 | 31 ± 3 | 59 ± 3 |
| 0.73 | 0.42 ± 0.07 | 29 ± 3 | 66 ± 7 |
| 0.82 | 0.50 ± 0.05 | 27 ± 1 | 75 ± 4 |
| 0.98 | 0.52 ± 0.04 | 27 ± 1 | 89 ± 4 |

The source also reports fitted growth-rate relationships, but Petra should treat the measured table as the primary evidence object. A table interpolation is a **derived engineering interpolation**, not a new measurement.

## Authority and transfer boundary

The source's dilution rate equals the steady-state bacterial specific growth rate in its chemostat. Petra's spatial dish is not a homogeneous chemostat.

Therefore:

1. the table rows above are **measured** in the named source context;
2. mapping a local Petra growth rate to this table is a **transferred mechanistic approximation**;
3. Science Mode must not silently use the table outside the measured 0.06–0.98 h^-1 range;
4. values outside that range should be marked out-of-domain rather than extrapolated as if measured;
5. if an implementation uses piecewise interpolation between rows, provenance must say derived/interpolated;
6. if an implementation instead uses the paper's fitted equations, the exact published equations and coefficients must be transcribed and regression-tested against the reported table before promotion.

### Adsorption unit bridge

The adsorption constant has volume/time units. It only becomes an infection hazard after combining compatible bacterial and free-phage concentration units. Petra must not multiply it directly by dimensionless renderer density, normalized biomass, or an arbitrary local grid value.

A simulation implementation therefore needs an explicit population/concentration unit bridge before this measured adsorption constant can become Science-Mode authority.

### Adsorption to productive infection

The Nabergoj adsorption assay estimates adsorption from loss of free phage after adding T4 to MG1655. Its protocol then kills bacterial cells (thereby removing infected cells) before free-phage titration. That directly supports an adsorption constant, but it does **not** estimate the probability that one adsorbed PFU produces a productive infected host.

A targeted review for #491 did not identify a compatible productive-entry efficiency measurement for the exact T4 DSM 4505 / MG1655 DSM 18039 calibration pair. Petra must therefore not invent or relabel such a probability as measured.

For the first executable phage composition, Petra adopts one deliberately narrow **mechanistic approximation**:

- adsorption is resolved against the authoritative pre-step susceptible-host pool;
- the caller supplies an authoritative **discrete safe-integer** susceptible-host opportunity count; renderer glyphs and continuous biomass/cell-equivalents are not rounded into host counts here;
- each adsorbed PFU is assigned to one distinct susceptible host until that discrete pool is exhausted;
- therefore `productiveInfections = min(adsorbedPfu, susceptibleHostOpportunities)`;
- adsorption beyond that bound is non-productive for infection bookkeeping;
- an already infected host cannot create a second latent cohort under this policy; superinfection has no productive effect;
- lysis from without and other high-MOI mechanisms remain OFF until separately sourced;
- the complete policy identity is replay/configuration-critical once enabled in composed checkpoints.

This is a **single-hit unique-host closure**, not a measured infection-efficiency law. It is intentionally optimistic about unique-host assignment at high multiplicity because it does not sample phage-to-host occupancy collisions. General lytic-phage models sometimes make the same style of one-infection-per-cell/all-adsorbed-phage-productively-infect assumption explicitly (for example Mudgal et al. 2006, DOI `10.1128/AEM.02429-05`); that paper is modeling precedent, **not** T4/MG1655 parameter evidence. If compatible target-pair entry-efficiency or multiplicity data are later enabled, they require a new versioned policy rather than silently changing this one.

**#491 research flag: OFF.** The evidence question needed for this bounded policy is resolved; broad phage research should not continue unless a new concrete mechanism requires it.

## Host-state dependence

The selected source directly shows strong host-growth dependence:

- latent period shortens from about 80 min at 0.06 h^-1 to about 27 min at high tested growth rates;
- burst size rises from about 8 to 89 PFU per infected cell across the tested range;
- adsorption also changes with growth rate and is not safely represented by one universal constant.

Hadas et al. 1997 (DOI 10.1099/00221287-143-1-179) independently established T4 host-physiology dependence in *E. coli* B/r. That study is corroborating mechanism evidence, not the numeric MG1655 preset.

You, Suthers & Yin 2002 (DOI 10.1128/JB.184.7.1888-1894.2002) similarly demonstrated host-growth dependence for T7 on *E. coli* BL21, including decreasing eclipse time and increasing intracellular rise rate. It is useful comparative mechanism evidence but must not supply T4/MG1655 parameter values.

## Parameters intentionally not bound

### Eclipse time

The selected MG1655/T4 source reports **latent period**, not a separately measured eclipse-time table. Petra must not invent an eclipse fraction of the latent period.

If the first engine uses infected transit compartments, their total mean delay may represent the measured latent period. Any internal split into eclipse/assembly stages is experimental until separately sourced.

### Free-phage loss

Nabergoj et al. set the free-phage death/loss term to zero in their population-growth calculation, citing long-term T4-like phage stability. That is a modeling assumption for their controlled context, not evidence that free T4 loss is universally zero in Petra's spatial environment.

Science Mode default free-phage decay remains **UNBOUND**. The 0.5% agarose transport calibration below does not provide a compatible environmental loss constant, and Nabergoj's zero-loss model term is not promoted to one.

### Spatial diffusion

T4 transport is strongly matrix-dependent and was not measured in the selected chemostat study.

Useful external transport anchors are:

- Hu, Miyanaga & Tanji 2010, DOI 10.1002/btpr.447: apparent T4 diffusion about 2.8e-11 m^2/s in water through filter paper;
- Hu, Miyanaga & Tanji 2012, DOI 10.1002/btpr.742: apparent T4 diffusion about 4.2e-12 m^2/s through 0.5% agarose without host cells and 2.4e-12 m^2/s through 0.5% agarose containing dead *E. coli* K-12 cells.

Petra now selects a deliberately narrow transport calibration context: **0.5% agarose with no embedded host cells**, using the Hu et al. 2012 measured apparent coefficient `4.2e-12 m^2/s` as a **transferred extracellular baseline**. The source measurement is an agarose-gel-membrane experiment, not Petra's 2-D dish itself, so the Petra use is transferred rather than measured-in-scenario.

The `2.4e-12 m^2/s` measurement with dead *E. coli* K-12 embedded is retained as evidence that adsorption can reduce apparent transport, but it is **not** used as a living-host diffusion coefficient. Hu et al. explicitly report that adsorption by dead host cells slowed apparent diffusion; living hosts add adsorption and proliferation, so that regime is outside this calibration.

OOD rule: other agarose concentrations, liquid media, living/dead host-bearing regions, and other matrices must refuse this calibration until separately measured or explicitly calibrated. The `2.8e-11 m^2/s` water/filter-paper value remains a comparison anchor only.

## Implementation handoff

The life-history research gate is now sufficiently specific to implement a bounded T4/MG1655 module without generic phage constants.

An implementation may proceed if it:

- represents free phage and infected hosts as authoritative simulation state;
- consumes the measured growth-rate table with explicit interpolation/OOD provenance;
- preserves a latent delay rather than immediate burst;
- uses the measured burst-size dependence rather than a fixed decorative burst;
- does not activate measured adsorption until state units support mL-compatible host/phage concentration semantics;
- uses the selected `4.2e-12 m^2/s` transport value only for the exact 0.5% host-free agarose context, labelled transferred, and refuses host-bearing/other-matrix extrapolation;
- keeps free-phage decay visibly unbound until a compatible environmental-loss calibration lands;
- validates no-host, no-phage, zero-adsorption, and latent-delay invariants;
- exposes T4 DSM 4505 / MG1655 DSM 18039 and source context in Sources/Assumptions UI.

## Promotion status

**Life-history science pack: READY FOR IMPLEMENTATION WITH TRANSFER LABEL.**

**Host-free 0.5% agarose spatial transport baseline: READY AS A TRANSFERRED CALIBRATION.**

**Living-host transport and general free-phage loss: NOT YET READY FOR SCIENCE-MODE PHYSICAL CLAIMS.**

Do not reopen broad T4-vs-T7 selection research unless new evidence creates a concrete incompatibility with the MG1655/T4 pack above.
