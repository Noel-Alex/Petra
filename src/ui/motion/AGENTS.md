# Motion subsystem authority contract

This directory owns **presentation motion policy only**. It may decide how an already-authoritative UI/render state change is presented; it may never decide whether a biological event happened.

## Authority boundary

- Simulation time, population state, lineage state, concentrations, mutation events, intervention acceptance, and causal ordering come from simulator/runtime authority.
- Motion wall time is not biological time. Never label a token duration as a growth, mutation, drug-response, infection, or selection duration.
- React/Pixi adapters consume these framework-neutral planners. They should not introduce competing durations/easings for the same semantic transition.
- Animation callbacks and completion events may update presentation state only. They must not synthesize simulator commands or scientific events.

## Semantic zoom

`semanticTransitions.ts` plans dish → colony → representative-cell presentation changes.

- Whole-dish and colony views are visualizations of authoritative state at different semantic detail.
- The representative-cell view is explicitly illustrative/explanatory; it is not a literal microscope claim or new simulation scale.
- Full motion may interpolate camera position/scale using `MOTION.cameraFocus`.
- Reduced motion crossfades navigational changes; motion-off changes view instantly.
- When the caller supplies a stable presentation-space focus target, adapters preserve that target across the transition. A focus target is not a mutable simulator handle.
- Transition plans contain no simulation clock or biological values.

## Panels and overlays

Panel/overlay reveal/hide uses `MOTION.panel` only in full motion. Reduced/off motion settles immediately so UI chrome does not compete with the dish or create unnecessary movement.

## Verification

Deterministic unit tests should cover full/reduced/off behavior, focus preservation, illustrative labeling, and surface-exit lifecycle. Browser smoothness, clipping, screenshots, touch behavior, and frame-time/FPS require the local browser acceptance workflow (#59) and must not be inferred from source tests.


## Accessible causal announcements

`announcements.ts` bounds spoken presentation of already-authoritative event batches.

- Announcement order comes only from authoritative event sequence, never animation wall time or scheduler stagger.
- A single new event retains its specific explanation; a multi-event batch becomes one concise count summary in first-kind-occurrence order.
- Summarizing speech never deletes, merges, or rewrites the underlying scientific timeline/history.
- Sequence + event identity cursoring prevents duplicate re-announcements on render/reconciliation. Cursor state belongs to the presentation adapter and resets only with explicit run identity change.
- Full/reduced/off motion modes have identical spoken scientific meaning.
- Live regions use polite + atomic semantics unless a future, separately justified urgent state is introduced.
