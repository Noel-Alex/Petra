# Documentation DOX contract

## Purpose
This subtree is Petra's durable product/science/engineering specification and coordination layer.

## Ownership
- Product vision and interaction design.
- Scientific/simulation contracts derived from `research/`.
- Architecture, performance, data, validation, ML, and visual-language decisions.
- Team board and asynchronous orchestrator notes.

## Local contracts
- Specs describe intended behavior; research files justify biological claims.
- No product requirement may silently weaken scientific integrity.
- Separate **long-term target** from **competition slice**. The 72-hour plan is sequencing, not the ceiling of Petra's design.
- Architecture docs must expose authority boundaries and approximation boundaries.
- UX/visual docs must preserve progressive disclosure, accessibility, and visual-vs-simulation honesty.
- Keep decisions durable in `DECISIONS.md`; do not hide important contracts only in chat.

## Work guidance
Prefer one authoritative home per concept and cross-link rather than duplicating equations/parameters across many documents.
- Active execution plans keep their own file plus an in-file tracker, and that tracker is
  authoritative for its lane. Current lane: [`PERFORMANCE_AND_PRODUCT_PLAN.md`](PERFORMANCE_AND_PRODUCT_PLAN.md)
  (lag/long-run performance, visual fidelity to `design/ui-reference/`, organism/antimicrobial/
  nutrient content). Two standing rules from that plan: performance claims require measured
  frames — source-text assertions are not evidence — and no profiler ships without a paired fix.

## Verification
Run repository verification for changed structured data/docs when available and manually check links/contradictions in touched specs.

## Child DOX index
- `science/` — model specification, flagship scenario, provenance, limitations, and extension contracts.
