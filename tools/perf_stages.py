#!/usr/bin/env python3
"""Petra staged performance probe.

Phase 0 of ``docs/PERFORMANCE_AND_PRODUCT_PLAN.md``.

Why this exists: the recorded browser acceptance evidence has
``performance: renderer ready`` as **fail**, which makes ``performance_pass``
return before measuring a single frame, and every downstream workload is
reported as ``blocked``/``idle`` with
``{"canvas": false, "source": "awaiting-authoritative-snapshot", "status": "idle"}``.
The final error is ``Authoritative runtime is not ready: status 'starting'``.
So this repo has never produced a frame-time number, and the reason was never
diagnosed.

Stages:
  probe - start a target, capture console/exception traffic, report WebGL
          capability and authoritative-runtime readiness transitions.
  full  - (added once probe is green) staged camera workloads at low and high
          simulation age.

The browser is launched with software-WebGL flags because headless Chrome does
not expose a usable WebGL context by default, and Pixi cannot create a canvas
without one. The measured target defaults to the **production preview bundle**,
not the dev server, because a dev-server frame time is not a release-candidate
measurement.

Usage:
  py tools/perf_stages.py --stage probe --serve preview
  py tools/perf_stages.py --stage probe --serve dev
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Any

TOOLS_DIR = Path(__file__).resolve().parent
ROOT = TOOLS_DIR.parent
if str(TOOLS_DIR) not in sys.path:
    sys.path.insert(0, str(TOOLS_DIR))

from local_command import resolve_local_command  # noqa: E402
from expo_browser_acceptance import (  # noqa: E402
    CDP_PORT,
    HOST,
    TARGET_URL,
    VITE_PORT,
    CDP,
    browser_path,
    new_page,
    run_control_state,
    wait_http,
)

# Headless Chrome has no usable GPU by default; Pixi needs a real WebGL context
# or the renderer never leaves "idle" and every perf workload silently no-ops.
CHROME_FLAGS = [
    "--headless=new",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--disable-gpu-sandbox",
    "--window-size=1440,900",
]

ERROR_COLLECTOR = """
globalThis.__petraProbeErrors = [];
window.addEventListener('error', (event) => {
  globalThis.__petraProbeErrors.push({
    kind: 'error',
    message: event.message ?? null,
    source: event.filename ?? null,
    line: event.lineno ?? null,
  });
});
window.addEventListener('unhandledrejection', (event) => {
  globalThis.__petraProbeErrors.push({
    kind: 'rejection',
    message: String(event.reason?.message ?? event.reason ?? 'unknown').slice(0, 400),
  });
});
const originalError = console.error;
console.error = (...args) => {
  globalThis.__petraProbeErrors.push({
    kind: 'console',
    message: args.map((a) => String(a).slice(0, 200)).join(' ').slice(0, 400),
  });
  originalError.apply(console, args);
};
"""

WEBGL_PROBE = """(() => {
  const canvas = document.createElement('canvas');
  const gl2 = canvas.getContext('webgl2');
  const gl1 = gl2 ? null : canvas.getContext('webgl');
  const gl = gl2 || gl1;
  if (!gl) return { webgl2: false, webgl1: false, vendor: null, renderer: null };
  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  return {
    webgl2: Boolean(gl2),
    webgl1: Boolean(gl1),
    vendor: debug ? gl.getParameter(debug.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
    renderer: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
  };
})()"""


def start_target(serve: str) -> subprocess.Popen[bytes]:
    if serve == "preview":
        argv = ["npm", "run", "preview", "--", "--host", HOST, "--port", str(VITE_PORT), "--strictPort"]
    else:
        argv = ["npm", "run", "dev", "--", "--host", HOST, "--port", str(VITE_PORT), "--strictPort"]
    return subprocess.Popen(
        resolve_local_command(argv),
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def readiness_timeline(cdp: CDP, timeout: float) -> list[dict[str, Any]]:
    """Poll run-control state, recording every observable transition."""
    timeline: list[dict[str, Any]] = []
    deadline = time.monotonic() + timeout
    started = time.monotonic()
    previous: str | None = None
    while time.monotonic() < deadline:
        state = run_control_state(cdp)
        signature = json.dumps(state, sort_keys=True) if state else None
        if signature != previous:
            timeline.append(
                {"elapsedMs": int((time.monotonic() - started) * 1000), "state": state}
            )
            previous = signature
        if state and state.get("status") == "ready":
            return timeline
        time.sleep(0.2)
    return timeline


def stage_probe(cdp: CDP, ready_timeout: float) -> dict[str, Any]:
    cdp.call("Page.enable")
    cdp.call("Runtime.enable")
    cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": ERROR_COLLECTOR})
    cdp.call("Page.navigate", {"url": TARGET_URL})

    dom_ready = False
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        if cdp.eval(
            "document.readyState === 'complete' && document.querySelector('.petra-app') !== null"
        ):
            dom_ready = True
            break
        time.sleep(0.1)

    timeline = readiness_timeline(cdp, ready_timeout)
    final_state = run_control_state(cdp)
    return {
        "target_url": TARGET_URL,
        "dom_ready": dom_ready,
        "webgl": cdp.eval(WEBGL_PROBE),
        "readiness_timeout_seconds": ready_timeout,
        "readiness_reached": bool(final_state and final_state.get("status") == "ready"),
        "readiness_timeline": timeline,
        "final_state": final_state,
        "page_errors": cdp.eval("globalThis.__petraProbeErrors ?? []"),
        "canvas_count": cdp.eval("document.querySelectorAll('canvas').length"),
        "renderer_shell_dataset": cdp.eval(
            """(() => {
              const shell = document.querySelector('.dish-renderer-shell');
              const canvas = document.querySelector('.dish-renderer-canvas');
              return {
                shell: shell ? { renderSource: shell.dataset.renderSource ?? null } : null,
                canvas: canvas ? { renderStatus: canvas.dataset.renderStatus ?? null } : null,
              };
            })()"""
        ),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stage", choices=["probe"], default="probe")
    parser.add_argument("--serve", choices=["preview", "dev"], default="preview")
    parser.add_argument("--ready-timeout", type=float, default=60.0)
    parser.add_argument("--out", default=str(ROOT / ".petra_local" / "perf-probe.json"))
    args = parser.parse_args()

    chrome = browser_path()
    user_data = tempfile.TemporaryDirectory(prefix="petra-perf-")
    target: subprocess.Popen[bytes] | None = None
    browser: subprocess.Popen[bytes] | None = None
    cdp: CDP | None = None
    result: dict[str, Any] = {"stage": args.stage, "serve": args.serve, "chrome": chrome}

    try:
        target = start_target(args.serve)
        wait_http(TARGET_URL, timeout=60)
        browser = subprocess.Popen(
            [
                chrome,
                f"--remote-debugging-port={CDP_PORT}",
                f"--user-data-dir={user_data.name}",
                "--no-first-run",
                "--no-default-browser-check",
                "--disable-background-networking",
                "--disable-component-update",
                "--disable-sync",
                *CHROME_FLAGS,
                "about:blank",
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_http(f"http://{HOST}:{CDP_PORT}/json/version", timeout=30)
        cdp = new_page()
        result.update(stage_probe(cdp, args.ready_timeout))
    except Exception as exc:  # noqa: BLE001 - evidence must survive failure
        result["error"] = repr(exc)
    finally:
        if cdp:
            cdp.close()
        for proc in (browser, target):
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        user_data.cleanup()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    printable = {
        key: result[key]
        for key in ("serve", "dom_ready", "webgl", "readiness_reached", "canvas_count", "error")
        if key in result
    }
    print(json.dumps(printable, indent=2))
    print(f"full evidence -> {out}")
    return 0 if result.get("readiness_reached") else 1


if __name__ == "__main__":
    raise SystemExit(main())


