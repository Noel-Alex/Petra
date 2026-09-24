# Provenance presentation DOX contract

## Purpose
Own framework-neutral presentation of authoritative scientific/source provenance for Petra UI surfaces.

## Authority boundary
- `model.ts` owns evidence-class badge semantics, required disclosures, accessibility tokens, and `needs-provenance` rules.
- `scenarioAdapter.ts` may normalize only an **explicit** record classification through `normalizeEvidenceClass`; it must never infer evidence class from a citation/DOI, paper count, field name, confidence tier, color, or apparent scientific plausibility.
- Source keys are authoritative references into the active scenario citation map. Missing keys/titles remain visible problems; do not manufacture labels or substitute a nearby paper.
- Scenario-wide transfer assumptions remain scenario-wide disclosures unless the data layer explicitly links one to a particular parameter/mechanism. UI adapters must not silently turn a general assumption into a field-specific transfer note.
- Unknown domain classifications (for example a mutation-target provenance vocabulary not represented by `EvidenceClass`) remain `needs-provenance` until the science/data layer defines the mapping.
- React components consume resolved presentations/resolutions; they do not implement parallel classification logic.
- Scenario-facing provenance record IDs and labels are stable presentation identity: adapters require trimmed non-empty strings **before** resolving evidence completeness. Missing/unsupported scientific classification may yield `needs-provenance`, but malformed record identity is a caller/schema error and must not enter filtering or React list rendering.
- A presented provenance collection must contain each stable record ID exactly once. `filterProvenanceRecords()` validates collection identity before search/evidence filtering so duplicate complete/incomplete records cannot reach React with one scientific identity, and valid input order is preserved.
- Normalized science/data records may carry nested `provenance`; when present it is the sole presentation-provenance authority. Top-level domain classifications (for example mutation target classes) remain scientific metadata and must not be reinterpreted as UI evidence classes.
- Malformed nested provenance must fail visibly; adapters must not fall back to a convenient top-level classification or source guess.
- `ProvenancePanel.tsx` may display authoritative declared sources even when classification is incomplete, but it must not convert those sources into an evidence badge.
- Shared icon geometry comes from `src/ui/icons/spec.ts` via the thin `PetraIcon.tsx` adapter; provenance components must not invent a second icon vocabulary.
- Actionable external source links may be projected only from explicit authoritative citation locators. DOI fields resolve through `https://doi.org/<doi>`; explicit `http://`/`https://` citation URLs may be linked directly. Never synthesize a URL from source title, citation key, evidence class, confidence, or paper count.
- Unsupported/unsafe citation URL schemes remain visible as non-actionable locator text and a provenance problem; presentation code must never emit them as `href` values. External source links open separately so evidence drill-down does not replace the running expo surface.

## Accessibility
- Critical evidence meaning uses text labels plus icon and **visibly distinct** non-color pattern tokens; `data-pattern` metadata alone is not sufficient without a rendered pattern treatment.
- `needs-provenance` must be visible in text and must not degrade into a reassuring neutral badge.
- Sources/assumptions panels must remain keyboard/focus operable; motion is presentation-only.
- `ProvenancePanel.tsx` owns exactly one stable polite + atomic live region for provenance record/filter count updates. Visible header and filter summaries remain ordinary readable text, not competing announcement regions; authoritative record-set and filter changes collapse into one bounded announcement.
- Search typing keeps visible filtering immediate but defers the spoken result summary through `announcementCadence.ts`; newer keystrokes replace the pending summary. Evidence-filter changes, Clear, and semantic authoritative record-set changes cancel pending query speech and update the same live region immediately. Announcement timing is presentation-only and never evidence/scientific authority.
- `ProvenancePanel.tsx` always exposes Petra's product-scope disclaimer as ordinary readable text: educational/research simulation, not a clinical dosing or treatment tool, and not patient-specific medical guidance. Filtering, empty-record states, and motion modes must not hide it or move it into a live region.
- Provenance action controls consume the already-resolved app `MotionPreference` through Petra shared action adapters. Filtering/reset remains presentation-only; provenance components must not query OS motion locally or invent interaction timing.
- Judge-facing provenance search/select/action controls keep a minimum interactive block size of `2.75rem` (44px at Petra's default root size) without fixed widths that break the narrow Sources drawer. Native search/select semantics remain native.

## Discovery and filtering
- Search/evidence filters are presentation-only discoverability aids; they must never rewrite evidence class, source metadata, or scientific status.
- Records in `needs-provenance` state remain visible regardless of search/evidence filters. A filter may narrow complete records, but it must not accidentally conceal missing/invalid provenance.
- Search may index resolved labels, sources, context/details, disclosures, and explicit classifications already present in the resolution. It must not infer relevance from unstated scientific relationships.
- Filter result counts should state when complete records are hidden and when incomplete records were retained by the safety rule.

## Verification
Deterministic tests cover explicit-class normalization, missing/unknown classifications, citation resolution, missing citation records, duplicate collection-identity rejection, stable source order, incomplete-record safety pinning, announcement debounce/cancellation lifecycle, and separation of scenario assumptions from field claims. Browser/focus/visual QA is a manual local evidence gate; Petra has no hosted CI.


## Scenario validation evidence presentation
- `validationStatus.ts` and `ValidationStatusPanel.tsx` consume only explicit caller-supplied validation evidence. They must not infer validation from citation count, provenance completeness, Science Mode maturity, neighboring evidence lanes, source-test presence, or UI appearance.
- Numerical, component-science, composed-scenario, browser/product, and demonstration evidence remain separate lanes. Petra must never flatten them into one universal “validated” score, badge, or overall pass.
- Evidence kind remains explicit: source tests, scientific comparisons, local experiments, browser rehearsals, manual review, and demonstration evidence are not interchangeable.
- Passed/partial/failed claims require an explicit evidence locator. Blocked claims require an explicit blocker. Missing lanes remain visibly empty instead of being interpreted as passed or not applicable.
- Validation-status color is reinforcement only. Visible status text, lane identity, evidence kind, locator/blocker text, and source ordering must preserve meaning without color.
- This surface is presentation-only: it does not execute experiments, change scenario admission, promote evidence maturity, or alter simulation/renderer authority.
