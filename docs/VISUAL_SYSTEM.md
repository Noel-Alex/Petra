# Petra Visual System

## Creative objective

Petra should look like a **premium interactive science story living inside a Petri dish**. The experience should feel playful enough for an 11th-grade competition audience while being precise enough that a scientist can tell what the colors, motion and overlays mean.

The design takes high-level inspiration from contemporary science-edutainment—especially vibrant geometric vector illustration, strong silhouettes, approachable storytelling and meticulous motion—but Petra must remain visually original. Do not copy Kurzgesagt birds, props, exact palettes, compositions, icons, typography, or branded assets.

Kurzgesagt describes its own work as using vibrant, striking vector illustration/animation to make complex topics approachable; that is the level of clarity and delight Petra should pursue, not a literal clone.

## Visual identity: “living laboratory”

### Hero object
The circular dish dominates the screen.

It should read simultaneously as:
- glass laboratory object;
- miniature ecosystem;
- game board;
- scientific visualization.

The dish gets a subtle rim, refraction/highlight treatment and soft environmental shadow. Interior visuals are flatter and more illustrative so data remains legible.

### Shape language
- microbes: rounded, geometric, expressive silhouettes;
- phage: crisp radial/icosahedral-inspired silhouette with simplified tail geometry;
- resources: soft glowing particulate/field texture;
- antibiotic: translucent pressure field + discrete intervention pulse;
- lineage: outline/halo/pattern, not just recolor;
- UI panels: rounded but not bubbly; compact editorial cards with strong headings.

### Reusable code-rendered primitives
Petra's shared normalized visual vocabulary lives in `src/design/vectorPrimitives.ts`; DOM/SVG consumers use `src/ui/PetraPrimitiveGlyph.tsx` where the geometry is concrete enough to render without invention. The current reusable component supports calm colony clusters, rounded rods, budding clusters, selection rings, and intervention markers with explicit idle/hover/selected/disabled/loading/active presentation states.

These shapes are visual language, not biological authority. A live surface must receive organism/field/action identity from authoritative runtime contracts before associating a silhouette with scientific meaning. Onboarding may use the same shapes as clearly decorative story motifs. Missing hyphal/contour path geometry is a specification gap to fill at the framework-neutral design layer, not a license for React or Pixi to improvise a biologically suggestive path.

All component tones derive from `src/design/visualTokens.ts`, and transition behavior derives from named Petra motion policy. Reduced/Off motion removes decorative looping while preserving static shape and state cues.

### Depth
Use **2.5D**, not gratuitous 3D.

The main dish is a 2D scientific state with perspective/light cues. Camera zoom reveals richer vector/particle detail without changing the underlying model. Three.js is justified for a specific close-up/hero sequence only if it adds information; PixiJS/WebGL is the default for the live dish.

## Color strategy

Use a custom Petra palette built around matte ink/navy surfaces, warm cream typography, muted teal/mint, warm amber/coral/olive, and restrained lavender. Accents should remain readable but calm; avoid electric cyan, hot pink, ultraviolet glow, or rainbow saturation. Do not duplicate another studio's published palette.

Semantic families:
- susceptible lineage — muted cool teal/blue family;
- resistant lineage — warm restrained coral family;
- nutrient — warm gold/amber;
- antibiotic — restrained lavender family;
- phage — mint/teal family;
- death/inactive biomass — desaturated gray/indigo;
- warning/uncertainty — amber, with icon + text.

Shared color values live in `src/design/visualTokens.ts` and are projected into CSS/Pixi from that single authority. Core normal-text combinations are regression-tested for WCAG AA contrast.

Every semantic color must also have a non-color cue when critical:
- icon;
- hatch/pattern;
- stroke type;
- label;
- shape.

## Typography

Use a highly legible geometric sans for UI and a stronger display weight for storytelling moments. Avoid novelty fonts in data-heavy surfaces.

Hierarchy:
- 32–48 px display / scenario title;
- 20–28 px section heads;
- 15–18 px UI body;
- 12–14 px metadata/provenance, never below accessible legibility.

Numeric readouts use tabular figures if available.

## Main layout

Desktop target:

```text
┌────────────────────────────────────────────────────────────┐
│ Petra / scenario / experiment status              sources  │
├──────────────┬──────────────────────────┬──────────────────┤
│ intervention │                          │ inspector        │
│ palette      │       PETRI DISH         │ lineage/local    │
│              │       hero canvas        │ fields + charts  │
│              │                          │                  │
├──────────────┴──────────────────────────┴──────────────────┤
│ timeline | interventions | play pause speed seed replay    │
└────────────────────────────────────────────────────────────┘
```

Panels should collapse when the user wants an immersive dish view.

## Zoom model

### Level 0 — Experiment
Whole dish, large patterns, spatial gradients, interventions.

### Level 1 — Colony
Local microcolony patches, neighboring lineages, nutrient/drug contours, local growth arrows.

### Level 2 — Cell-story representation
An **illustrative explanatory view**, not literal molecular simulation. Show a representative cell, genotype/phenotype state, drug target/efflux concept, phage infection state, etc. Clearly label it “representative view.”

Zoom is semantic: it reveals appropriate information, not merely bigger pixels.

## Data overlays

Toggleable layers:
- nutrient field;
- antibiotic concentration;
- local net growth rate;
- genotype/lineage;
- phage density;
- occupied biomass;
- mutation/infection events;
- uncertainty/confidence (when useful).

Use contour/heatmap blending that keeps colonies visible. Overlay legends remain pinned and unit-aware.

## Microbe rendering

Use procedural instancing/particle containers. A visual particle may represent many cells.

At dish scale:
- dense stipple/texture + colony silhouettes.

At colony scale:
- more individual rods/cocci-like marks;
- occasional division animation;
- lineage halo/outline.

Never imply exact cell count from decorative particle count.

## Signature motion language

Motion should make causality visible:
- dose enters dish as a field wave/paint diffusion;
- susceptible regions fade/shrink under negative net growth;
- resistant lineage expansion is spatial, not a celebratory “power-up”;
- mutation event gets a brief local spark + lineage branch line;
- nutrient depletion subtly shifts local texture;
- phage infection sends a small local ripple, followed after latency by lysis/burst.

Avoid constant bouncing UI and meaningless particle noise.

## Story moments

The simulator can briefly elevate significant events:
- “A resistant lineage was already here.”
- “Selection changed frequency; the drug did not choose the mutation.”
- “This lineage survives, but pays a growth cost without drug.”
- “Persistence is temporary phenotype, not inherited resistance.”

These are generated from actual event state and can open a deeper explanation card.

## Originality rule

Allowed inspiration:
- flat geometric illustration;
- bold but controlled color;
- science-first storytelling;
- layered parallax used sparingly;
- polished easing;
- friendly abstract organisms.

Do not reproduce:
- recognizable Kurzgesagt bird characters;
- exact iconography;
- exact scene compositions;
- logo/wordmark;
- distinctive poster artwork;
- ripped/traced assets;
- pixel-for-pixel palettes.

Petra should be recognizable as Petra.

## Accessibility

- respect `prefers-reduced-motion`;
- no critical information only in animation;
- avoid rapid flashes;
- keyboard focus visible;
- tooltips accessible via focus, not hover only;
- high-contrast analysis mode;
- colorblind-safe alternate lineage patterns;
- text labels for scientific symbols on first use.

## Asset strategy

Prefer:
1. procedural vectors/shaders;
2. original SVG icon set;
3. small original texture atlas;
4. optional custom illustrations for onboarding/scenario cards.

Avoid a pipeline that requires dozens of bespoke animated videos—the live simulation itself is the visual content.

## Visual acceptance gate

A feature is not visually complete until:
- hierarchy is clear at first glance;
- dish remains the hero;
- data legend matches state/units;
- transitions explain rather than obscure;
- no jank/clipping at target viewport;
- reduced-motion path works;
- screenshot at whole-dish and zoomed colony level looks intentional, not debug-like.
