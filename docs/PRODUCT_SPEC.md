# PETRA Product / Gameplay Specification

## Core promise

**Change the environment and watch evolution respond.**

The user should immediately understand that PETRA is interactive and stochastic, not a video.

## Main screen

### Center

Large circular Petri dish as the hero element.

### Environment panel

- nutrient preset;
- temperature if a calibrated model is available;
- time speed;
- seed/reset.

### Intervention panel

- ciprofloxacin paint/zone tool;
- preset MEGA-like bands;
- later: seed competitor;
- later: introduce phage.

### Bottom timeline

- total population;
- genotype/lineage frequencies;
- resistant fraction;
- nutrient remaining;
- lineage diversity.

### Lineage inspector

Click a color/sector to show:

- genotype;
- parent;
- emergence time/location;
- MIC/response shift;
- relative fitness;
- current abundance;
- source cards.

## Zoom concept

- Macro: colony density and environment overlays.
- Meso: lineage sectors / local composition.
- Micro: stylized cell glyphs sampled from density, explicitly marked as visualization.

## Strong 90-second demo

1. Load the *E. coli* / ciprofloxacin scenario.
2. Start growth and show nutrient depletion overlay.
3. Apply a spatial drug band/gradient.
4. Sensitive regions stall/collapse.
5. A rare resistant lineage emerges and expands if the stochastic trajectory permits.
6. Open lineage ancestry and source card.
7. Replay same seed to reproduce the event.
8. Change seed to show a different evolutionary history.
9. If time permits, remove pressure and show relative fitness effects.

## Challenge ideas after sandbox

- **Jackpot:** compare replicate seeds and mutation timing.
- **Cost of survival:** resistance rises under drug but loses after pressure is removed.
- **Resource war:** two strains compete for one nutrient.
- **Phage wave:** delayed lysis produces a traveling ecological shock.

## Design direction

A futuristic wet-lab instrument, not a generic dashboard:

- dark neutral background;
- luminous glass dish;
- smooth scientific overlays;
- consistent lineage colors across dish/tree/charts;
- compact evidence badges;
- organic rendering tied to actual state.

## Product rule

Animations can make the state beautiful. They cannot choose the state.
