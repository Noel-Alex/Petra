# Release scientific identity

Issue #561 freezes one exact expo scientific identity only after the flagship runtime, scenario, and intervention protocol stop moving. This module prepares that freeze without prematurely choosing a release seed or commit.

`buildFlagshipReleaseScientificIdentity(...)` derives a release record from the existing flagship composition boundary. It does not introduce a second replay or provenance authority.

The record contains:

- the exact Git source commit supplied by the release operator;
- the current composed `RunIdentity`, including engine/protocol/scenario/parameter-set versions and provenance-owned configuration fingerprint;
- the exact flagship run-state initialization used for the release run;
- the canonical ecology execution-profile identity;
- the canonical resource-context identity, including its provenance and explicit model-resource limitations;
- the existing exact-match replay compatibility policy.

## Why run-state initialization is explicit

The flagship deliberately keeps initial model-resource level and founder placement/biomass outside the mechanism parameter-set fingerprint. Two runs can therefore have the same mechanism/run identity and seed while starting from different authoritative biological state.

The release record preserves an exact `runInitializationIdentity` so the final expo freeze cannot silently change those engineering run-state choices.

## Release boundary

This record is preparation, not the final freeze. Completing #561 still requires selecting the exact release commit and demo initialization/seed, recording the generated identity, verifying saved replay/checkpoint compatibility, and auditing every visible scientific claim, unit, source, limitation, warning, and disabled/unbound control against the exact built product.

Changing any release-record field after freeze requires a new release identity review. Do not rewrite an old frozen record to match a newer build.
