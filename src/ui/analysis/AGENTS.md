# Analysis UI DOX contract

## Purpose
`src/ui/analysis/` owns framework-neutral projection and accessible React/SVG presentation of authoritative time-series samples and lineage ancestry.

## Authority boundary
- Charts and lineage trees consume already-authoritative samples/records. They do not mutate simulation state or manufacture scientific events.
- Decimation may **select existing source points only**. Do not interpolate, smooth, average into new displayed measurements, or silently resample values.
- Chart domains are computed from the full source dataset, not only retained display points.
- Series with different units require separate charts. Never normalize unlike scientific units onto one unlabeled axis.
- SVG connecting segments are visual reading guides only; source markers remain visible and the UI must disclose that no intermediate scientific samples are invented.
- Lineage ancestry must validate parent identity, chronology, extinction timing, and cycles before layout.
- Lineage geometry is presentation-only. It cannot create ancestry, change lineage IDs, or infer genotype relationships absent from authoritative records.

## Accessibility and visual identity
- Every series is identified in visible text and by a numbered endpoint/legend marker, so hue is never the only identity channel. Dash treatment may reinforce identity but is not the sole label.
- Lineage nodes use visible lineage/genotype text plus distinct extant/extinct geometry. Status may never rely only on color.
- SVG surfaces carry accessible summary labels; detailed sample values remain available through point titles / surrounding text.
- Dense presentation may scroll or decimate existing points; it must not drop the underlying authoritative history from application state.

## Motion
- Analysis motion resolves through shared Petra motion policy/tokens only.
- Full motion may use bounded opacity/panel transitions. Reduced motion crossfades; motion-off remains static.
- Do not animate a trajectory being “drawn” through time as though wall-clock animation represents biological progression.
- Biological time is labelled explicitly in hours from authoritative sample timestamps.

## Verification
Deterministic tests cover source-point-only decimation, full-data domains, unit mismatch rejection, lineage ancestry validation/layout, reduced/off motion semantics, server-render unit/time labels, non-color series identity, lineage status geometry, and empty-authority states.

Browser visual density, focus/zoom behavior, screenshots, and performance belong to the local expo QA workflow rather than source-only claims.
