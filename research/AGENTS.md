# Research DOX contract

## Purpose
This subtree contains the evidence base behind Petra's biological and mathematical behavior.

## Ownership
- Primary/peer-reviewed literature synthesis.
- Claim classification and caveats.
- Parameter provenance and experimental context.
- Known disagreements, transfer assumptions, and unresolved calibration gaps.

## Local contracts
- Prefer primary experiments and original modeling papers over summaries.
- A number without units + biological context + citation is not a usable scientific parameter.
- Preserve strain/background, medium, temperature, assay/endpoint, and source.
- Distinguish measured values from values transferred between studies.
- Never convert a paper's aggregate selected mutation rate into the probability of one specific mutation edge unless the source supports that interpretation.
- Never silently merge MIC values from different assays.
- Record negative evidence and limitations, not only confirming evidence.
- New simulation mechanisms require either a source here or an explicit `hypothesis/experimental` label.
- `CLAIM_LEDGER.md` is the compact audit trail; detailed notes live in topic files.

## Work guidance
When researching a feature, answer: what mechanism is established, what equation/model is appropriate, what parameters are measured, what context they were measured in, what Petra is transferring/approximating, and how the implementation can be validated.

## Verification
Research changes are reviewed for DOI/source traceability, unit consistency, claim classification, and agreement with the parameter registry.

## Child DOX index
No child contracts yet.
