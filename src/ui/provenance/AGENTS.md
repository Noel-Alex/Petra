# Provenance UI DOX contract

## Purpose

Judge/student-facing presentation of scientific provenance supplied by data, science, and runtime authority layers.

## Authority boundary

- `model.ts` owns evidence-class presentation semantics.
- `authoritative.ts` may map explicit authority-layer fields into the presentation contract, but it must never infer evidence class from DOI presence, paper count, evidence tier, color, confidence text, or UI context.
- Missing or unsupported evidence class remains a visible incomplete state.
- React components in this subtree present provenance only; they never rewrite scenario parameters, claim classifications, citations, or runtime science.

## Composition honesty

- Transferred + mechanistic approximation remains visibly multi-part.
- Cross-study seams, transfer assumptions, calibration notes, transformations, uncertainty, and limitations stay visible when supplied.
- Engineering and visual-only records must remain distinguishable from biological measurements.
- Source locators are presentation metadata; a source link/DOI does not itself establish an evidence class.

## Accessibility and motion

- Critical classification always has text plus a non-color geometric/pattern cue.
- The record list and search are keyboard operable with visible focus.
- Reduced/off motion keeps all scientific text, warnings, badges, and source detail.
- Motion timing is presentation-only and comes from shared Petra motion policy/tokens.

## Integration

- Prefer passing already-resolved authoritative records into `ProvenancePanel`.
- App/runtime adapters should keep source/citation lookup outside the visual component and provide stable record ids.
- Do not make this subtree depend on Pixi or simulation internals.

## Verification

Deterministic adapters require unit tests. Browser focus, responsive layout, screenshots, and visual contrast remain local browser QA evidence rather than source-test claims.
