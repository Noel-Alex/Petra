# PETRA Architecture

## Recommended stack for the competition build

- React + TypeScript + Vite.
- Simulation kernel in a Web Worker.
- Flat `Float32Array` / typed arrays for fields and lineage densities.
- Seeded PRNG (PCG/xoshiro family implementation).
- Canvas/WebGL renderer; PixiJS is acceptable if it accelerates implementation.
- Lightweight charting for aggregate trajectories.

Do not add Rust/WASM to the critical path unless profiling proves TypeScript insufficient.

## Domain

Use an `N x N` square array with a circular dish mask.

Recommended default: `128 x 128`.

Fields:

- nutrient;
- drug;
- optional future phage.

Lineages:

- small metadata objects;
- one density typed array per active lineage.

This avoids per-bacterium objects and keeps dozens of lineages practical.

## Worker protocol

Main -> worker:

- `INIT`
- `INTERVENTION`
- `SET_SPEED`
- `PAUSE`
- `RESUME`
- `RESET_SEED`
- `REQUEST_SNAPSHOT`

Worker -> main:

- `FRAME`
- `METRICS`
- `EVENTS`
- `LINEAGE_CREATED`
- `SNAPSHOT`
- `ERROR`

Rendering cadence is independent from biological update cadence.

## Update loop

1. apply queued interventions;
2. diffuse nutrient;
3. diffuse drug;
4. for each lineage:
   - calculate resource/environment growth;
   - calculate drug response;
   - sample births/deaths;
   - consume nutrient;
   - sample mutations from births;
5. disperse biomass spatially;
6. enforce numerical invariants;
7. prune extinct lineages;
8. record metrics/events;
9. publish a render frame at display cadence.

## Performance rules

- no allocations in inner loops;
- double-buffer diffusion arrays;
- transferable buffers or downsampled render state;
- cap active phenotype states for the MVP;
- lineage ancestry can persist after a density field is pruned;
- profile before rewriting anything in WASM.

## Visual model

The density field is authoritative. The renderer can generate organic edges, cell glyphs, particles and pulses from the current density/growth fields, but those visuals do not alter simulation state.

## Provenance architecture

Scenario JSON should reference a parameter registry. Every parameter entry includes:

- value/range;
- unit;
- source ID;
- exact context;
- evidence tier;
- transfer/approximation note.

The same metadata powers the in-app Sources panel.
