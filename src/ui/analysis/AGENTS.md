# Analysis UI DOX contract

## Purpose
`src/ui/analysis/` owns framework-neutral projection and accessible React/SVG presentation of authoritative time-series samples and lineage ancestry.

## Authority boundary
- Charts and lineage trees consume already-authoritative samples/records. They do not mutate simulation state or manufacture scientific events.
- App-shell consumers receive authoritative analysis records through the explicit `src/app/analysisView.ts` boundary. Missing authority is an unavailable state; current synthetic worker fields, Pixi snapshots, and visual demo fixtures are not valid substitutes.
- Decimation may **select existing source points only**. Do not interpolate, smooth, average into new displayed measurements, or silently resample values.
- Chart domains are computed from the full source dataset, not only retained display points.
- Biological-time axes are constrained by the authoritative non-negative time contract. Degenerate single-time domains expand deterministically without crossing below 0 h; ordinary non-degenerate source time bounds remain exact. Value axes use their own domain policy and may legitimately be signed.
- Under analysis schema v1, source sample time is strict per-series identity: timestamps must increase monotonically with no duplicates inside one series. Equal timestamps across different series remain valid. If a future authoritative source requires pre/post-event or replicate samples at one clock time, extend the versioned schema with explicit phase/sequence/replicate identity rather than relying on array order.
- Presentation must never merge, jitter, average, reorder, or silently drop duplicate-time source records merely to make them drawable.
- Series with different units require separate charts. Never normalize unlike scientific units onto one unlabeled axis.
- SVG connecting segments are visual reading guides only; source markers remain visible and the UI must disclose that no intermediate scientific samples are invented.
- Lineage ancestry must validate parent identity, chronology, extinction timing, and cycles before layout.
- Lineage geometry is presentation-only. It cannot create ancestry, change lineage IDs, or infer genotype relationships absent from authoritative records.

## Accessibility and visual identity
- Every series is identified in visible text and by a numbered endpoint/legend marker, so hue is never the only identity channel. Dash treatment may reinforce identity but is not the sole label.
- Lineage nodes use visible lineage/genotype text plus distinct extant/extinct geometry. Status may never rely only on color.
- SVG surfaces carry accessible summary labels; point titles are progressive enhancement only. Complete authoritative chart samples and lineage ancestry must also remain inspectable through a user-controlled semantic table/list outside image-like SVG geometry.
- Visual decimation may reduce SVG source markers only. The projection must preserve a separate non-lossy source-sample channel for semantic/accessibility detail; presentation budgets must never discard or reconstruct authoritative records.
- Dense semantic data may live in a bounded scroll region opened by the user. It is not a live region and must not create an announcement storm.
- Visible chart axes, units, biological-time labels, lineage IDs/genotypes, and numbered non-color series identifiers are essential scientific presentation and must meet the shared Petra caption floor. SVG `role=img` summaries are accessibility redundancy, not permission to make visible scientific labels illegible. Browser/expo-distance collision and readability acceptance remains #59.

## Motion
- Analysis motion resolves through shared Petra motion policy/tokens only.
- Full motion may use bounded opacity/panel transitions. Reduced motion crossfades; motion-off remains static.
- Do not animate a trajectory being “drawn” through time as though wall-clock animation represents biological progression.
- Biological time is labelled explicitly in hours from authoritative sample timestamps.

## Verification
Deterministic tests cover source-point-only decimation, full-data domains, unit mismatch rejection, lineage ancestry validation/layout, reduced/off motion semantics, server-render unit/time labels, non-color series identity, lineage status geometry, and empty-authority states.

Browser visual density, focus/zoom behavior, screenshots, and performance belong to the local expo QA workflow rather than source-only claims.
