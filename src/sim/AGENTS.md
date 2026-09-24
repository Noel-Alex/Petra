# Simulation core DOX contract

## Purpose
`src/sim/` is Petra's authoritative deterministic simulation substrate. It owns numerical/scientific state, replay identity, stochastic streams, checkpoints, metrics/events, and mechanism coordination.

## Contracts
- No React, DOM, Pixi, animation, LLM, or network dependency may enter simulation authority.
- Never call `Math.random()` in this subtree. All stochastic behavior uses an explicit serializable Petra RNG stream or a reviewed deterministic substream derived from it.
- A checkpoint must contain enough authoritative state to continue the trajectory exactly under the same engine version.
- `scenario + parameter versions + engine version + seed + ordered commands` defines replay identity. Changing numerical update order or RNG consumption is a replay/model change.
- Numeric run seeds are canonical replay identity only when they are unsigned 32-bit integers in `[0, 0xffffffff]`, matching the RNG's actual input width. Invalid aliases must be rejected before RNG initialization; never wrap/canonicalize a visibly different seed with JavaScript bitwise coercion. Seed `0` is valid.
- Serialized RNG checkpoint state is exact authority too: every one of the four xoshiro words must already be an integer in `[0, 0xffffffff]`, and the all-zero state remains forbidden. Restore rejects malformed words before assignment; it must never repair checkpoint state with `>>> 0` coercion.
- Renderer sampling must not consume the biological RNG stream.
- Synthetic fixture state may exercise infrastructure but must be named as synthetic and removed/replaced as real mechanisms arrive; never present it as biology.
- Protocol/state changes require deterministic tests and coordination because they are high-conflict integration surfaces.
- Timeline-worthy protocol events carry exact authoritative `simulationTimeHours` at emission. That timestamp is replay/wire identity and must not be reconstructed later from a newer checkpoint.
- Required worker wire-shape changes bump `PROTOCOL_VERSION`; do not silently extend an existing protocol version with new required fields.
- `authoritative.ts` is a bounded composition scaffold over merged mechanism kernels. It accepts only caller-supplied configuration/state, carries a canonical configuration fingerprint so lineage ordering/mechanism configuration cannot drift silently between steps, and is not itself the browser worker protocol or a substitute for versioned run identity/provenance.
- The composed-state dish mask is an authoritative domain boundary: resource and lineage biomass must be exactly zero where `mask === 0` in both initial configuration and any restored/mutated state. Validation fails closed rather than clamping caller-supplied science, and aggregate resource/lineage metrics sum only in-mask cells.
- Composed ecology metrics may expose continuous `divisionBiomass`; that value remains aggregate flux and must not be rounded or passed into the exact evolution sampler until #5/#37 lands the reviewed discrete-event bridge.
- `regionInspector.ts` is the authoritative read-only local-region projection boundary. Selection geometry is normalized and presentation-independent; values are aggregated directly from simulation grid state, never Pixi/render snapshots. A selection covering zero authoritative in-mask grid-cell centres returns the typed `no-grid-coverage` outcome with no biomass/resource measurement fields; this is distinct from a covered region whose measured values are genuinely zero. Current composed-state biomass/resource units remain explicit model units; UI must not relabel them as cells, concentration, mass, or area density without a provenance-owned physical unit bridge.
- Any enabled phage spatial-unit bridge is replay-critical configuration. Its canonical identity (biomass↔cell-equivalent scale, interaction volume, grid pitch, and evidence classifications/source keys) must be included in authoritative scenario/configuration fingerprinting before phage dynamics can participate in checkpoints.

## Verification
At minimum, test identical-seed/command replay, RNG state round-trip, checkpoint continuation, invalid cross-run restore, and validation of command bounds. Scientific mechanisms add their own invariants/fixtures.

## Child DOX index
- `ecology/AGENTS.md` — resource-limited biomass flux, loss-hazard, and event-boundary contract.
- `evolution/AGENTS.md` — discrete mutation-opportunity, lineage identity, RNG/replay, and evolution-authority contract.
- `pharmacodynamics/AGENTS.md` — source-response, MIC-transfer, and resource×drug composition contract.
- `phage/AGENTS.md` — phage life-history evidence resolution, interpolation/OOD, and pre-infection unit gates.
