# Local experiment DOX contract

## Purpose
Own Petra's **manual, laptop-only** experiment/benchmark queue and compact evidence inbox for work that agents cannot execute in their current environment.

## Hard rule: no CI
- Petra currently uses **no hosted CI at all**. Never invoke this subsystem from GitHub Actions, another CI service, scheduled hosted automation, or a required check.
- `run_local_experiments.py` must refuse common CI environments.
- Only a human operator explicitly choosing to do so runs the local experiment entrypoint after pulling the repository.

## Single human entrypoint
The one user-facing command is:

```text
python run_local_experiments.py
```

Useful options:
- `--list` shows registered experiments.
- `--only ID` limits a run to one or more registrations.
- `--push` explicitly commits and pushes **only** the newly generated compact evidence directory.

Agents must not hand the human operator a collection of unrelated experiment scripts to invoke manually. They may add implementation-specific helper scripts, but every requested laptop run must be registered in `experiments/local_manifest.json` and reachable from the single root entrypoint.

## Long-lead scheduling

Experiment readiness is project work, not an end-of-project cleanup step.

- Register known long-lead experiments and implement their helpers/output contracts as early as possible, even when execution is blocked on an explicit upstream Issue.
- A blocked registration must name the dependency that makes execution invalid today; everything independent of that dependency should already be runnable/testable.
- Prioritize work that lets the human operator start expensive laptop time immediately after pulling a prerequisite commit.
- Dataset generation, statistical replicates, calibration, model training/benchmarking, profiling, soak runs, browser acceptance, offline rehearsal, and release performance runs all belong in this queue when they require local capability.
- Long-soak evidence for compaction/performance must distinguish biological tick count from accepted-command count. When command-history growth is under investigation, compare matched biological endpoints under different command granularities, preserve exact checkpoint biology/RNG equality, and report event/payload growth separately from process-memory observations; do not choose a retention policy from timing or RSS alone.
- Real-Worker history-age evidence must isolate retained event/command position from biology when possible. The registered `worker-transport-profile` does this with zero-tick accepted advances and snapshot-only probes at fixed event frontiers, including ~625 events; compact evidence is valid only when exact composed checkpoint biology/RNG/state/metrics remain equal after deliberately excluding commandCount/history/trace identity.
- Do not discover a known expensive experiment for the first time during final release hours.
- Render-projection parity evidence is an integrity check, not biological validation. When authoritative JS-number channels are intentionally projected into Float32 renderer storage, verify exact equality to the declared `Math.fround` storage/aggregation policy and report quantization separately; preserve source units and caller-supplied runtime branch/sampling identity, and never reconstruct branch identity from checkpoint fields.
- The `render-projection-parity` experiment also covers newly authoritative transaction-bound presentation inputs when those contracts exist: accepted intervention footprints must match their accepted source events exactly (including non-point geometry and blend semantics), and runtime ecology rate projection must preserve the exact accepted step-local signed net-local rate plus non-negative division-biomass and death-biomass rates, units, mask, and displayed Float32 extrema from the same observation transaction. These checks prove transport/projection integrity only; division/death remain continuous biomass fluxes rather than literal event counts, and the gate does not establish biological efficacy, Pixi visibility, browser correctness, or performance.
- Lineage-origin `RenderEvent` parity belongs in the same `render-projection-parity` gate once source authority exists. Expected markers must be recomputed from a canonically restored lineage-registry checkpoint plus exact grid/mask/current-active lineage identity: founders/unpositioned creations are omitted, child origins use the shared row-major cell center, creation order/time/id/label stay exact, and an extinct historical marker must not retain a stale live-lineage cross-link. This is projection integrity only, not mutation-model validation or Pixi marker acceptance.
- `fungal-render-projection-parity` is a separate integrity gate for the source-validated *Aspergillus niger* no. 10 radial-front projection because that authority is intentionally not a bacterial `DishRenderSnapshot` density channel. It preserves exact taxon/content/treatment identity, biological time, physical plate/front radii, and normalized front geometry while explicitly refusing density, biomass, mature hyphal-network, resource-field, antimicrobial-response, and bacteria-fungus-interaction claims. It is projection evidence only, not fungal biological validation or browser/Pixi acceptance.
- `render-projection-parity` also exercises the fail-closed `DishSceneTransaction@v1` authority boundary after both source-specific projectors have been validated: composed scenes must preserve exact trace/runtime-branch/tick/accepted-command/time identity while reusing the already-detached dish payload by reference; standalone fungal source-validation scenes must carry no accepted composed-runtime identity; and equal biological time must never authorize combining those two sources. This is scene-authority integrity only and does not authorize mixed-live bacteria+fungus rendering; that remains gated on shared composed runtime authority under #1005/#976.
- `ml-mechanistic-dataset` is prepared around `src/ml/firstAggregateDatasetPackage.ts` and the generic `experiments/ml_mechanistic_dataset.py` launcher. Keep its manifest command fail-closed on #594 until local distinct-worker parity/multicore/resume evidence is recorded; the package-entry environment may be predeclared while blocked so activation is only a command swap, never a new human CLI or a sweep redesign.
- `ml-aggregate-benchmark` is the stable local handoff for #545. `experiments/ml_aggregate_benchmark.py` must discover only local output from the registered `ml-mechanistic-dataset` experiment, require its compact generation evidence to be complete, integrity-verified, and bound to a clean source commit, then let the bundled TypeScript runtime re-verify finalization/digest and the exact first-aggregate v2 package identity before fitting anything. If no eligible dataset exists, report the #594 blocker rather than accepting an ad-hoc path. Constant/ridge model JSON and the full benchmark stay under `PETRA_LOCAL_ARTIFACT_DIR`; compact validation/test metrics plus dataset/model digests may enter the normal tracked evidence flow, always with `promotion_evidence: false`.
- `mops-glucose-resource-calibration` may run source-inventory and checksum-pinned source-schema probe stages before the numerical calibration is scientifically ready. Those stages must pin the repository-owned Knapp Harvard Dataverse DOI/version and exact probed-file identity, keep the complete remote inventory plus downloaded raw source files under `PETRA_LOCAL_ARTIFACT_DIR`, and emit only capped provenance plus static file/schema references (for example referenced filenames and numeric-vector shapes, never source-code bodies or unreviewed biological values). MATLAB/source artifacts are data to inspect, not executable authority: do not execute deposited scripts. The experiment remains fail-closed until the exact 37 °C D-glucose numeric source variables/table, replicate identity, and uncertainty representation are reviewed. Filename/directory ranking, file references, or vector shape alone never authorize a parameter fit, a glucose interpretation of `model-resource`, or physical spatial transport.

## Registration contract
Each manifest experiment must include:
- stable `id`;
- concise `description`;
- argv-style `command` array (no shell string);
- relevant GitHub `issues`;
- optional `cwd`, `timeout_seconds`, and string `env` map.

When an Issue is blocked on local evidence, comment with:
- **WAITING ON LOCAL EXPERIMENT**;
- registration id;
- why agent/cloud execution is insufficient;
- expected compact result/acceptance signal;
- which Issue/PR should resume after evidence lands.

Do not keep renewing a work lease while merely waiting for a human laptop run.

## Artifact policy
- Git-tracked evidence belongs only under `experiments/results/<run-id>/`.
- Bulky/transient output belongs under the runner-provided `PETRA_LOCAL_ARTIFACT_DIR` inside ignored `.petra_local/`.
- Models, checkpoints, raw training datasets, browser traces, frame captures, large logs, caches, and profiling dumps stay local by default.
- The runner stores only a capped log tail plus compact JSON metadata/results in Git.
- Experiment helpers may write structured compact evidence to `PETRA_LOCAL_RESULT_JSON`; the runner embeds that JSON into the Git-tracked experiment result while bulky artifacts remain under `PETRA_LOCAL_ARTIFACT_DIR`.
- The runner enforces a per-file Git evidence size limit and refuses unexpected large evidence.
- If a large artifact is scientifically necessary to preserve, open/annotate an Issue describing it and obtain explicit human approval for external storage; do not silently commit it.

## Evidence consumption
Agents resuming blocked work must:
1. inspect the newest relevant result JSON;
2. verify run environment, command, status, and linked Issue ids;
3. distinguish measured runtime evidence from inference;
4. update the blocked Issue with what the result establishes and what remains unknown;
5. continue implementation on a fresh/current branch if the old lease expired.

## Result immutability
Do not rewrite historical result directories. A rerun creates a new UTC run id so comparisons remain auditable.
