# Scientific extension roadmap

The engine is intentionally broader than the first competition build, but extensions are admitted by evidence rather than feature count.

## 1. Persistence / tolerance
**Mechanism:** reversible slow/dormant phenotype switching distinct from inherited resistance.

Anchor: Balaban et al. 2004, DOI `10.1126/science.1099390`, where regrown persisters remain antibiotic-sensitive and persistence is associated with pre-existing phenotypic heterogeneity.

Implementation:
- normal `N` and persister `Q` compartments within a genotype;
- stochastic `N→Q` and `Q→N` switching;
- reduced growth and antibiotic killing in Q;
- genotype unchanged.

## 2. Bacteriophage
Use a named phage-host preset, not generic “virus power.”

State:
- susceptible bacteria;
- infected compartments/event queue;
- free phage field.

Processes:
- adsorption;
- latency/eclipsed development;
- burst;
- free-phage decay/diffusion;
- possible phage resistance.

Host physiology should affect phage life history where supported. T7/E. coli data: You, Suthers & Yin 2002, DOI `10.1128/JB.184.7.1888-1894.2002`. T4 physiology dependence: Hadas et al. 1997, DOI `10.1099/00221287-143-1-179`.

## 3. Plasmid horizontal gene transfer
Do not model HGT as an arbitrary chance independent of contact/density.

Baseline local conjugation:
- donor + recipient contact;
- acquisition creates transconjugant;
- plasmid carriage can change fitness and resistance;
- optional segregation/loss.

At low density, mass-action encounter models are useful; recent measurements show saturation/engagement-time effects at high density. Anchor: “Encounter Rates and Engagement Times Limit the Transmission of Conjugative Plasmids,” DOI `10.1371/journal.pgen.1011560`. Acquisition cost and long-term plasmid fitness cost can be distinct (DOI `10.15252/msb.20209913`).

Science Mode requires a named plasmid/host pair.

## 4. Collateral sensitivity / multiple drugs
Resistance to one antibiotic can alter susceptibility to others.

Anchor: Imamovic & Sommer 2013, DOI `10.1126/scitranslmed.3006609`; broader systematic maps can be used only when the exact genotype/drug context is represented.

Implementation should store a measured susceptibility matrix/transition-specific effects, not use a generic “second drug weakness” bonus.

## 5. Temperature
For suboptimal temperatures use species-specific Ratkowsky-style behavior where validated:
`sqrt(mu) = b(T - T_min)`.

For the whole range use a cardinal/extended model rather than reflecting the suboptimal line around an optimum. Anchors: Ratkowsky et al. 1982 DOI `10.1128/jb.149.1.1-5.1982`; full-range extension 1983 DOI `10.1128/JB.154.3.1222-1226.1983`.

The flagship should stay at a fixed reference temperature until E. coli-specific parameters are curated.

## 6. Multiple species / consumer-resource ecology
Start with explicit resource consumption and space. Generalized Lotka-Volterra is useful phenomenology but can hide resource-mediated mechanisms and fail outside fitted regimes.

Add multiple resource fields, resource preferences, byproducts/cross-feeding, and direct antagonism only when the scenario supports them.

## 7. Quorum sensing / biofilm state
Potential future module: density/local-signal field changes phenotype/motility/matrix production. It should be a separate calibrated mechanism, not a cosmetic threshold.

## 8. Fungi
A fungal competitor needs fungal-specific growth/morphology/resource/temperature parameters. Do not simply recolor bacterial particles and call it fungal biology.
