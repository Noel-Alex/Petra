# Expo presenter UI DOX contract

## Purpose

Own Petra's optional presenter-facing cue deck for the expo runbook. This layer helps a human tell the verified story; it is never a second simulation, scheduler, or scientific event source.

## Authority boundary

- Presenter cues may focus attention on dish, controls, timeline, analysis, Sources/Assumptions, or compare surfaces.
- A target second is **pacing metadata only**. It may not advance the simulator, synthesize an event, unlock a causal cue, or be presented as biological time.
- Cues with scientific prerequisites remain locked until the caller supplies the explicit evidence gate from authoritative runtime/state.
- Presenter state is bound to one explicit authoritative run identity. Evidence for a different run is ignored, and changing the bound run clears cue progress + satisfied gates.
- Profile changes may preserve evidence only while the bound run identity remains unchanged.
- If a selected run does not produce the intended selection evidence, Presenter Mode stays blocked. The presenter may switch to another pre-selected non-special-cased seed or a saved authoritative replay; the UI must not manufacture a lineage/result.
- Presenter Mode never issues biological commands itself. Real interventions stay owned by the intervention/runtime path.
- Surface focus hints are presentation metadata. They do not grant React authority over Pixi camera/scientific state.

## Profiles

- `90-second` mirrors the primary runbook: world → growth → intervention → selection → replay → provenance.
- `3-minute` extends that same prefix with verified compare, trade-off, spatial contingency, and closing provenance beats.
- The first six cue IDs remain identical between profiles so rehearsal semantics do not fork.

## Motion

- Motion uses shared Petra policy/tokens only.
- Full mode may use a short cue-card entrance.
- Reduced mode uses bounded crossfade without spatial travel.
- Off mode is fully static.
- Scientific boundary text, evidence-gate state, cue identity, target surface, and presenter note remain visible in every mode.

## Integration

Mount Presenter Mode only after the relevant surface exists. The consumer owns evidence projection from the authoritative runtime and must bind the exact run identity before mapping only real evidence to `DemoEvidenceGate` values. Do not infer gates from animation callbacks, renderer glyphs, CSS state, or wall-clock elapsed time.

## Verification

Deterministic state tests cover profile order, gate blocking, evidence preservation and motion degradation. Server-render tests cover locked/ready semantics. Browser visual rehearsal remains #59 and end-to-end demo completion remains #11.
