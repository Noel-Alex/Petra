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

## Accessibility
- Critical evidence meaning uses text labels plus icon and non-color pattern tokens.
- `needs-provenance` must be visible in text and must not degrade into a reassuring neutral badge.
- Sources/assumptions panels must remain keyboard/focus operable; motion is presentation-only.

## Verification
Deterministic tests cover explicit-class normalization, missing/unknown classifications, citation resolution, missing citation records, and separation of scenario assumptions from field claims. Browser/focus/visual QA is a manual local evidence gate; Petra has no hosted CI.
