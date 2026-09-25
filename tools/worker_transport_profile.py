#!/usr/bin/env python3
"""Local real-Worker transport profile for Petra.

Starts a minimal Vite page plus Chrome/Chromium, imports Petra's actual browser
WorkerSession and flagship composed run-plan boundary, executes a deterministic
advance workload plus a matched-biological-state event-history-age probe, and
writes compact observational transport evidence through PETRA_LOCAL_RESULT_JSON.

This helper intentionally does not choose an optimization. It exists to make
#630's before/after evidence runnable before transferable buffers, downsampling,
or extra worker complexity are considered.
"""

from __future__ import annotations

import json
import math
import os
import statistics
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from expo_browser_acceptance import CDP, browser_path, wait_http
from local_command import resolve_local_command

ROOT = Path(__file__).resolve().parents[1]
HOST = "127.0.0.1"
VITE_PORT = 4175
CDP_PORT = 9225
TARGET_URL = "http://{}:{}/tools/worker_transport_profile.html".format(HOST, VITE_PORT)
RESULT_JSON = Path(
    os.environ.get(
        "PETRA_LOCAL_RESULT_JSON",
        ROOT / ".petra_local" / "manual" / "worker-transport-profile.json",
    )
)
DEFAULT_ADVANCE_TICKS = (1, 4, 16, 64, 64, 64, 64, 64)
PROFILE_SEED = 0x00630630
HISTORY_AGE_FRONTIERS = (1, 64, 256, 625)
HISTORY_AGE_PROBE_REPEATS = 5


def parse_advance_ticks(raw: str | None) -> list[int]:
    if raw is None or raw.strip() == "":
        return list(DEFAULT_ADVANCE_TICKS)
    values: list[int] = []
    for part in raw.split(","):
        text = part.strip()
        if not text:
            continue
        value = int(text)
        if value <= 0 or value > 1_000_000:
            raise ValueError(
                "PETRA_WORKER_PROFILE_ADVANCE_TICKS values must be integers in [1, 1000000]"
            )
        values.append(value)
    if len(values) < 4:
        raise ValueError(
            "PETRA_WORKER_PROFILE_ADVANCE_TICKS must provide at least four advance commands"
        )
    return values


def new_page() -> CDP:
    query = urllib.parse.quote(TARGET_URL, safe=":/?=&")
    request = urllib.request.Request(
        "http://{}:{}/json/new?{}".format(HOST, CDP_PORT, query),
        method="PUT",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        target = json.load(response)
    return CDP(target["webSocketDebuggerUrl"])


def profile_expression(advance_ticks: list[int]) -> str:
    source = r"""
(async () => {
  const [
    workerModule,
    flagshipModule,
    protocolModule,
    instrumentationModule,
    summaryModule,
    traceModule,
  ] = await Promise.all([
    import("/src/app/workerSession.ts"),
    import("/src/sim/flagshipComposition.ts"),
    import("/src/sim/protocol.ts"),
    import("/src/worker/performanceInstrumentation.ts"),
    import("/src/app/workerPerformanceSummary.ts"),
    import("/src/sim/snapshotTrace.ts"),
  ]);

  const samples = [];
  const plan = flagshipModule.buildFlagshipComposedRunPlan({
    seed: __PROFILE_SEED__,
    initialResourceLevel: 8,
    inocula: [
      {
        lineageId: "founder-wt",
        x: 80,
        y: 80,
        biomass: 1,
      },
    ],
  });

  const session = workerModule.createSimulationWorkerSession({
    observe: (sample) => samples.push(structuredClone(sample)),
  });

  const waitForReady = (targetSession, label) =>
    new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = window.setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for " + label));
      }, 120000);
      unsubscribe = targetSession.subscribe((state) => {
        if (state.phase === "ready") {
          window.clearTimeout(timer);
          unsubscribe();
          resolve(state);
          return;
        }
        if (state.phase === "error") {
          window.clearTimeout(timer);
          unsubscribe();
          reject(new Error(label + " failed: " + String(state.error)));
        }
      });
    });

  const historyAgeFrontiers = __HISTORY_AGE_FRONTIERS__;

  const runHistoryAgeProfile = async () => {
    const probeRepeatCount = __HISTORY_AGE_PROBE_REPEATS__;
    const probeIds = new Set(
      historyAgeFrontiers.flatMap((frontier) =>
        Array.from(
          { length: probeRepeatCount },
          (_, repeat) =>
            "history-probe-" + String(frontier) + "-" + String(repeat),
        ),
      ),
    );
    const probeSamples = new Map();
    const warmup = {
      sampleCount: 0,
      totalResponsePayloadBytes: 0,
      maxResponsePayloadBytes: 0,
      totalWorkerExecutionMs: 0,
      maxWorkerExecutionMs: 0,
      totalRoundTripMs: 0,
      maxRoundTripMs: 0,
    };
    const historySession = workerModule.createSimulationWorkerSession({
      observe: (sample) => {
        if (sample.commandId !== null && probeIds.has(sample.commandId)) {
          probeSamples.set(sample.commandId, structuredClone(sample));
          return;
        }
        if (
          sample.commandId !== null &&
          sample.commandId.startsWith("history-warmup-")
        ) {
          warmup.sampleCount += 1;
          const responseBytes = sample.responsePayloadBytes ?? 0;
          warmup.totalResponsePayloadBytes += responseBytes;
          warmup.maxResponsePayloadBytes = Math.max(
            warmup.maxResponsePayloadBytes,
            responseBytes,
          );
          const workerMs = sample.workerExecutionMs ?? 0;
          warmup.totalWorkerExecutionMs += workerMs;
          warmup.maxWorkerExecutionMs = Math.max(
            warmup.maxWorkerExecutionMs,
            workerMs,
          );
          warmup.totalRoundTripMs += sample.roundTripMs;
          warmup.maxRoundTripMs = Math.max(
            warmup.maxRoundTripMs,
            sample.roundTripMs,
          );
        }
      },
    });

    const command = async (payload, label) => {
      historySession.enqueue([
        {
          protocolVersion: protocolModule.PROTOCOL_VERSION,
          type: "command",
          command: payload,
        },
      ]);
      await waitForReady(historySession, label);
    };

    const biologyCanonical = (checkpoint) => {
      const biological = structuredClone(checkpoint);
      delete biological.commandCount;
      return traceModule.stableSnapshotStringify(biological);
    };

    try {
      historySession.enqueue([
        {
          protocolVersion: protocolModule.PROTOCOL_VERSION,
          type: "initialize",
          identity: plan.identity,
          composedConfig: plan.config,
        },
      ]);
      await waitForReady(historySession, "history-age initialization");

      const probes = [];
      let baselineBiology = null;

      for (const frontier of historyAgeFrontiers) {
        while (
          historySession.state.latestSnapshot !== null &&
          historySession.state.latestSnapshot.events.length < frontier
        ) {
          const nextEventCount =
            historySession.state.latestSnapshot.events.length + 1;
          await command(
            {
              id: "history-warmup-" + String(nextEventCount),
              type: "advance",
              ticks: 0,
            },
            "history warmup " + String(nextEventCount),
          );
        }

        const beforeProbe = historySession.state.latestSnapshot;
        if (
          beforeProbe === null ||
          beforeProbe.checkpoint.authority !== "composed" ||
          beforeProbe.events.length !== frontier
        ) {
          throw new Error(
            "history-age workload failed to reach exact event frontier " +
              String(frontier),
          );
        }

        const frontierSamples = [];
        for (let repeat = 0; repeat < probeRepeatCount; repeat += 1) {
          const commandId =
            "history-probe-" + String(frontier) + "-" + String(repeat);
          await command(
            { id: commandId, type: "snapshot" },
            "history probe " + String(frontier) + " repeat " + String(repeat),
          );

          const sample = probeSamples.get(commandId);
          if (sample === undefined) {
            throw new Error(
              "history-age probe is missing WorkerSession performance evidence",
            );
          }
          if (sample.authoritativeEventArrayLength !== frontier) {
            throw new Error(
              "history-age performance sample event frontier does not match authoritative snapshot",
            );
          }
          frontierSamples.push({
            responsePayloadBytes: sample.responsePayloadBytes,
            senderPostMessageCallMs: sample.senderPostMessageCallMs,
            mainThreadSnapshotCloneMs: sample.mainThreadSnapshotCloneMs,
            roundTripMs: sample.roundTripMs,
            workerExecutionMs: sample.workerExecutionMs,
            nonWorkerRoundTripMs: sample.nonWorkerRoundTripMs,
            authoritativeEventArrayLength:
              sample.authoritativeEventArrayLength,
          });
        }

        const snapshot = historySession.state.latestSnapshot;
        if (
          snapshot === null ||
          snapshot.checkpoint.authority !== "composed"
        ) {
          throw new Error(
            "history-age probe requires a composed authoritative snapshot",
          );
        }
        if (snapshot.events.length !== frontier) {
          throw new Error(
            "snapshot-only history probe changed authoritative event count",
          );
        }
        if (snapshot.checkpoint.commandCount !== frontier - 1) {
          throw new Error(
            "history-age workload command position does not match zero-tick event growth",
          );
        }

        const canonical = biologyCanonical(snapshot.checkpoint);
        if (baselineBiology === null) {
          baselineBiology = canonical;
        } else if (canonical !== baselineBiology) {
          throw new Error(
            "history-age probe biological checkpoint changed while only zero-tick history growth was allowed",
          );
        }

        probes.push({
          eventCount: snapshot.events.length,
          eventPayloadBytes: instrumentationModule.estimateStructuredClonePayloadBytes(
            snapshot.events,
          ),
          reconstructedFullSnapshotBytes:
            instrumentationModule.estimateStructuredClonePayloadBytes(snapshot),
          checkpoint: {
            tick: snapshot.checkpoint.tick,
            simulationTimeHours: snapshot.checkpoint.simulationTimeHours,
            commandCount: snapshot.checkpoint.commandCount,
          },
          performanceSamples: frontierSamples,
        });
      }

      return {
        classification: "matched-biological-state-history-age",
        frontiers: historyAgeFrontiers,
        biologicalStateExactMatch: true,
        biologicalEqualityExcludes: [
          "checkpoint.commandCount",
          "snapshot.events",
          "snapshot.traceHash",
        ],
        probeCommand: "snapshot",
        probeRepeatCount,
        historyGrowthCommand: {
          type: "advance",
          ticks: 0,
          biologicalMeaning:
            "accepted command/event history growth with no biological tick/time/state advance",
        },
        warmup,
        probes,
      };
    } finally {
      historySession.dispose();
    }
  };

  try {
    session.enqueue([
      {
        protocolVersion: protocolModule.PROTOCOL_VERSION,
        type: "initialize",
        identity: plan.identity,
        composedConfig: plan.config,
      },
    ]);
    await waitForReady(session, "composed worker initialization");

    const advanceTicks = __ADVANCE_TICKS__;
    for (let index = 0; index < advanceTicks.length; index += 1) {
      const ticks = advanceTicks[index];
      session.enqueue([
        {
          protocolVersion: protocolModule.PROTOCOL_VERSION,
          type: "command",
          command: {
            id: "transport-profile-" + String(index),
            type: "advance",
            ticks,
          },
        },
      ]);
      await waitForReady(session, "advance " + String(index));
    }

    const historyAgeProfile = await runHistoryAgeProfile();

    const finalSnapshot = session.state.latestSnapshot;
    if (
      finalSnapshot === null ||
      finalSnapshot.checkpoint.authority !== "composed"
    ) {
      throw new Error("transport profile requires a final composed authoritative snapshot");
    }

    const estimate = instrumentationModule.estimateStructuredClonePayloadBytes;
    const checkpoint = finalSnapshot.checkpoint;
    const state = checkpoint.composedState;
    const lineageChannels = state.lineageBiomass.map((channel, index) => ({
      lineageId: state.lineageIds[index],
      genotypeId: state.genotypeIds[index],
      bytes: estimate(channel),
    }));

    // Lower-bound candidate for renderer-facing channel transport only.
    // This deliberately estimates the dominant typed scientific arrays without
    // claiming a complete DishRenderSnapshot wire format or moving projection
    // authority into the Worker.
    const candidateDishMask = Uint8Array.from(state.mask);
    const candidateResource = Float32Array.from(state.resource);
    const candidateCiprofloxacin = Float32Array.from(
      state.ciprofloxacinConcentrationMgPerL,
    );
    const candidateLineageBiomass = state.lineageBiomass.map((channel) =>
      Float32Array.from(channel),
    );
    const candidateAggregateBiomass = new Float32Array(
      state.width * state.height,
    );
    for (const channel of candidateLineageBiomass) {
      for (let cell = 0; cell < candidateAggregateBiomass.length; cell += 1) {
        candidateAggregateBiomass[cell] = Math.fround(
          candidateAggregateBiomass[cell] + channel[cell],
        );
      }
    }
    const candidateDishTypedChannels = {
      mask: candidateDishMask,
      biomass: candidateAggregateBiomass,
      resource: candidateResource,
      ciprofloxacin: candidateCiprofloxacin,
      lineageBiomass: candidateLineageBiomass,
    };
    const fullSnapshotBytes = estimate(finalSnapshot);
    const candidateDishTypedChannelBytes = estimate(
      candidateDishTypedChannels,
    );

    return {
      browser: {
        userAgent: navigator.userAgent,
        hardwareConcurrency: navigator.hardwareConcurrency ?? null,
        deviceMemoryGiB: navigator.deviceMemory ?? null,
        crossOriginIsolated: window.crossOriginIsolated,
      },
      identity: structuredClone(plan.identity),
      configurationFingerprint:
        plan.parameterSetBinding.configurationFingerprint,
      workload: {
        seed: __PROFILE_SEED__,
        advanceTicks,
        totalAdvanceTicks: advanceTicks.reduce((sum, value) => sum + value, 0),
        initialization: {
          classification: "engineering/model-resource",
          initialResourceLevel: 8,
          founder: {
            lineageId: "founder-wt",
            x: 80,
            y: 80,
            biomass: 1,
          },
        },
      },
      summary: summaryModule.summarizeWorkerPerformance(samples),
      samples,
      historyAgeProfile,
      initializeConfigPayloadBreakdownBytes: {
        fullConfig: estimate(plan.config),
        mask: estimate(plan.config.mask),
        initialResource: estimate(plan.config.initialResource),
        ciprofloxacinConcentrationMgPerL: estimate(
          plan.config.ciprofloxacinConcentrationMgPerL,
        ),
        initialLineageBiomassTotal: plan.config.initialLineageBiomass.reduce(
          (sum, channel) => sum + estimate(channel),
          0,
        ),
        growth: estimate(plan.config.growth),
        lineages: estimate(plan.config.lineages),
        evolutionGraph: estimate(plan.config.evolutionGraph),
        ciprofloxacin: estimate(plan.config.ciprofloxacin),
      },
      candidateDishTypedChannelPayloadEstimateBytes: {
        classification: "hypothetical-renderer-channel-lower-bound",
        totalTypedChannels: candidateDishTypedChannelBytes,
        ratioToFullAuthoritativeSnapshot:
          fullSnapshotBytes === 0
            ? null
            : candidateDishTypedChannelBytes / fullSnapshotBytes,
        mask: estimate(candidateDishMask),
        aggregateBiomass: estimate(candidateAggregateBiomass),
        resource: estimate(candidateResource),
        ciprofloxacin: estimate(candidateCiprofloxacin),
        lineageBiomassTotal: candidateLineageBiomass.reduce(
          (sum, channel) => sum + estimate(channel),
          0,
        ),
        lineageChannels: candidateLineageBiomass.map((channel, index) => ({
          lineageId: state.lineageIds[index],
          genotypeId: state.genotypeIds[index],
          bytes: estimate(channel),
        })),
      },
      finalSnapshotPayloadBreakdownBytes: {
        fullSnapshot: fullSnapshotBytes,
        checkpoint: estimate(checkpoint),
        identity: estimate(checkpoint.identity),
        composedState: estimate(state),
        mask: estimate(state.mask),
        resource: estimate(state.resource),
        lineageBiomassTotal: state.lineageBiomass.reduce(
          (sum, channel) => sum + estimate(channel),
          0,
        ),
        lineageChannels,
        metrics: estimate(checkpoint.metrics),
        events: estimate(finalSnapshot.events),
        traceHash: estimate(finalSnapshot.traceHash),
      },
      finalCheckpoint: {
        tick: checkpoint.tick,
        commandCount: checkpoint.commandCount,
        simulationTimeHours: checkpoint.simulationTimeHours,
        eventCount: finalSnapshot.events.length,
        traceHash: finalSnapshot.traceHash,
      },
    };
  } finally {
    session.dispose();
  }
})()
"""
    return (
        source.replace("__ADVANCE_TICKS__", json.dumps(advance_ticks))
        .replace("__PROFILE_SEED__", str(PROFILE_SEED))
        .replace("__HISTORY_AGE_FRONTIERS__", json.dumps(HISTORY_AGE_FRONTIERS))
        .replace("__HISTORY_AGE_PROBE_REPEATS__", str(HISTORY_AGE_PROBE_REPEATS))
    )


def timing_stats(samples: list[dict[str, Any]], field: str) -> dict[str, Any]:
    values = [
        float(item[field])
        for item in samples
        if isinstance(item.get(field), (int, float))
        and math.isfinite(float(item[field]))
    ]
    if not values:
        return {"count": 0, "mean": None, "p50": None, "p95": None, "max": None}
    ordered = sorted(values)

    def nearest_rank(percentile: float) -> float:
        rank = max(1, math.ceil(percentile * len(ordered)))
        return ordered[rank - 1]

    return {
        "count": len(ordered),
        "mean": statistics.fmean(ordered),
        "p50": nearest_rank(0.50),
        "p95": nearest_rank(0.95),
        "max": ordered[-1],
    }


def history_age_statistics(probes: list[dict[str, Any]]) -> dict[str, Any]:
    fields_ms = (
        "senderPostMessageCallMs",
        "mainThreadSnapshotCloneMs",
        "roundTripMs",
        "workerExecutionMs",
        "nonWorkerRoundTripMs",
    )
    summarized: list[dict[str, Any]] = []
    for probe in probes:
        samples = probe["performanceSamples"]
        summarized.append(
            {
                "event_count": probe["eventCount"],
                "event_payload_bytes": probe["eventPayloadBytes"],
                "reconstructed_full_snapshot_bytes": probe[
                    "reconstructedFullSnapshotBytes"
                ],
                "checkpoint": probe["checkpoint"],
                "response_payload_bytes": timing_stats(
                    samples, "responsePayloadBytes"
                ),
                "timing_ms": {
                    field: timing_stats(samples, field) for field in fields_ms
                },
            }
        )

    early = summarized[0]
    late = summarized[-1]

    def p50_ratio(field: str) -> float | None:
        early_value = early["timing_ms"][field]["p50"]
        late_value = late["timing_ms"][field]["p50"]
        if (
            not isinstance(early_value, (int, float))
            or not isinstance(late_value, (int, float))
            or early_value <= 0
        ):
            return None
        return float(late_value) / float(early_value)

    early_payload = early["response_payload_bytes"]["p50"]
    late_payload = late["response_payload_bytes"]["p50"]
    payload_ratio = (
        None
        if not isinstance(early_payload, (int, float))
        or not isinstance(late_payload, (int, float))
        or early_payload <= 0
        else float(late_payload) / float(early_payload)
    )

    return {
        "probes": summarized,
        "early_to_late": {
            "early_event_count": early["event_count"],
            "late_event_count": late["event_count"],
            "response_payload_p50_ratio": payload_ratio,
            "sender_post_message_p50_ratio": p50_ratio(
                "senderPostMessageCallMs"
            ),
            "main_thread_materialization_p50_ratio": p50_ratio(
                "mainThreadSnapshotCloneMs"
            ),
            "round_trip_p50_ratio": p50_ratio("roundTripMs"),
            "worker_execution_p50_ratio": p50_ratio("workerExecutionMs"),
            "non_worker_round_trip_p50_ratio": p50_ratio(
                "nonWorkerRoundTripMs"
            ),
        },
    }


def write_result(result: dict[str, Any]) -> None:
    RESULT_JSON.parent.mkdir(parents=True, exist_ok=True)
    RESULT_JSON.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def main() -> int:
    advance_ticks = parse_advance_ticks(
        os.environ.get("PETRA_WORKER_PROFILE_ADVANCE_TICKS")
    )
    chrome = browser_path()
    user_data = tempfile.TemporaryDirectory(prefix="petra-worker-transport-cdp-")
    vite: subprocess.Popen[bytes] | None = None
    browser: subprocess.Popen[bytes] | None = None
    cdp: CDP | None = None

    try:
        vite = subprocess.Popen(
            resolve_local_command(
                [
                    "npm",
                    "run",
                    "dev",
                    "--",
                    "--host",
                    HOST,
                    "--port",
                    str(VITE_PORT),
                    "--strictPort",
                ]
            ),
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_http(TARGET_URL)

        browser = subprocess.Popen(
            [
                chrome,
                "--headless=new",
                "--remote-debugging-port={}".format(CDP_PORT),
                "--user-data-dir={}".format(user_data.name),
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-sync",
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_http("http://{}:{}/json/version".format(HOST, CDP_PORT))
        with urllib.request.urlopen(
            "http://{}:{}/json/version".format(HOST, CDP_PORT),
            timeout=5,
        ) as response:
            browser_version = json.load(response)

        cdp = new_page()
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Page.navigate", {"url": TARGET_URL})
        time.sleep(0.25)

        profile = cdp.eval(
            profile_expression(advance_ticks),
            await_promise=True,
        )
        if not isinstance(profile, dict):
            raise RuntimeError("browser transport profile did not return an object")
        samples = profile.get("samples")
        if not isinstance(samples, list):
            raise RuntimeError("browser transport profile did not return samples")
        expected_samples = len(advance_ticks) + 1
        if len(samples) != expected_samples:
            raise RuntimeError(
                "expected {} Worker performance samples, received {}".format(
                    expected_samples, len(samples)
                )
            )
        if any(item.get("outcome") != "success" for item in samples):
            raise RuntimeError("one or more Worker transport samples were not successful")

        history_age = profile.get("historyAgeProfile")
        if not isinstance(history_age, dict):
            raise RuntimeError("browser transport profile did not return history-age evidence")
        if history_age.get("biologicalStateExactMatch") is not True:
            raise RuntimeError("history-age workload did not preserve exact biological state")
        probes = history_age.get("probes")
        if not isinstance(probes, list) or len(probes) != len(HISTORY_AGE_FRONTIERS):
            raise RuntimeError("history-age workload returned an incomplete probe set")
        observed_frontiers = [item.get("eventCount") for item in probes if isinstance(item, dict)]
        for item in probes:
            if not isinstance(item, dict):
                raise RuntimeError("history-age workload returned a malformed probe")
            performance_samples = item.get("performanceSamples")
            if (
                not isinstance(performance_samples, list)
                or len(performance_samples) != HISTORY_AGE_PROBE_REPEATS
            ):
                raise RuntimeError(
                    "history-age workload returned an incomplete repeated probe"
                )
        if observed_frontiers != list(HISTORY_AGE_FRONTIERS):
            raise RuntimeError(
                "history-age workload frontiers do not match the registered workload: {}".format(
                    observed_frontiers
                )
            )

        result = {
            "schema_version": 2,
            "kind": "petra-worker-transport-profile",
            "status": "passed",
            "target_url": TARGET_URL,
            "browser_executable": chrome,
            "browser_version": browser_version.get("Browser"),
            "profile": profile,
            "timing_statistics_ms": {
                field: timing_stats(samples, field)
                for field in (
                    "senderPostMessageCallMs",
                    "mainThreadSnapshotCloneMs",
                    "roundTripMs",
                    "workerExecutionMs",
                    "nonWorkerRoundTripMs",
                )
            },
            "history_age_statistics": history_age_statistics(probes),
            "evidence_boundary": (
                "This local Chromium run drives Petra's real provenance-bound composed Worker "
                "through WorkerSession. request/response payload bytes are application-data "
                "estimates, not exact browser framing. senderPostMessageCallMs measures only "
                "the synchronous sender-side postMessage handoff visible on the main thread; "
                "mainThreadSnapshotCloneMs retains its legacy name and measures WorkerSession's local "
                "accepted-snapshot ownership/materialization work. The matched-biological-state historyAgeProfile "
                "grows only accepted command/event history using zero-tick advances, then uses snapshot-only "
                "probes at fixed event frontiers; it requires exact checkpoint biology/RNG/state/metrics equality "
                "after excluding commandCount, events, and traceHash by design. nonWorkerRoundTripMs is a broader "
                "request-window remainder that also "
                "contains browser scheduling, response transport/deserialization, validation, "
                "and main-thread handling. candidateDishTypedChannelPayloadEstimateBytes is "
                "an arrays-only lower-bound estimate for renderer-facing mask/biomass/resource/drug/"
                "lineage channels projected into Uint8/Float32 storage; it is not a currently transferred "
                "payload, a complete DishRenderSnapshot wire contract, or evidence that Worker-side "
                "projection/downsampling is beneficial. None of these values is link bandwidth or direct VRAM. "
                "Headless local-browser measurements are architecture evidence, not a release-tier "
                "performance guarantee; any transport optimization still requires measured "
                "before/after comparison with deterministic authority unchanged."
            ),
        }
        write_result(result)
        print(
            json.dumps(
                {
                    "status": "passed",
                    "samples": len(samples),
                    "total_advance_ticks": sum(advance_ticks),
                    "response_payload_bytes": profile.get("summary", {}).get(
                        "totalResponsePayloadBytes"
                    ),
                    "history_age_frontiers": list(HISTORY_AGE_FRONTIERS),
                    "history_age_probe_repeats": HISTORY_AGE_PROBE_REPEATS,
                },
                sort_keys=True,
            )
        )
        return 0
    except Exception as exc:
        result = {
            "schema_version": 2,
            "kind": "petra-worker-transport-profile",
            "status": "failed",
            "target_url": TARGET_URL,
            "browser_executable": chrome,
            "error": repr(exc),
            "evidence_boundary": (
                "The profile failed before valid compact Worker transport evidence was produced. "
                "No architecture or optimization conclusion should be drawn from this result."
            ),
        }
        write_result(result)
        print(json.dumps({"status": "failed", "error": repr(exc)}, sort_keys=True))
        return 1
    finally:
        if cdp is not None:
            cdp.close()
        for process in (browser, vite):
            if process is not None and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
        user_data.cleanup()


if __name__ == "__main__":
    raise SystemExit(main())
