# PETRA — 72-Hour Competition Plan

## Definition of done

By judging time, PETRA must let a user:

1. open a living Petri-dish interface;
2. load the flagship *E. coli* scenario;
3. run/pause/speed simulated time;
4. apply a spatial ciprofloxacin region/gradient;
5. observe local growth response;
6. see stochastic resistant lineages arise through a curated mutation graph;
7. inspect lineage genotype, MIC/fitness and sources;
8. view population/lineage graphs;
9. replay the same random seed;
10. open the science panel with equations and assumptions.

Everything else is optional.

## Day 1 — engine before polish

- React/TypeScript/Vite.
- Web Worker.
- seeded PRNG.
- circular grid.
- nutrient field + diffusion.
- one WT lineage.
- Monod growth + resource consumption.
- local spatial spread.
- total population metrics.
- diffusion/growth tests.

**Gate:** colony expands and depletes nutrient reproducibly.

## Day 2 — antibiotic + evolution

- drug field/diffusion;
- Regoes pharmacodynamic function;
- ciprofloxacin source preset;
- drug paint/band tool;
- genotype data;
- MIC/fitness;
- mutation transition graph;
- lineage creation and ancestry;
- stochastic mutation from births;
- lineage colors + live plot;
- pharmacodynamic/mutation tests.

**Gate:** resistant lineages can emerge stochastically and gain spatial advantage under the correct drug regime.

## Day 3 — competition product

First half:

- clean onboarding;
- source/provenance drawer;
- scenario presets;
- smooth rendering and zoom;
- event timeline;
- validation status;
- performance pass.

Pick **one** stretch feature only:

1. shared-resource competitor;
2. phage;
3. ML surrogate.

Competitor is the safest because it reuses the core engine.

Final hours:

- freeze parameter registry;
- save interesting demo seeds without scripting outcomes;
- test offline/no-network;
- rehearse 90-second and 3-minute demos.

## Team / AI-agent split

- Agent 1: `src/sim/**`, numerical model/tests.
- Agent 2: `src/render/**`, dish/overlays/camera.
- Agent 3: UI/charts/events/source drawer.
- Agent 4: scientific QA/provenance; it must not invent constants to unblock code.
- Integrator: owns worker message schema and merges.

## Cut first if behind

1. temperature control;
2. micro cell-glyph zoom;
3. challenge scoring;
4. competitor;
5. phage;
6. ML.

Never cut:

- seeded reproducibility;
- actual spatial nutrient/drug fields;
- mutation from divisions;
- provenance;
- scientific tests.
