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

## Dormant composed-runtime preparation

`fungalRuntimeAuthority.ts` is the Phase-A carrier for future composed fungal authority. Schema v1 is deliberately non-executable:

- `disabled` is an exact no-op authority;
- `dormant-source-validation` may bind only the existing exact *A. niger* no. 10 taxon/content/source-pack revision and one supported fixed 1997 treatment;
- v1 runtime envelopes must keep both `acceptedComposedPosition` and `mechanismState` null. A standalone source-validation checkpoint is **not** a live composed checkpoint merely because time/taxon/treatment match;
- the canonical authority identity is fingerprint-ready input only. It is not itself a composed configuration fingerprint and does not authorize mutation of composed state;
- a future live schema must version the change and bind mechanism state plus the exact accepted composed transaction atomically. Resource-aware stepping remains blocked on the reviewed physical resource contract owned by #974.

Do not use the dormant carrier to infer glucose transport/depletion, fungal biomass, branch topology, bacteria↔fungus interactions, antifungal/drug response, or renderer state.

## Replay and rendering

- Fungal checkpoints are immutable scientific authority. Validation rejects identity, source-treatment, geometry, time, or radius drift rather than repairing it.
- Renderer/UI consumers may project physical front/radius state and separately approved presentation identity, but presentation strokes, contours, merged blobs, opacity, camera/LOD state, or renderer caches never feed back into fungal biology.
- A future mature network model is a new/versioned mechanism. Do not silently reinterpret the current surface-front checkpoint as a literal hyphal graph.
