# Tooling DOX contract

## Purpose
Deterministic local verification and developer/research tooling.

## Ownership
- Verification registry/orchestrator.
- Static provenance/config checks.
- Reproducible benchmark and regression helpers as they are added.

## Local contracts
- A checker must verify a meaningful invariant; do not generate checker churn for its own sake.
- Passing source checks are not browser, device, performance, or scientific experimental evidence.
- Browser acceptance must fail visibly when a render-enabled Pixi surface lacks a ready canvas or shows renderer fallback. Frame-time evidence must drive representative renderer redraw work; idle `requestAnimationFrame` cadence alone is not renderer performance evidence. Touch acceptance must exercise the implemented gesture (including two-pointer pinch where claimed) and observe a presentation-visible effect rather than merely dispatching an event.
- Renderer profiling in the local Chromium harness may instrument WebGL draw entrypoints and browser performance domains, but it must remain experiment-only and must not change Petra runtime/render behavior. Measure baseline frame/redraw timing before installing draw-call wrappers, then use a separate representative workload for draw/heap/jank evidence so instrumentation cost does not contaminate the timing gate. Heap/DOM/long-task records are browser-process evidence; a canvas-backing byte estimate or WebGL capability limit is a GPU workload proxy, **not** measured VRAM. Keep simulator/Worker throughput separate from renderer frame/redraw metrics.
- Worker transport profiling must use the real browser `WorkerSession` + composed Worker when judging #630 architecture. Keep its page isolated from product animation/render load, preserve profiling as observational only, and distinguish application-payload byte estimates, synchronous sender-side `postMessage()` handoff wall time, local accepted-snapshot clone wall time, worker execution time, and the broader non-worker request-window remainder. None of those observations is exact browser framing, receiver deserialization cost, link bandwidth, or proof that transferable buffers/downsampling are beneficial. Optimization requires before/after local evidence with deterministic authority preserved.
- Cross-browser release acceptance must build the current release bundle before compatibility smoke. Chromium remains the primary deep automated target. Missing optional Firefox/Safari automation is recorded as `unavailable`, never inferred as a pass; an available browser that fails a required smoke check is a failure, while not-yet-portable input/export/offline checks remain explicit `blocked` evidence.
- Offline release preflight permits loopback serving of the built static bundle while external hostname resolution is blocked in a fresh browser profile. Page HTTP(S) requests must be intercepted before Petra navigation: loopback requests may continue, while any non-loopback attempt is blocked and fails acceptance even if it never becomes a loaded resource. Required external HTML/CSS assets or observed external runtime resource loads are also failures. User-triggered citation links are not startup dependencies, and an unfinished authoritative demo flow must remain `blocked` rather than being replaced with cached/demo scientific state.
- Tools must fail clearly and avoid mutating source during verification.
- Local subprocess launchers must preserve argv arrays with `shell=False` and use `tools/local_command.py` to resolve Windows PATH/PATHEXT command shims such as `npm.cmd`; the declared command remains evidence, and a genuinely missing executable must still fail visibly.
- Verification output must identify what ran and what remains outside the current evidence boundary.
- The scenario contract check enforces normalized flagship record-level provenance for exposed genotype, resource×drug composition, mutation-transition, resource-context, and engineering execution-profile records, including class-specific source/context/transfer/limitation requirements. The flagship execution profile must remain bound to the scenario/resource-context version, exact model units, finite kernel inputs, the explicit spread-step stability bound, and the declared behavior-target set.
- The same scenario check validates the flagship `composedParameterSet`: scenario/profile/resource/loss references, model-grid engineering geometry, known founder genotype IDs, exact zero inactive drug-loss hazard for the baseline set, unique founder lineage IDs, and explicit engineering limitations.
- The run-preset contract check validates repository-owned `data/run_presets/*.json` against the run-preset schema, unsigned-32-bit seed and finite run-state bounds, exact engineering provenance, referenced flagship scenario/composed-parameter-set identity, and known founder lineage IDs before the browser default runtime may consume a preset.

## Work guidance
Prefer lightweight Python tools with no unnecessary dependencies for repository contract checks.

## Verification
Run `python tools/verify.py quick` for local contract validation.

Run `python tools/verify.py premerge` locally for the broader deterministic suite. With the TypeScript implementation substrate present, the premerge registry owns strict typechecking + Vitest through the `typescript-deterministic-suite` check.

## No hosted CI
- Petra currently has **no CI by project policy**. Do not add or restore GitHub Actions/workflows, hosted checks, scheduled jobs, or automated experiment uploads until repository maintainers explicitly lift the freeze in durable project DOX.
- Verification commands remain useful, but agents/humans run them locally and record exact evidence in the relevant Issue/PR.
- The local experiment pipeline must refuse execution inside common CI environments; it is designed for the maintainer/local experiment machine, not hosted runners.
- Any future change to this rule requires an explicit repository-wide DOX update, not an agent convenience decision.

## Local experiment handoff
- There must be one human-facing laptop entrypoint for registered benchmarks/experiments.
- Agents add registrations/metadata to that system instead of inventing separate user-facing scripts.
- Compact summaries/results are Git-tracked in a canonical evidence folder; large checkpoints/models/raw datasets/profiling dumps remain local.
- Blocked Issues should state the experiment registration/id and resume when compact evidence is pushed back to GitHub.

## Child DOX index
No child contracts yet.


## Human laptop entrypoint
The single manual experiment entrypoint is `python run_local_experiments.py`, governed by `experiments/AGENTS.md`. Register requested hardware/browser/GPU/ML/scientific runs in `experiments/local_manifest.json`; do not create alternative user-facing runbooks for a specific person.
