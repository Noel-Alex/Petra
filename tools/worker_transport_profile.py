#!/usr/bin/env python3
"""Local real-Worker transport profile for Petra.

Starts a minimal Vite page plus Chrome/Chromium, imports Petra's actual browser
WorkerSession and flagship composed run-plan boundary, executes a deterministic
advance workload, and writes compact observational transport evidence through
PETRA_LOCAL_RESULT_JSON.

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
  ] = await Promise.all([
    import("/src/app/workerSession.ts"),
    import("/src/sim/flagshipComposition.ts"),
    import("/src/sim/protocol.ts"),
    import("/src/worker/performanceInstrumentation.ts"),
    import("/src/app/workerPerformanceSummary.ts"),
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

  const waitForReady = (label) =>
    new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timer = window.setTimeout(() => {
        unsubscribe();
        reject(new Error("Timed out waiting for " + label));
      }, 30000);
      unsubscribe = session.subscribe((state) => {
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

  try {
    session.enqueue([
      {
        protocolVersion: protocolModule.PROTOCOL_VERSION,
        type: "initialize",
        identity: plan.identity,
        composedConfig: plan.config,
      },
    ]);
    await waitForReady("composed worker initialization");

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
      await waitForReady("advance " + String(index));
    }

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
      finalSnapshotPayloadBreakdownBytes: {
        fullSnapshot: estimate(finalSnapshot),
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
            resolve_local_command([
                "npm",
                "run",
                "dev",
                "--",
                "--host",
                HOST,
                "--port",
                str(VITE_PORT),
                "--strictPort",
            ]),
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

        result = {
            "schema_version": 1,
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
            "evidence_boundary": (
                "This local Chromium run drives Petra's real provenance-bound composed Worker "
                "through WorkerSession. request/response payload bytes are application-data "
                "estimates, not exact browser framing. senderPostMessageCallMs measures only "
                "the synchronous sender-side postMessage handoff visible on the main thread; "
                "mainThreadSnapshotCloneMs measures only WorkerSession's local accepted-snapshot "
                "copy. nonWorkerRoundTripMs is a broader request-window remainder that also "
                "contains browser scheduling, response transport/deserialization, validation, "
                "and main-thread handling. None of these values is link bandwidth or direct VRAM. "
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
                },
                sort_keys=True,
            )
        )
        return 0
    except Exception as exc:
        result = {
            "schema_version": 1,
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
