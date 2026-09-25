# Fungal simulation authority

## Purpose

This directory owns source-constrained fungal simulation/validation state. It may consume only named fungal evidence packs whose supported subset has passed the repository's science/research gate.

## Current supported subset

`aspergillusNo10Surface.ts` is the first bounded authority for *Aspergillus niger* var. *hennebergi* no. 10 from the 1997 agar-surface evidence pack.

- The selectable condition is an **exact fixed source glucose treatment identity**: 10, 40, 70, 120, 200, or 300 g/L. These are experimental-condition labels/validation authority, not a mutable Petra glucose field.
- The point-inoculation state owns the exact 9-cm source plate, center founder, biological time, and physical colony-front radius.
- Front advance uses only the source row's measured radial-extension rate and is explicitly a **source-validation mode**, not a universal fungal growth law.
- The source morphometric equation is a validation observable. It must not be repurposed as a local biomass/resource law.
- First-branch `k/Lc/tau` rows are measured validation targets only. They do not authorize mature stochastic branch placement.

## Hard scientific boundaries

Until separately sourced, reviewed, versioned, and admitted:

- no dynamic local glucose field, diffusion, uptake, depletion, or glucose-to-biomass yield;
- no relabeling of the E. coli `model-resource` field as glucose;
- no interpolation between source glucose treatments presented as measured authority;
- no random branch probability, branch-angle/daughter-orientation law, later-order branch topology, or anastomosis;
- no temperature or pH response;
- no ciprofloxacin/antifungal response;
- no generic bacteria↔fungus attack/cooperation coefficient;
- no biomass↔literal hyphal-length conversion inferred from renderer geometry.

## Replay and rendering

- `runtimeAuthority.ts` owns the Phase-A dormant runtime/replay envelope for supported fungal mechanisms. Its current variant may name only the exact *Aspergillus* no. 10 source-validation front + exact fixed source treatment, and its canonical identity is suitable for later composed-configuration binding. The wrapper preserves the mechanism-owned physical checkpoint/observation without introducing bacterial `model-resource`, `model-biomass`, lineage-density, renderer, or interaction semantics. It deliberately does not step the mechanism or claim a shared accepted Worker transaction yet; the later composed-runtime integration must bind any observation to the exact accepted run/branch/checkpoint position and must not activate resource-aware stepping before the reviewed resource gate lands.
- Fungal checkpoints are immutable scientific authority. Validation rejects identity, source-treatment, geometry, time, or radius drift rather than repairing it.
- Renderer/UI consumers may project physical front/radius state and separately approved presentation identity, but presentation strokes, contours, merged blobs, opacity, camera/LOD state, or renderer caches never feed back into fungal biology.
- A future mature network model is a new/versioned mechanism. Do not silently reinterpret the current surface-front checkpoint as a literal hyphal graph.
