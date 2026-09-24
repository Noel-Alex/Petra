# Simulation core DOX contract

## Purpose
`src/sim/` is Petra's authoritative deterministic simulation substrate. It owns numerical/scientific state, replay identity, stochastic streams, checkpoints, metrics/events, and mechanism coordination.

## Contracts
- No React, DOM, Pixi, animation, LLM, or network dependency may enter simulation authority.
- Never call `Math.random()` in this subtree. All stochastic behavior uses an explicit serializable Petra RNG stream or a reviewed deterministic substream derived from it.
- A checkpoint must contain enough authoritative state to continue the trajectory exactly under the same engine version.
- `scenario + parameter versions + engine version + seed + ordered commands` defines replay identity. Changing numerical update order or RNG consumption is a replay/model change.
- Renderer sampling must not consume the biological RNG stream.
- Synthetic fixture state may exercise infrastructure but must be named as synthetic and removed/replaced as real mechanisms arrive; never present it as biology.
- Protocol/state changes require deterministic tests and coordination because they are high-conflict integration surfaces.

## Verification
At minimum, test identical-seed/command replay, RNG state round-trip, checkpoint continuation, invalid cross-run restore, and validation of command bounds. Scientific mechanisms add their own invariants/fixtures.

## Child DOX index
- `ecology/AGENTS.md` — resource-limited biomass flux, loss-hazard, and event-boundary contract.
- `evolution/AGENTS.md` — discrete mutation-opportunity, lineage identity, RNG/replay, and evolution-authority contract.
- `pharmacodynamics/AGENTS.md` — source-response, MIC-transfer, and resource×drug composition contract.
