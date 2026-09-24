# Petra Architecture / Product Decisions

This file records durable decisions that multiple workstreams need to know. It is not a diary; supersede decisions explicitly when evidence changes.

## D-001 — Mechanistic authority, learned acceleration
**Decision:** Petra's canonical biological path is explicit/mechanistic. Learned models may emulate or explain it only within a validated envelope.

**Why:** inspectability, reproducibility, scientific defense and meaningful ML evaluation.

## D-002 — Hybrid spatial cohort model
**Decision:** represent the dish as continuous scalar fields plus local lineage/population cohorts. Do not simulate one JavaScript agent per physical cell.

**Why:** biologically relevant population sizes are enormous; the educational mechanisms of interest can be preserved with spatial aggregate state and stochastic rare events.

## D-003 — Flagship is E. coli + ciprofloxacin
**Decision:** first authoritative scenario uses the strongest current evidence stack rather than maximizing breadth.

**Why:** Regoes pharmacodynamics + Marcusson genotype MIC/fitness + Huseby mutation supply + Shao spatial growth + Baym spatial evolution give a coherent defendable story.

## D-004 — TypeScript worker first; Rust/WASM is earned
**Decision:** implement the first authoritative engine in TypeScript in a Web Worker. Preserve a backend-neutral protocol/state boundary. Migrate stable hot kernels to Rust/WASM only after profiling or native batch-sweep requirements establish value.

**Why:** this preserves speed of iteration and debuggability without closing the door on a high-performance/native backend.

## D-005 — Pixi/WebGL live dish, optional Three.js
**Decision:** the live simulator is a 2D/2.5D visualization and should default to PixiJS/WebGL or equivalent. Use Three.js only for information-rich 3D explanatory scenes.

**Why:** rendering technology should fit the scientific state rather than become a spectacle tax.

## D-006 — Original science-edutainment visual identity
**Decision:** pursue vibrant geometric editorial science-animation quality, semantic zoom and causal motion, while keeping assets, characters, exact palette and compositions original to Petra.

## D-007 — Provenance is product UI
**Decision:** Sources/Assumptions/Why? is a first-class user surface, not an appendix.

## D-008 — 72-hour plan is sequencing, not scope ceiling
**Decision:** competition time pressure determines which vertical slice lands first; it does not redefine the intended architecture or product quality.

## D-009 — Fork/compare is a core differentiator
**Decision:** state branching after the flagship is high-priority. Users should be able to ask counterfactual questions by forking one exact state and applying different interventions.

## D-010 — No universal environmental slider
**Decision:** temperature, pH, phage, HGT and additional species enter Science Mode only through named parameterized systems with explicit evidence and validity ranges.

## D-011 — Compose ciprofloxacin as a PD decrement loss channel
**Decision:** for flagship policy `reference_pd_decrement_as_first_order_loss_v1`, convert the genotype-shifted Regoes decrement relative to `psi_max` into a non-negative first-order ecology loss hazard. Keep resource-limited division as a separate positive channel.

**Why:** this avoids double-counting the source PD baseline, preserves zero-drug behavior, makes the cross-study seam inspectable, and keeps mutation tied to division rather than antibiotic exposure. Regoes `psi_max` and Petra's Monod `mu_max` remain distinct until explicitly calibrated.
