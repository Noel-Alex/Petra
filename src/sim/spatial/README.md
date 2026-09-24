# Spatial field substrate

Petra's dense environmental fields use a regular Cartesian grid clipped by a circular dish mask.

## Authoritative dish geometry

The grid dimensions, cell size, circular center, and radius define the simulation domain. Custom center coordinates must be finite, and construction fails if the resulting circle contains zero authoritative grid cells. The spatial kernel never silently recenters, enlarges, or substitutes renderer/camera geometry for malformed simulation geometry. Finite off-center dishes remain valid when they actually intersect the grid.

## Boundary condition

Diffusion uses a five-point Laplacian. A neighbour outside the circular mask contributes **zero flux**, not a zero concentration. This is the discrete no-flux/reflecting rim used by the first dish model.

## Stability

For explicit 2D diffusion on equal grid spacing `dx`, the implementation enforces

`alpha = D * dt_sub / dx^2 <= 1/4`.

A requested ecological interval is subdivided automatically with

`dt_stable = dx^2 / (4D)`.

The field owns one reusable scratch buffer; diffusion performs no per-cell allocation in its hot loop.

## Numerical authority

Field values are `Float32Array`s for browser memory/transfer efficiency. Tests therefore use tolerances appropriate to Float32 arithmetic. The no-flux diffusion-only invariant is conservation of total field mass up to floating-point error, together with non-negativity and symmetry for symmetric fixtures.

## Units

This module is deliberately unit-agnostic. `cellSize`, diffusivity and `dt` must be mutually consistent (`D` has length²/time). A biological scenario is responsible for assigning physical units and provenance. This module introduces no biological diffusion coefficient.

## Interventions

Uniform, radial, band and brush primitives write deterministic geometry into a field. They are numerical tools only: the scenario/UI layer must supply the meaning, units and provenance of a nutrient/drug concentration.
