# Petra Performance & Product Recovery Plan

Status: **ACTIVE** — owned by `Noel/perf-recovery-2026-09-28`, created 2026-09-28.
This file is the execution contract for the lag/perf/content lane. Update the tracker in
place as work lands; do not rewrite history or delete gates that were not met.

## Mission (user-stated success criteria)

1. **Smooth**: tab must not get laggy during long runs; steps must not slow down as
   simulation age grows; pan/zoom of the Petri dish must feel fluid.
2. **Beautiful**: UI must look at least as good as `docs/design/ui-reference/01..03.png`
   (approved direction, commit `7c1017c5`).
3. **Rich content**: plenty of bacteria/fungi to choose from, plus medicines and
   nutrients, whose interactions are simulated believably.
4. **Accurate science**: competition, evolution, resistance to other species and to
   antimicrobials, colony/environment interaction — with provenance, not invented constants.
5. **Long runs**: extremely long simulations must run smoothly and stay interactive.

## Ground truth verified before writing this plan

Sync: `git rev-list --count HEAD..origin/main` = **0** → nothing to pull; `origin/main`
(`e6936167`) is contained in this branch. Branch is ahead, not behind.

| # | Finding | Evidence |
|---|---|---|
| G1 | Release responsive-performance gate has **never measured anything** | `.petra_local/runs/20260926T024602624875Z/release-responsive-performance-matrix/compact-result.json`: `"status": "blocked"`, blocked on issue #532, next action = "replace this gate command with the real experiment helper" |
| G2 | "Perf tests" assert **source-code strings**, not frames | `src/render/pixi/rendererCameraFastPath.test.ts:42-44` `expect(pointerSource).toContain("renderCameraOnly();")` / `.not.toContain("drawField(")` |
| G3 | O(n²) growth in sim/worker path | `src/sim/eventHistory.ts:31` `const next = Object.freeze([...history, stored])` — full array copy **per appended event** |
| G4 | O(n²) growth on main thread | `src/app/liveAnalysisHistory.ts:188` unbounded `samples.push(structuredClone(...))`; `:201` `snapshot()` deep-clones **entire** history per call |
| G5 | Sampling policy amplifies G4 | `data/analysis/flagship_metric_authority_v1.json:44` "Make every accepted composed snapshot eligible for authoritative aggregate metric extraction" |
| G6 | React re-renders at 20 Hz with whole state object | `src/app/useExperimentRuntime.ts:28` `RUNTIME_PRESENTATION_INTERVAL_MS = 50`; `:123` `setState(nextState)`; `:136-138` `setInterval`; `:193-196` full view re-projection on every state change |
| G7 | Every tick re-bakes rasters + per-lineage contours | `src/render/pixi/renderer.ts:290-305` prepared-cache clear on revision change; `:461-467` zoom-settle forces full `render()` |
| G8 | Camera-only frames still rescan glyph candidates | `src/render/pixi/renderer.ts:434-444` → `representativeGlyphsForCamera` per frame over prepared candidates |
| G9 | Footprint projection rescans full command history | open issue **#1081** |
| G10 | The defect is already correctly ticketed but **unfixed** | #1102 [P0] names event-history cloning/hashing/transport slowdown; #1081/#869/#865/#876/#850/#1054/#642 all **OPEN, unassigned**; #1110 was the only open PR → lane is free, no in-flight conflict |
| G11 | Content catalog is ~1 flagship scenario, not "plenty" | `data/`: 1 content pack, 1 antimicrobial pack (chloramphenicol) + ciprofloxacin preset, 1 medium (MOPS-glucose), 1 interaction, 3 phage files; runnable organisms ≈ *E. coli* MG1655, *B. subtilis*, *A. niger* No10 (+T4) |
| G12 | Reference UI is tracked in-repo | `docs/design/ui-reference/0{1,2,3}-*.png`, 1672×941, added by `7c1017c5` "Add approved Petra UI direction reference concepts" |

### Remediation status against this table (updated 2026-09-28)

| # | Status | Evidence |
|---|---|---|
| G1 | **Fixed earlier** — do not redo | `fd940f01 perf(sim): make event history immutable copy-on-write (#1106)` + `c9c64385 perf(worker): transport only appended event history (#1107)`. `src/sim/eventHistory.ts` now keeps a `WeakMap` parent chain so `simulationEventHistoryDelta` is O(newly appended), and the surviving `[...history, stored]` copy is the intended copy-on-write prefix cost of the immutable-array interface. |
| G3 | **Partly fixed, honestly bounded** | Same two commits remove the per-append full-history walk/clone from the transport path. The array prefix copy in `appendSimulationEventHistory` remains O(history) per append; replacing it means changing the history representation (e.g. persistent vector), which is **not** justified until a measured frontier actually shows it hurting. |
| G4 | **Fixed here** | `src/app/liveAnalysisHistory.ts`: samples are deep-frozen at append, `snapshot()` reuses a cached frozen array and shares frozen identity/policy instead of `structuredClone`-ing the whole series per call. n snapshots now cost O(n) amortized in the snapshot path instead of O(n²). Contract change recorded in `src/app/AGENTS.md`; regression tests replaced/added in `tests/app/liveAnalysisHistory.test.ts`. |
| G2 | **Confirmed, still open** | Fast-path tests still assert source strings; the harness fix now at least makes real frame capture possible (see measured baseline). |
| G5–G12 | Untouched by this change | G5 still amplifies G4's *retained volume*, but no longer its per-call cost. |

Verification actually run for G4: `npm run typecheck` → exit 0. Full local suite (no CI, per project
freeze) `npx vitest run` → **1952 passed / 25 failed (1977)**; the identical **18-file / 25-failure**
set reproduces with these two files stashed at HEAD (**1951 passed / 25 failed, 1976**), so the 25
failures are pre-existing on this branch and this change introduces none while adding one passing
test. `src/app/analysisMetrics.ts` was audited: `buildAuthoritativeMetricSeries` only reads its
`samples` argument, so handing out shared frozen rows is safe for the sole consumer
(`runtimeAnalysisTransaction.ts`).



### Reference UI facts extracted by pixel sampling (agent cannot view images)

Palette is a dark, low-saturation navy/teal ground: `#102030` 32-37%, `#001020` 18-33%,
`#102020` 8-12%, `#002020` ~7%, `#103040` ~6%, `#203040` ~6%, single brighter teal `#305050` ~2%.
Layout (60×14 luminance map): large bright **ellipse** at cols ~18-40 / rows 2-11 = the dish
(≈40% width × ≈75% height, centered); left content column (cols 2-15, rows 3-10) = intervention
palette; right scattered content (cols 42-58, rows 2-11) = inspector/charts; sparse bottom strip
(row 13) = timeline; centered band at top (rows 0-1, cols 17-40) = header. Frame 02 adds a solid
bright block lower-left (rows 10-11, cols 3-18) = placement drawer. Frame 03 densifies both side
panels. Treat as approximate until Phase 4 produces the machine-readable metrics JSON.

### Capability limit (do not paper over)

This agent **cannot view images** (`read_files` → "Current model does not support image
input"). Visual fidelity must therefore be driven by quantitative pixel comparison against the
reference PNGs, plus a human review pass per milestone. Never claim a visual result "matches the
reference" from reasoning alone.

## Binding rules for this lane

- **No source-text assertions as performance evidence.** `toContain("renderCameraOnly();")`-style
  checks prove a call site exists, not that a frame is fast. Perf claims require measured numbers.
- **Local measurement only.** CI freeze is binding: no GitHub Actions, no hosted benchmark/GPU
  jobs, no required checks. Never block a PR on CI.
- **Never fabricate browser, GPU, heap, FPS, or scientific-validation evidence.** If a workload
  did not run in this environment, record it as `blocked`/`unavailable`, not as a pass.
- **Rendering may explain simulation state; it must never decide biology.** Presentation
  decimation is allowed; changing authoritative sampling/trace semantics to look faster is not.
- Determinism is sacred: fixed scenario + seed + engine version must still reproduce, and
  `traceHash` values must be unchanged by perf refactors (prove with `seed_replay_matrix`).
- **No new profilers without a paired fix in the same or an immediately following commit.**
  The failure mode that produced this situation was building measurement rigs and leaving #1102
  untouched.
- Content must carry provenance: `measured` / `derived` / `transferred` / `mechanistic
  approximation` / `visual-only`, with DOI, strain, medium, temperature, assay. Update
  `research/CLAIM_LEDGER.md`. Do not invent constants to widen the catalog.

## Phase 0 — Baseline measurement (before touching hot paths)

Goal: replace opinion with numbers, and define the release-candidate target that #532 has been
blocked on.

- Build the real bundle: `npm run build`, serve `npm run preview`. **`vite preview` of the
  production bundle is the declared release-candidate performance target** — this unblocks the
  `release-responsive-performance-matrix` stub.
- Add `tools/perf_baseline.py`: raw-CDP harness (Chrome at
  `C:\Program Files\Google\Chrome\Application\chrome.exe`, `--remote-debugging-port`, reusing the
  zero-dependency websocket approach already used by `tools/expo_browser_acceptance.py`).
- Measure, per state, frame-time p50/p95/p99, long tasks, React commits/s + commit duration, JS
  heap, and worker ticks/s: S1 idle/paused; S2 camera-only pan+zoom at t≈0; S3 camera-only
  pan+zoom after ≥6 h simulated at 16×; S4 sustained 16× playback.
- **Also run the matrix in dev mode** and report the dev-vs-build split honestly: if part of the
  reported lag is Vite dev overhead, say so instead of claiming a fix.
- Emit compact JSON under `.petra_local/runs/<runId>/perf-baseline/`.
- **Gates (initial; re-set from the first real baseline):** camera p95 ≤ 16.7 ms (hard fail
  > 33 ms); no long task > 50 ms during camera interaction; late/early step-time ratio ≤ 1.15;
  bounded heap growth across S4; ticks/s not monotonically decreasing.
- Post numbers to #642 and #850; reference them from #1102/#1054.

Deliverable = committed harness + committed baseline numbers. **No optimization claim until a
baseline exists.**

### Measured baseline — 2026-09-28 (first frame numbers this project has produced)

Environment: production bundle via `npm run preview` of `dist/`, headless Chrome on
`C:\Program Files\Google\Chrome\Application\chrome.exe`, **SwiftShader software WebGL**
(`--use-angle=swiftshader`), 1440×900, DPR 1, Motion Off, scenario
`ecoli-ciprofloxacin-spatial`, engine `petra-ts-core/0.1.0`.
Run `20260928133836789Z`, summary `56 pass / 12 fail / 4 blocked` (previously
`23/12/3` with **zero** frame data because no GL context existed).

Renderer-owned synchronous camera redraw vs total frame interval, 175 frames per workload:

| Workload | Frame avg | Frame p95 | Frames > 33 ms | Redraw avg | Redraw p95 |
| --- | --- | --- | --- | --- | --- |
| whole-dish (t≈0) | 82.99 ms | 91.70 ms | 175/175 | 0.469 ms | 0.70 ms |
| colony camera zoom | 82.68 ms | 91.60 ms | 175/175 | 0.371 ms | 0.50 ms |
| post-growth whole-dish | 82.85 ms | — | 175/175 | 0.490 ms | — |
| post-growth colony zoom | 83.09 ms | — | 175/175 | 0.426 ms | — |

Reading these honestly:

- **Petra's own camera redraw work is ~0.4–0.7 ms.** The ~83 ms frame interval is almost
  entirely outside application code: SwiftShader rasterizes a 610×610 surface on CPU threads
  shared with everything else on this machine. **The frame-interval column must not be used as
  a release gate** — it measures this software rasterizer, not a GPU. The redraw column is the
  application-attributable number and it is already well inside budget.
- **These numbers do not yet exercise G1/G3/G4.** The post-growth workload reached only
  **17 accepted commands / 5.44 h / 1 873 occupied cells**, and the redraw cost is flat across
  early and late (0.469 → 0.490 ms). That is a *weak workload*, not evidence of no slowdown —
  the two `post-growth: authoritative frontier reached` checks are correctly `blocked`. Raising
  the frontier into thousands of commands/events is the prerequisite for any Phase 1 claim.
- `framesOver33ms = 175/175` in every workload is therefore a rasterizer property, and the two
  `p95 under 33.4ms` failures are **not** attributable to application code in this environment.
  The Phase 0 gate has to be restated against a real GPU (see Gate restatement below).

What the now-working harness surfaced about camera gestures (previously invisible, because every
prior run had no GL context at all): the camera pipeline **works**, but a **single wheel tick of
`deltaY = -32` produces no observable change at all.** A dedicated probe
(`.petra_local/camera_probe.py`, artifact `.petra_local/camera-probe.json`) compared the full
page PNG hash and the dish panel text after each gesture, all against the same settled frame:

| Gesture | Page PNG changed | Dish text changed |
| --- | --- | --- |
| one wheel, `deltaY = -32` | **no** | no |
| 12 × wheel, `deltaY = -120` | yes | yes |
| keyboard `+` (Shift+Equal) | yes | — |

The wheel event is genuinely owned (`defaultPrevented: true`), the canvas stays
610×610, and `rendererSource = authoritative-snapshot` throughout, so this is not the
"zeroing GL failure" pattern from before. The honest reading is **single-tick wheel zoom is
below observable resolution**, not "camera is broken" — cumulative wheel and keyboard zoom both
work. Two consequences, both actionable:

- The acceptance assertion is too weak a probe of real interaction: it asserts that **one**
  `-32` tick must move pixels. It should assert a gesture sequence a user would actually
  perform, and separately assert per-tick responsiveness if per-tick responsiveness is a
  product requirement.
- Whether `-32` is *supposed* to be invisible is an unresolved product/science-of-use question
  (trackpads emit small deltas constantly; a first tick that feels dead is a real UX defect).
  It needs a delta-sweep measurement before any threshold is changed, so a fix is grounded in
  data rather than a guessed constant.

## Phase 1 — Kill simulation-age slowdown (#1102, #1081)

Highest leverage on "steps get slow later on".

- `src/sim/eventHistory.ts:31`: replace the per-event full-array copy with a chunked append-only
  log (immutable chunks + rolling incremental hash), materializing the frozen array view only on
  demand. `traceHash` semantics must stay byte-identical.
- `src/app/liveAnalysisHistory.ts`: stop deep-cloning the whole history in `snapshot()` (`:201`);
  return frozen structural sharing. Keep `samples` as plain frozen rows; drop per-append
  `structuredClone` (`:188`) where validation already guarantees isolation. Charts may consume a
  bounded/downsampled series; authoritative sampling stays as-is.
- #1081: give `src/app/runtimeInterventionFootprints.ts` an incremental index keyed by accepted
  command count instead of rescanning command history.
- Audit remaining per-snapshot `structuredClone` in the advance path (`src/sim/authoritative.ts`,
  `src/sim/composedEcologyObservation.ts`, `src/worker/*`) and move bulk numerics to
  typed-array/transferable channels where the transport contract allows.
- **Gate:** node long-soak printing per-1000-tick wall time; require a **flat** curve (late/early
  ratio ≤ 1.15); unchanged `traceHash` via `seed_replay_matrix`; `npm test` green apart from the
  3 known-red tests listed under Hazards.

## Phase 2 — Publication and React decoupling (#876, #850, #630)

- Replace the 20 Hz whole-state `setInterval` publication in `useExperimentRuntime.ts` with
  rAF-coalesced publication; React state keeps only lightweight view scalars (time, speed, phase,
  headline counts, selection).
- Route dish-bound snapshot data to the renderer through an imperative channel so camera and
  playback frames never trigger React reconciliation.
- Memoize/isolate subtrees: analysis charts + timeline at 2-4 Hz; append-only virtualized
  `TimelineHistory`; make `projectExperimentRuntimeView` incremental, not a full re-projection.
- **Gate:** ≤ 1 React commit per animation frame and commit duration < 4 ms at 16×, measured in
  the production bundle by the Phase-0 harness.

## Phase 3 — Renderer camera path and cache invalidation (#865, #869, #1054)

- Replace the single `renderPreparationRevision` with **per-layer** revision keys so a new tick
  never invalidates untouched density/field rasters or lineage contours.
- Camera-only frames must not re-run `representativeGlyphsForCamera`: cache the selection under a
  quantized camera key and rebuild only on gesture settle.
- Move per-lineage contour extraction off the main thread (worker) or amortize it incrementally
  per changed lineage; hard-cap per-frame contour work.
- Verify Pixi is really doing GPU work (density/field as sprites; `texture.source.update()` only
  on genuine invalidation) and that canvas backing store / DPR does not grow with zoom.
- **Gate:** the Phase-0 camera workload meets gate in **both** S2 and S3 — exactly the post-growth
  camera evidence #1054 demands.

## Phase 4 — Visual fidelity to the approved reference

Because the owning agent cannot view images, fidelity is quantitative first, subjective review
second.

- Add `tools/reference_metrics.py`: from `docs/design/ui-reference/0*.png` extract a committed
  machine-readable spec (`docs/design/ui-reference/metrics.json`) — quantized palette with
  coverage, region bounding boxes, fitted dish centre + radius, side-panel widths, header/footer
  bands.
- Run the same extractor over Petra's own acceptance screenshots and emit a diff report: palette
  delta, panel-position IoU, dish-radius/centre ratio. Make "looks like the reference" checkable.
- Implement the measured deltas. Starting facts already established: dark navy-teal ground
  (`#102030`, `#001020`, `#102020`), large centered dish ≈40%×75%, left intervention palette,
  right inspector, bottom timeline strip, centered top header, sparse high-contrast accents.
- Then the art-direction pass: dish rim/refraction/environmental shadow, colony silhouettes,
  `VISUAL_SYSTEM.md` type scale (32-48 display / 20-28 section / 15-18 body / 12-14 metadata),
  named motion policy with reduced-motion support, WCAG-AA contrast.
- Replace source-text contract tests for visual surfaces with screenshot regression.
- **Gate:** measured convergence toward reference metrics **and** one explicit human review pass
  per milestone. Do not self-certify visual quality.

## Phase 5 — Organisms, antimicrobials, nutrients (G11 content gap)

- Target: 6-8 organisms (*E. coli* MG1655, *B. subtilis* 168, *S. aureus*, *P. aeruginosa*,
  *S. marcescens*, *S. cerevisiae*, *A. niger* No10, +1), 5-6 antimicrobials (ciprofloxacin and
  chloramphenicol exist; add e.g. ampicillin, kanamycin, tetracycline, rifampicin) with
  disk-diffusion/MIC behaviour plus resistance and collateral-sensitivity links, and 4-6 resources
  (glucose, glycerol, citrate, amino acids, oxygen) with uptake kinetics, plus a
  competition/interaction matrix.
- Each pack carries provenance class + DOI + strain/medium/temp/assay and uncertainty/transfer
  notes; `research/CLAIM_LEDGER.md` and parameter provenance updated in the same commit.
- **Lane discipline learned the hard way:** previous full-organism research lanes died on
  transport/wall-clock limits and left empty scaffolds that merely *parsed clean*. Work
  **per organism / per parameter family with incremental writes**, verify content (admissible
  value + citation) rather than parseability, and never commit a sheet whose values are
  `AWAITING SOURCE`.
- Where literature is thin, mark values `transferred` or `mechanistic approximation` — never
  invent a constant that merely makes a demo look better.

## Phase 6 — Long-run proof, tiers, DOX closeout

- 24-72 h simulated soak at 16× with a stated memory ceiling; verify no unbounded growth (event
  log, metric history, checkpoints, footprints, lineage count).
- Implement measured Low/Standard/High presentation tiers (#613) from real evidence.
- Replace the `blocked` `release-responsive-performance-matrix` stub with the real gate against
  `vite preview`; keep everything local.
- Fix the known-red tests; update `AGENTS.md`/DOX so the source-text-as-perf-evidence anti-pattern
  is explicitly forbidden; post evidence to #1102/#1081/#865/#869/#876/#850/#1054/#642 and close
  only what is genuinely fixed.

## Hazards and known-red items

- `research/source_sheets/` is untracked and **not** gitignored (only `_cache/` is) — `git add -A`
  would commit empty scaffolds. Never bulk-add; add explicit paths.
- Contributors with a pre-`.gitattributes` checkout must renormalize
  (`git rm --cached -r -q . && git reset --hard`, clean tree only) or EOL false-reds appear.
- Known-red before this lane started: `executionDefinition.test.ts` (snapshot-vs-sample contract —
  asserts 1 sample where the schedule yields 3), `firstAggregateBenchmark.test.ts` (row-order
  determinism deep-equal), `InterventionPlacementOverlay.test.tsx` (confirmed pre-existing).
- `FUN-YLD-034.transfer_note` misdescribes a glycerol-yield trend (numbers correct, prose wrong);
  fix prose only, and run the claim-ledger pass before committing `fungi_v1`.

## Execution tracker

- [x] Plan written and committed
- [ ] P0 `npm run build` succeeds; `vite preview` declared as release-candidate target
- [ ] P0 `tools/perf_baseline.py` exists and runs against the production bundle
- [ ] P0 baseline numbers committed; dev-vs-build split recorded; posted to #642/#850
- [ ] P1 event-history chunking — soak curve flat, late/early ≤ 1.15
- [ ] P1 `liveAnalysisHistory.snapshot()` no longer deep-clones full history
- [ ] P1 footprint incremental index (#1081)
- [ ] P1 `traceHash` unchanged (`seed_replay_matrix`)
- [ ] P2 rAF-coalesced publication; React ≤ 1 commit/frame, commit < 4 ms
- [ ] P3 per-layer cache invalidation; camera-only frames allocate no rasters/contours/selection
- [ ] P3 camera gate passes at t≈0 **and** post-growth (#1054 evidence)
- [ ] P4 `reference_metrics.json` + diff report committed
- [ ] P4 visual deltas implemented; human review pass recorded
- [ ] P5 ≥6 organisms, ≥5 antimicrobials, ≥4 resources with provenance + ledger updates
- [ ] P6 soak at 16× with memory ceiling; tiers (#613) from measured evidence
- [ ] P6 perf-matrix stub replaced; DOX anti-pattern removed; issues closed with evidence

## Progress log

Append one dated entry per meaningful checkpoint: what ran, measured numbers, what is still
unproven. Claims without a measurement under this heading are not allowed.
