# Release scientific identity

Issue #561 freezes one exact expo scientific identity only after the flagship runtime, scenario, intervention protocol, and release build stop moving. This module prepares that freeze without prematurely choosing a release seed or commit.

`buildFlagshipReleaseScientificIdentity(...)` derives a release record from the existing flagship composition boundary. It does not introduce a second replay or provenance authority.

The record contains:

- the exact Git source commit supplied by the release operator;
- the current composed `RunIdentity`, including engine/protocol/scenario/parameter-set versions and provenance-owned configuration fingerprint;
- a canonical projection of the exact accepted flagship initial resource/lineage state;
- the canonical ecology execution-profile identity;
- the canonical resource-context identity, including its provenance and explicit model-resource limitations;
- the existing exact-match replay compatibility policy.

## Why accepted run-state initialization is explicit

The flagship deliberately keeps initial model-resource level and founder placement/biomass outside the mechanism parameter-set fingerprint. Those inputs also enter authoritative Float32 storage: resource and biomass literals can round to the same stored value, and multiple inocula for one lineage/cell can accumulate to the same cohort.

The release record therefore reconstructs `runInitialization` from the accepted composed configuration rather than serializing raw caller inputs. It emits one resource level plus one non-zero lineage/cell cohort in canonical lineage/cell order. Equivalent raw aliases produce the same `runInitializationIdentity`; a genuinely different accepted state changes it.

This identity is deterministic regression/release identity, not a cryptographic authenticity proof.

## Release boundary

This record is preparation, not the final freeze. Completing #561 still requires selecting the exact release commit and demo initialization/seed, recording the generated identity, verifying saved replay/checkpoint compatibility, and auditing every visible scientific claim, unit, source, limitation, warning, and disabled/unbound control against the exact built product.

Changing any release-record field after freeze requires a new release identity review. Do not rewrite an old frozen record to match a newer build.
