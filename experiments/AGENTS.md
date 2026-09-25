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
- Do not discover a known expensive experiment for the first time during final release hours.
- Render-projection parity evidence is an integrity check, not biological validation. When authoritative JS-number channels are intentionally projected into Float32 renderer storage, verify exact equality to the declared `Math.fround` storage/aggregation policy and report the resulting quantization separately; preserve source units and caller-supplied runtime branch/sampling identity, and do not reconstruct branch identity from checkpoint fields.

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
