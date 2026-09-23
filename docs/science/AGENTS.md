# Science specification DOX contract

## Purpose
Turn research evidence into explicit simulation contracts without hiding transfer assumptions.

## Ownership
- Equations/state variables.
- Flagship scenario composition.
- Parameter provenance rules.
- Scientific limitations and extension boundaries.

## Local contracts
- Research evidence lives in `research/`; this subtree states what Petra implements from that evidence.
- Every equation must define units/conventions and how it composes with other mechanisms.
- Cross-study composition must be labeled as transferred/mechanistic approximation.
- Do not add a user-visible “science mode” module until its named preset has enough provenance to defend the behavior.
- Distinguish inherited genotype, reversible phenotype state, and visual representation.

## Verification
Any simulation-authority change must update the claim ledger, relevant research note, machine-readable preset/provenance, and reference/regression test plan.

## Child DOX index
No child contracts yet.
