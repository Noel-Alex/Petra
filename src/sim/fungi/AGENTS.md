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

- Fungal checkpoints are immutable scientific authority. Validation rejects identity, source-treatment, geometry, time, or radius drift rather than repairing it.
- Renderer/UI consumers may project physical front/radius state and separately approved presentation identity, but presentation strokes, contours, merged blobs, opacity, camera/LOD state, or renderer caches never feed back into fungal biology.
- A future mature network model is a new/versioned mechanism. Do not silently reinterpret the current surface-front checkpoint as a literal hyphal graph.

## Runtime integration envelope

- `runtimeAuthority.ts` is the preparatory #1005 replay/configuration boundary for admitting a supported fungal mechanism into composed runtime authority later. Its v1 modes are explicit `disabled` or the exact existing *A. niger* no. 10 source-validation front model; it is not a generic fungus plugin.
- The runtime authority identity binds mechanism version, exact source pack, taxon/content revision, fixed source treatment, and explicit physical unit/meaning strings. Changing any of those requires a different identity before a checkpoint may be restored.
- The runtime checkpoint envelope owns no stepping, RNG, resource law, bacteria↔fungus interaction, Worker branch identity, or accepted-command position yet. Wrapping a standalone fungal checkpoint therefore does **not** make it part of a composed runtime transaction.
- Disabled authority must carry null fungal state. Enabled authority may wrap only an exact validated `AspergillusNo10SurfaceCheckpoint` matching its configured treatment and biological identity; serialized unknown fields fail closed so renderer hints or unsourced resource coefficients cannot enter replay authority.
- Future composed integration must bind `fungalRuntimeAuthorityConfigurationIdentity(...)` into the composed configuration fingerprint and publish fungal state atomically with accepted runtime state. It must not externally stamp branch/checkpoint identity onto standalone source-validation data.
- Physical glucose/resource stepping remains blocked on #974. No runtime integration may relabel E. coli `model-resource`, guess yield/uptake/diffusion, or enable cross-species competition to make the envelope executable.
