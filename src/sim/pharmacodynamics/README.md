# Pharmacodynamics core

This directory implements source-backed concentration-response functions and Petra's explicitly versioned composition of those responses into ecology loss. It does **not** own biological parameter selection.

## Ciprofloxacin reference response

`ciprofloxacin.ts` implements the four-parameter relation recorded from Regoes et al. (2004), DOI `10.1128/AAC.48.10.3670-3676.2004`.

For the reference *E. coli* CAB1 ciprofloxacin fit used by Petra's flagship research preset, the repository records approximately:

- `psi_max = 0.88 h^-1` in the paper's log10-density-slope convention;
- `psi_min = -6.5 h^-1`;
- `kappa = 1.1`;
- `zMIC = 0.017 µg/mL`;
- conventional MIC ≈ `0.03 µg/mL`.

The implementation keeps the source log10 rate convention explicit and provides named conversion to a natural-log population rate. Never add a log10 slope directly to a natural-log/exponential population rate.

## Genotype MIC transfer

Marcusson et al. (2009), DOI `10.1371/journal.ppat.1000541`, measured MICs and relative fitness for curated *E. coli* MG1655 resistance genotypes. Petra shifts the Regoes reference curve horizontally using:

`effective_zMIC = reference_zMIC * genotype_MIC / reference_MIC`.

This is a **transferred mechanistic approximation**. It is not evidence that every MG1655 genotype has the same measured time-kill curve shape as CAB1.

`prepareMicShiftedRegoes` performs this invariant transformation once per genotype so spatial evaluation does not rebuild the same curve parameters for every grid cell.

## Resource × drug loss policy

The versioned flagship policy is:

`reference_pd_decrement_as_first_order_loss_v1`

with

`h_drug,g(a) = ln(10) * [psi_max - psi_g(a)]`.

`composition.ts` exposes both a point response and masked per-genotype spatial hazard fields. These hazards feed the ecology kernel's first-order loss channel. At zero concentration the incremental hazard is exactly zero.

Crucially, Regoes `psi_max` is the baseline of the **source PD curve**. Petra's Monod `mu_max` remains a separate scenario-owned ecology parameter. Do not equate them unless a scenario explicitly calibrates that seam. As a result, Regoes `zMIC` remains the zero crossing of the transferred PD curve, not an automatic guarantee that the full resource-limited Petra system has zero net change at exactly the same concentration.

Applying this PD-derived loss under zero resource is a declared composition policy and sensitivity target, **not** a quantitatively calibrated stationary-phase claim.

## Chloramphenicol growth-inhibition authority

`chloramphenicol.ts` implements the Greulich et al. (2015), DOI `10.15252/MSB.20145949`, equation-7 steady-state growth response for wild-type *E. coli* K-12 MG1655. Biological fit parameters remain data-owned in `data/pharmacodynamics/chloramphenicol_mg1655_greulich_v1.json`; the evaluator carries no hidden glucose/glycerol defaults.

The response is expressed as `x = lambda / lambda0` and is admitted only on the real physical branch in `[0, 1]`. Root isolation uses the cubic derivative to bracket every possible in-range root and rejects zero or multiple physical roots rather than choosing an arbitrary branch. At zero chloramphenicol the multiplier is exactly 1.

The reviewed MOPS glycerol and glucose fit families are separate source records. Callers must select one explicit family, supply a positive drug-free growth rate for that source-compatible context, and provide chloramphenicol concentration in `uM`. An unknown family, `mg/L`, a relabelled resistant background, or non-finite/invalid input fails closed.

Chloramphenicol contributes:

- `divisionMultiplier = lambda / lambda0`;
- `incrementalLossHazardPerHour = 0`.

That zero loss means this pack authorizes no chloramphenicol killing law; it is not a universal statement about every chloramphenicol condition. CAT resistance evidence remains phenotype-only and cannot be converted into an MIC-shifted Greulich curve. The current dimensionless `model-resource` flagship is not a source-compatible MOPS binding, so product selection remains blocked by #928.

## Authority boundary

- scenario/preset data owns biological parameter values, policy version, classification, and citations;
- this module owns the deterministic PD equation, log-base conversion, MIC-ratio shift, and versioned incremental-loss transformation;
- spatial drug transport belongs to `src/sim/spatial/`;
- ecology owns resource-limited division and integrates the supplied loss hazard;
- mutation remains conditioned on reviewed division-event opportunities, never on drug concentration;
- UI/rendering may display policy/source/assumption metadata but may not alter the response.

## Verification

The repository premerge suite covers zero concentration, zMIC, high-concentration asymptote, genotype shifts, unit conversion, spatial masks, invalid fields, and resource×drug ecology composition. Run `python tools/verify.py premerge`.
