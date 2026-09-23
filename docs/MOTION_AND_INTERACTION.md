# Motion and Interaction Specification

## Principle

Petra's animation system is an explanatory layer over real state. Motion answers “what changed, where, and why?” It should never be a substitute for simulation.

## Timing model

Maintain three clocks:

1. **simulation time** — biological time, can run minutes/hours per wall-clock second;
2. **render time** — smooth 60 Hz-ish presentation when device permits;
3. **story time** — short UI transitions/highlights that may momentarily emphasize an event without pausing biology unless explicitly configured.

The UI always displays simulation time so accelerated evolution is not mistaken for real-time laboratory speed.

## Camera

### Pan/zoom
- wheel/pinch zoom around pointer focal point;
- drag pan only once zoomed beyond whole-dish framing;
- double-click/tap colony to focus;
- Escape / “Dish” button returns to overview.

### Semantic transitions
Cross thresholds gradually:
- dish -> colony: reveal local vectors, microcolony marks and contours;
- colony -> representative cell: transition to an explanatory side/overlay scene, not a fake physical microscope claim.

## Interaction palette

Tools are spatially explicit where possible:
- inoculate: click/drag one or more seed points;
- antibiotic: global dose, radial drop, stripe/gradient, or painted region depending scenario;
- nutrient: replenish/paint;
- phage: introduce at point/region;
- inspector: sample cell/region;
- environment: global temperature/pH sliders where mechanism enabled.

Tool cursor previews radius/intensity before application.

## Intervention feedback

Every intervention creates:
- visual preview;
- exact parameter readout;
- command entry on timeline;
- undo before run when safe;
- event record after application.

Do not hide the numeric meaning behind game-only labels.

## Timeline

The bottom timeline is both controller and scientific record.

It shows:
- user interventions;
- major mutations/lineage births;
- threshold events (1% resistance, collapse, nutrient depletion);
- phage introduction/waves;
- optional bookmarks.

Click an event to move inspector/camera to the relevant place and time when replay/snapshot support exists.

## Speed

Suggested speeds:
- pause;
- 1×;
- 4×;
- 16×;
- “fast-forward until event” in later version.

Fast-forward may reduce render frequency while preserving simulation steps.

## Event animation budget

Event effects should be short:
- mutation spark: 250–500 ms wall time;
- selection highlight: 500–900 ms;
- lysis burst: < 500 ms;
- panel transitions: 180–300 ms.

Biological duration is shown separately; visual effect duration is not the mechanism duration.

## Reduced motion

When `prefers-reduced-motion: reduce`:
- remove parallax;
- replace camera swoops with short crossfades or immediate focus;
- suppress decorative colony bobbing;
- make intervention waves appear as static/opacity changes;
- retain essential scientific progression in the actual dish state.

Provide an in-app Motion setting because some users want more/less motion independent of OS.

## Haptics/audio

Optional only. If added:
- subtle click/drop audio;
- low-key colony ambience;
- distinct scientific event cues;
- master mute.

No loud arcade feedback for antibiotic kills or mutation; tone should stay curious/scientific.

## Scroll storytelling

The product may have a landing/onboarding narrative with scroll-driven sections, but the simulator itself should not require scroll to operate.

A strong onboarding sequence:
1. “A dish is an ecosystem.”
2. seed a population;
3. let it grow;
4. apply antibiotic;
5. reveal pre-existing resistant lineage;
6. hand control to user.

Use scroll-driven illustration only on the intro/learn surface. Respect reduced motion.

## Input acceptance

- mouse/trackpad complete;
- keyboard controls for play/pause, speed and tool cancel;
- touch controls remain possible, though desktop is the primary competition target;
- inspector/tooltips work with keyboard focus;
- avoid hover-only required actions.
