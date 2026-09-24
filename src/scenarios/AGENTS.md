# Scenario discovery and Science-Mode admission DOX contract

## Purpose

This subtree owns product-neutral discovery metadata for bundled scenarios and
the fail-closed admission decision that determines whether a parsed scenario may
be presented as experimental, validated educational science, or reference
Science Mode.

## Authority

- `scienceModeAdmission.ts` is the single runtime/product admission evaluator.
  Parsing JSON, having a DOI, using a scientific title, or passing the scenario
  schema does **not** imply Science-Mode admission.
- Primary-literature status is explicit data authority through
  `scienceModeAdmission.primaryEvidenceCitationKeys`. Code must never infer
  primary evidence from DOI presence, journal names, citation count, or UI copy.
- Decisive parameter/mechanism paths are explicitly named by the scenario.
  Their records must carry explicit provenance; engineering/calibrated records
  require an explicit calibration note.
- Cross-study transfer assumptions, at least one validation target, required
  unit/context fields, and visible limitation fields are hard educational
  admission gates. Missing gates fail closed to `availability: "refused"`.
- Reference status is stricter than validated educational status. Every declared
  reference binding must match and an engineering execution profile is a
  reference blocker. Engineering model-unit values may keep an educational
  mechanism executable, but cannot become physical/reference evidence.
- Admission evidence is bound to exact scenario ID + version. Changing decisive
  scientific context, admission evidence paths, reference bindings, or the
  intended maturity requires a scenario-version review/update rather than
  silently reusing an old admission manifest.
- `registry.ts` is the bundled scenario discovery boundary. Product/Sandbox UI
  consumes its `scienceAdmission` result and the separate
  `educationalScienceSelectable` /
  `referenceScienceModeSelectable` booleans. UI code must not invent a second
  maturity classifier.

## Current flagship

`ecoli-ciprofloxacin-spatial@1.4.0-research` requests
`validated-educational` maturity. Its engineering ecology execution profile
and unbound physical limiting-resource context explicitly prevent reference
Science-Mode eligibility. Those are visible reference blockers, not errors to
paper over with a nicer badge.

## Extension rules

When adding a bundled scenario:

1. add/version the scenario data and schema-valid admission manifest;
2. explicitly name primary evidence keys and decisive evidence paths;
3. name required unit/context and limitation paths;
4. declare reference-only bindings that must be physically/calibrationally
   satisfied;
5. add it to bundled discovery;
6. add deterministic admission tests for both success and refusal/downgrade.

Do not promote a scenario merely because it executes successfully. Numerical
executability and scientific maturity are separate contracts.

## Verification

At minimum cover:

- parseable scenario without manifest is refused;
- missing primary evidence, decisive provenance/calibration, transfer
  assumptions, validation target, required unit/context, or limitation is
  refused;
- manifest/scenario identity drift is refused;
- unmet reference binding and engineering execution values prevent reference
  status;
- fully bound explicitly evidenced fixtures can achieve reference status;
- bundled discovery exposes the exact shared admission result.

Contributor: Noel-Alex
