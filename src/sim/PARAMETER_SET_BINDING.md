# Parameter-set configuration binding

## Purpose

A Petra run already names a parameter set by stable ID and version. For composed
biological authority, that label is not sufficient by itself: the run must also
carry the exact deterministic `composedConfigurationFingerprint(...)` that the
named parameter set is allowed to represent.

This prevents a run from claiming one provenance identity while executing a
different mechanism configuration.

## Binding record

`ComposedParameterSetBinding` is versioned replay identity with:

- binding schema version;
- authority class: `provenance` or `fixture`;
- parameter-set ID;
- parameter-set version;
- exact composed configuration fingerprint.

The outer `RunIdentity.parameterSetId` / `parameterSetVersion` and the
binding record must agree byte-for-byte. The composed engine recomputes the
configuration fingerprint before state creation and refuses initialization when
it differs from the binding.

The binding is nested inside `RunIdentity`, so checkpoints, restore/replay,
trace hashing, counterfactual ancestry, and runtime identity checks preserve the
same authority claim.

## Provenance bindings

A product-facing `authority: 'provenance'` binding is data authority. It must
come from a versioned provenance/scenario record that was created when the
parameter pack was reviewed.

Do **not** compute a provenance binding from whatever config a caller supplies at
runtime. Doing so would self-certify the input and would not prove that the
parameter-set label owns those values.

The flagship cannot publish its final provenance binding until its remaining
parameter seams (including the resource/growth binding tracked by #227) are
actually resolved and versioned.

## Fixture bindings

Tests and infrastructure experiments may derive a binding from an ad-hoc config
only through `createFixtureComposedParameterSetBinding(...)`.

Fixture IDs must use the `fixture:` namespace. A fixture binding can exercise
determinism and integration, but it is never a product/science provenance claim.

## Wire and export implications

The composed binding became required replay identity in worker protocol v4.
Synthetic infrastructure runs may still omit it.

Metadata exports that carry parameter-set identity must also preserve the
binding (or explicitly carry `null` when no composed binding exists); they must
not export only the friendly ID/version and silently drop the exact config
identity.

Contributor: Noel-Alex
