# Data DOX contract

## Purpose
Machine-readable science and scenario configuration.

## Ownership
- Parameter records and citations.
- Scenario/preset files.
- JSON schemas and versioning.
- Validation fixtures derived from published or explicitly synthetic cases.

## Local contracts
- Values that affect simulation authority must carry units and provenance or an explicit engineering/synthetic classification.
- A preset must declare an engine/schema version and warning/usage scope.
- Do not average conflicting assays. Keep separate records and choose explicitly at scenario composition time.
- Engineering-normalized values must never be labeled physical measurements.
- Changes to a science preset require matching research/claim-ledger review.

## Work guidance
Prefer normalized IDs and source keys so UI, simulator, validation, and explanation layers resolve the same records.

## Verification
JSON must parse; schemas/presets must pass the repository verifier. Science-mode presets must contain citations for measured/transferred values.

## Child DOX index
No child contracts yet.
