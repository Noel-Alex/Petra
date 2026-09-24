#!/usr/bin/env python3
"""Local-only browser acceptance harness for Petra.

Uses only Python's standard library plus an installed Chrome/Chromium browser.
It starts Vite, drives Chrome through the DevTools Protocol, stores bulky
screenshots under PETRA_LOCAL_ARTIFACT_DIR, and writes compact structured
evidence to PETRA_LOCAL_RESULT_JSON for run_local_experiments.py to ingest.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path(os.environ.get("PETRA_LOCAL_ARTIFACT_DIR", ROOT / ".petra_local" / "manual"))
RESULT_JSON = Path(os.environ.get("PETRA_LOCAL_RESULT_JSON", ARTIFACT_DIR / "compact-result.json"))
HOST = "127.0.0.1"
VITE_PORT = 4173
CDP_PORT = 9223
TARGET_URL = f"http://{HOST}:{VITE_PORT}/"
MOTION_PREFERENCE_SOURCE = ROOT / "src" / "ui" / "motion" / "preference.ts"


def canonical_motion_storage_key() -> str:
    source = MOTION_PREFERENCE_SOURCE.read_text(encoding="utf-8")
    match = re.search(
        r'MOTION_SETTING_STORAGE_KEY\s*=\s*["\']([^"\']+)["\']',
        source,
    )
    if match is None:
        raise RuntimeError(
            "Could not resolve MOTION_SETTING_STORAGE_KEY from the canonical motion preference source."
        )
    return match.group(1)


def wait_http(url: str, timeout: float = 30.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=1) as response:
                if response.status < 500:
                    return
        except Exception as exc:
            last_error = exc
        time.sleep(0.25)
    raise RuntimeError(f"Timed out waiting for {url}: {last_error}")


def browser_path() -> str:
    env = os.environ.get("PETRA_BROWSER")
    candidates = [
        env,
        shutil.which("chrome"),
        shutil.which("google-chrome"),
        shutil.which("google-chrome-stable"),
        shutil.which("chromium"),
        shutil.which("chromium-browser"),
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
        str(Path.home() / "AppData/Local/Google/Chrome/Application/chrome.exe"),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)
    raise RuntimeError(
        "Chrome/Chromium not found. Install Chrome or set PETRA_BROWSER to the browser executable."
    )


class CDP:
    def __init__(self, websocket_url: str):
        if not websocket_url.startswith("ws://"):
            raise RuntimeError(f"Only local ws:// CDP endpoints are supported: {websocket_url}")
        authority, path = websocket_url[5:].split("/", 1)
        host, port_text = authority.rsplit(":", 1)
        self.sock = socket.create_connection((host, int(port_text)), timeout=10)
        key = base64.b64encode(os.urandom(16)).decode()
        request = (
            f"GET /{path} HTTP/1.1\r\n"
            f"Host: {authority}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode())
        response = self._recv_http_headers()
        if b" 101 " not in response.split(b"\r\n", 1)[0]:
            raise RuntimeError(f"CDP WebSocket upgrade failed: {response[:200]!r}")
        expected = base64.b64encode(
            hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()
        ).decode()
        if f"Sec-WebSocket-Accept: {expected}".lower().encode() not in response.lower():
            raise RuntimeError("CDP WebSocket handshake validation failed")
        self.next_id = 1

    def _recv_http_headers(self) -> bytes:
        data = bytearray()
        while b"\r\n\r\n" not in data:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("Socket closed during WebSocket handshake")
            data.extend(chunk)
        return bytes(data)

    def _send_text(self, text: str) -> None:
        payload = text.encode()
        first = 0x81
        length = len(payload)
        if length < 126:
            header = bytes([first, 0x80 | length])
        elif length < 65536:
            header = bytes([first, 0x80 | 126]) + struct.pack("!H", length)
        else:
            header = bytes([first, 0x80 | 127]) + struct.pack("!Q", length)
        mask = os.urandom(4)
        masked = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
        self.sock.sendall(header + mask + masked)

    def _recv_exact(self, count: int) -> bytes:
        out = bytearray()
        while len(out) < count:
            chunk = self.sock.recv(count - len(out))
            if not chunk:
                raise RuntimeError("CDP WebSocket closed")
            out.extend(chunk)
        return bytes(out)

    def _recv_text(self) -> str:
        while True:
            first, second = self._recv_exact(2)
            opcode = first & 0x0F
            length = second & 0x7F
            if length == 126:
                length = struct.unpack("!H", self._recv_exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self._recv_exact(8))[0]
            masked = bool(second & 0x80)
            mask = self._recv_exact(4) if masked else b""
            payload = self._recv_exact(length)
            if masked:
                payload = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
            if opcode == 0x8:
                raise RuntimeError("CDP WebSocket closed by browser")
            if opcode == 0x9:
                self._send_control(0xA, payload)
                continue
            if opcode == 0x1:
                return payload.decode("utf-8", errors="replace")

    def _send_control(self, opcode: int, payload: bytes) -> None:
        mask = os.urandom(4)
        header = bytes([0x80 | opcode, 0x80 | len(payload)])
        masked = bytes(byte ^ mask[i % 4] for i, byte in enumerate(payload))
        self.sock.sendall(header + mask + masked)

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        request_id = self.next_id
        self.next_id += 1
        payload: dict[str, Any] = {"id": request_id, "method": method}
        if params:
            payload["params"] = params
        self._send_text(json.dumps(payload))
        while True:
            message = json.loads(self._recv_text())
            if message.get("id") != request_id:
                continue
            if "error" in message:
                raise RuntimeError(f"CDP {method} failed: {message['error']}")
            return message.get("result", {})

    def eval(self, expression: str, *, await_promise: bool = False) -> Any:
        result = self.call(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": await_promise,
            },
        )
        inner = result.get("result", {})
        if inner.get("subtype") == "error":
            raise RuntimeError(inner.get("description", "browser evaluation failed"))
        return inner.get("value")

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


def new_page() -> CDP:
    request = urllib.request.Request(
        f"http://{HOST}:{CDP_PORT}/json/new?{TARGET_URL}",
        method="PUT",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        target = json.load(response)
    return CDP(target["webSocketDebuggerUrl"])


def check(name: str, passed: bool, detail: Any = None, status: str | None = None) -> dict[str, Any]:
    return {"name": name, "status": status or ("pass" if passed else "fail"), "detail": detail}


def renderer_state(cdp: CDP) -> dict[str, Any]:
    state = cdp.eval(
        """(() => {
          const shell = document.querySelector('.dish-renderer-shell');
          const renderer = document.querySelector('.dish-renderer-canvas');
          return {
            source: shell?.dataset.renderSource ?? null,
            status: renderer?.dataset.renderStatus ?? null,
            canvas: !!renderer?.querySelector('canvas'),
            fallback: !!renderer?.querySelector('[data-render-fallback="true"]')
          };
        })()"""
    )
    return state if isinstance(state, dict) else {
        "source": None,
        "status": None,
        "canvas": False,
        "fallback": False,
    }


def wait_renderer_settled(cdp: CDP, timeout: float = 10.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    latest = renderer_state(cdp)
    while time.monotonic() < deadline:
        latest = renderer_state(cdp)
        if latest.get("status") in {"ready", "failed"}:
            return latest
        time.sleep(0.05)
    return latest


def capture_browser_png(cdp: CDP, artifact_name: str) -> bytes:
    screenshot = cdp.call(
        "Page.captureScreenshot",
        {"format": "png", "captureBeyondViewport": False},
    )
    raw = base64.b64decode(screenshot["data"])
    (ARTIFACT_DIR / artifact_name).write_bytes(raw)
    return raw


def renderer_interaction_rect(cdp: CDP) -> dict[str, float] | None:
    rect = cdp.eval(
        """(() => {
          const host = document.querySelector(
            '.dish-renderer-canvas[data-render-status="ready"] [role="region"]'
          );
          if (!host) return null;
          const r = host.getBoundingClientRect();
          return {
            x: r.x,
            y: r.y,
            width: r.width,
            height: r.height,
            centerX: r.x + r.width / 2,
            centerY: r.y + r.height / 2
          };
        })()"""
    )
    return rect if isinstance(rect, dict) else None


def viewport_pass(cdp: CDP, label: str, width: int, height: int) -> list[dict[str, Any]]:
    cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False},
    )
    time.sleep(0.3)
    render = wait_renderer_settled(cdp)
    metrics = cdp.eval(
        """(() => {
          const root = document.querySelector('.petra-app');
          const dish = document.querySelector('.dish-stage');
          return {
            title: document.title,
            root: !!root,
            dish: !!dish,
            bodyScrollWidth: document.body.scrollWidth,
            bodyClientWidth: document.body.clientWidth,
            bodyScrollHeight: document.body.scrollHeight,
            viewportHeight: innerHeight,
            dishRect: dish ? dish.getBoundingClientRect().toJSON() : null
          };
        })()"""
    )
    overflow_x = metrics["bodyScrollWidth"] > metrics["bodyClientWidth"] + 1
    artifact_name = f"{label}-{width}x{height}.png"
    raw = capture_browser_png(cdp, artifact_name)
    render_ready = (
        render.get("status") == "ready"
        and render.get("canvas") is True
        and render.get("fallback") is False
    )
    return [
        check(f"{label}: app root present", bool(metrics["root"]), metrics),
        check(f"{label}: dish present", bool(metrics["dish"]), metrics.get("dishRect")),
        check(
            f"{label}: Pixi renderer ready with canvas",
            render_ready,
            render,
        ),
        check(f"{label}: no horizontal clipping", not overflow_x, metrics),
        check(
            f"{label}: screenshot captured",
            len(raw) > 0,
            str(ARTIFACT_DIR / artifact_name),
        ),
    ]


def browser_motion_state(cdp: CDP, storage_key: str) -> dict[str, Any] | None:
    expression = """(() => {
      const root = document.querySelector('.petra-app');
      const panel = document.querySelector('.petra-panel');
      const select = document.querySelector('select[aria-label="Motion preference"]');
      return root && panel && select ? {
        motion: root.dataset.motion,
        transition: getComputedStyle(panel).transitionDuration,
        selected: select.value,
        stored: localStorage.getItem(__STORAGE_KEY__)
      } : null;
    })()""".replace("__STORAGE_KEY__", json.dumps(storage_key))
    return cdp.eval(expression)


def set_motion_setting(cdp: CDP, setting: str) -> bool:
    return (
        cdp.eval(
            """(() => {
              const select = document.querySelector('select[aria-label="Motion preference"]');
              if (!select) return null;
              select.value = __SETTING__;
              select.dispatchEvent(new Event('change', {bubbles:true}));
              return true;
            })()""".replace("__SETTING__", json.dumps(setting))
        )
        is True
    )


def wait_for_app(
    cdp: CDP,
    timeout: float = 10.0,
    expected_url: str | None = None,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        ready_expression = """document.readyState === 'complete' &&
          document.querySelector('.petra-app') !== null"""
        if expected_url is not None:
            ready_expression = (
                "(" + ready_expression + ") && location.href === "
                + json.dumps(expected_url)
            )
        ready = cdp.eval(ready_expression)
        if ready is True:
            return
        time.sleep(0.05)
    raise RuntimeError("Timed out waiting for Petra app after navigation/reload.")


def motion_pass(cdp: CDP) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    storage_key = canonical_motion_storage_key()

    # Explicit product preferences must both resolve and persist under the
    # canonical key owned by src/ui/motion/preference.ts.
    for setting, expected in (("full", "full"), ("reduced", "reduced"), ("off", "off")):
        control_available = set_motion_setting(cdp, setting)
        time.sleep(0.1)
        state = browser_motion_state(cdp, storage_key)
        checks.append(
            check(
                f"motion {setting}: control available",
                control_available,
                state,
            )
        )
        checks.append(
            check(
                f"motion {setting}: resolved mode",
                bool(state) and state["motion"] == expected,
                state,
            )
        )
        checks.append(
            check(
                f"motion {setting}: canonical preference persisted",
                bool(state) and state["stored"] == setting,
                {"storageKey": storage_key, "state": state},
            )
        )
        if setting == "off":
            checks.append(
                check(
                    "motion off: CSS transitions disabled",
                    bool(state)
                    and all(
                        part.strip() in {"0s", "0ms"}
                        for part in state["transition"].split(",")
                    ),
                    state,
                )
            )

    # Verify a persisted explicit setting survives a real page reload and is
    # restored into both the selector and the resolved data-motion contract.
    set_motion_setting(cdp, "reduced")
    time.sleep(0.1)
    before_reload = browser_motion_state(cdp, storage_key)
    reload_url = f"{TARGET_URL}?qa-motion-reload=1"
    cdp.call("Page.navigate", {"url": reload_url})
    wait_for_app(cdp, expected_url=reload_url)
    time.sleep(0.15)
    after_reload = browser_motion_state(cdp, storage_key)
    checks.append(
        check(
            "motion reduced: preference survives page reload",
            bool(before_reload)
            and before_reload["stored"] == "reduced"
            and bool(after_reload)
            and after_reload["stored"] == "reduced"
            and after_reload["selected"] == "reduced"
            and after_reload["motion"] == "reduced",
            {
                "storageKey": storage_key,
                "beforeReload": before_reload,
                "afterReload": after_reload,
            },
        )
    )

    # System follows OS preference.
    cdp.call(
        "Emulation.setEmulatedMedia",
        {"features": [{"name": "prefers-reduced-motion", "value": "reduce"}]},
    )
    system_available = set_motion_setting(cdp, "system")
    time.sleep(0.15)
    system_state = browser_motion_state(cdp, storage_key)
    checks.append(
        check(
            "system + OS reduced resolves to reduced",
            system_available
            and bool(system_state)
            and system_state["stored"] == "system"
            and system_state["selected"] == "system"
            and system_state["motion"] == "reduced",
            {"storageKey": storage_key, "state": system_state},
        )
    )

    # Explicit product preference remains authoritative over OS reduced motion.
    full_available = set_motion_setting(cdp, "full")
    time.sleep(0.15)
    explicit_full_state = browser_motion_state(cdp, storage_key)
    checks.append(
        check(
            "explicit full overrides OS reduced motion",
            full_available
            and bool(explicit_full_state)
            and explicit_full_state["stored"] == "full"
            and explicit_full_state["selected"] == "full"
            and explicit_full_state["motion"] == "full",
            {"storageKey": storage_key, "state": explicit_full_state},
        )
    )

    cdp.call("Emulation.setEmulatedMedia", {"features": []})
    return checks


def keyboard_pass(cdp: CDP) -> list[dict[str, Any]]:
    cdp.eval("document.body.focus();")
    seen: list[str] = []
    for _ in range(12):
        cdp.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Tab", "code": "Tab"})
        cdp.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Tab", "code": "Tab"})
        seen.append(
            cdp.eval(
                """(() => {
                  const el = document.activeElement;
                  const label = el?.getAttribute?.('aria-label') || el?.textContent?.trim()?.slice(0,40) || '';
                  return (el?.tagName || '') + ':' + label;
                })()"""
            )
        )
    focusable = sum(not item.startswith("BODY:") for item in seen)
    return [
        check("keyboard: tab reaches interactive controls", focusable >= 6, seen),
        check("keyboard: motion control reachable", any("Motion preference" in item for item in seen), seen),
        check("keyboard: timeline controls reachable", any(any(name in item for name in ("Pause", "1×", "4×", "16×")) for item in seen), seen),
    ]


def accessibility_pass(cdp: CDP) -> list[dict[str, Any]]:
    tree = cdp.call("Accessibility.getFullAXTree")
    nodes = tree.get("nodes", [])
    names = [node.get("name", {}).get("value", "") for node in nodes if node.get("name", {}).get("value")]
    required = ["Experiment workspace", "Interventions", "Petri dish viewport", "Inspector", "Simulation timeline", "Motion preference"]
    missing = [name for name in required if name not in names]
    return [
        check("accessibility: landmark/control names exposed", not missing, {"missing": missing}),
        check("accessibility: semantic tree non-empty", len(nodes) > 10, {"nodeCount": len(nodes)}),
    ]


def click_overview_reset(cdp: CDP) -> bool:
    return (
        cdp.eval(
            """(() => {
              const button = document.querySelector(
                'button[aria-label="Return Petri dish camera to whole-dish overview"]'
              );
              if (!button) return false;
              button.click();
              return true;
            })()"""
        )
        is True
    )


def dispatch_renderer_wheel(cdp: CDP, delta_y: float) -> bool:
    expression = """(() => {
      const host = document.querySelector(
        '.dish-renderer-canvas[data-render-status="ready"] [role="region"]'
      );
      if (!host) return false;
      const r = host.getBoundingClientRect();
      host.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: r.x + r.width / 2,
        clientY: r.y + r.height / 2,
        deltaY: __DELTA__
      }));
      return true;
    })()""".replace("__DELTA__", json.dumps(delta_y))
    return cdp.eval(expression) is True


def touch_pass(cdp: CDP) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False},
    )
    set_motion_setting(cdp, "off")
    time.sleep(0.1)
    render = wait_renderer_settled(cdp)
    rect = renderer_interaction_rect(cdp)
    ready = (
        render.get("status") == "ready"
        and render.get("canvas") is True
        and render.get("fallback") is False
        and rect is not None
    )
    checks.append(check("touch: renderer target ready", ready, {"renderer": render, "rect": rect}))
    if not ready or rect is None:
        return checks

    click_overview_reset(cdp)
    time.sleep(0.1)
    before = capture_browser_png(cdp, "pinch-before.png")
    before_hash = hashlib.sha256(before).hexdigest()

    cdp.call("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 2})
    cx = float(rect["centerX"])
    cy = float(rect["centerY"])
    try:
        cdp.call(
            "Input.dispatchTouchEvent",
            {
                "type": "touchStart",
                "touchPoints": [
                    {"id": 1, "x": cx - 28, "y": cy, "radiusX": 1, "radiusY": 1},
                    {"id": 2, "x": cx + 28, "y": cy, "radiusX": 1, "radiusY": 1},
                ],
            },
        )
        for spread in (42, 58, 76, 96):
            cdp.call(
                "Input.dispatchTouchEvent",
                {
                    "type": "touchMove",
                    "touchPoints": [
                        {"id": 1, "x": cx - spread, "y": cy, "radiusX": 1, "radiusY": 1},
                        {"id": 2, "x": cx + spread, "y": cy, "radiusX": 1, "radiusY": 1},
                    ],
                },
            )
            time.sleep(0.03)
        cdp.call("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    finally:
        cdp.call(
            "Emulation.setTouchEmulationEnabled",
            {"enabled": False, "maxTouchPoints": 1},
        )

    time.sleep(0.15)
    after = capture_browser_png(cdp, "pinch-after.png")
    after_hash = hashlib.sha256(after).hexdigest()
    checks.append(
        check(
            "touch: two-pointer pinch changes rendered presentation",
            before_hash != after_hash,
            {
                "beforeSha256": before_hash,
                "afterSha256": after_hash,
                "beforeArtifact": str(ARTIFACT_DIR / "pinch-before.png"),
                "afterArtifact": str(ARTIFACT_DIR / "pinch-after.png"),
            },
        )
    )
    return checks


def renderer_frame_samples(cdp: CDP) -> dict[str, Any] | None:
    workload = cdp.eval(
        """new Promise(resolve => {
          const host = document.querySelector(
            '.dish-renderer-canvas[data-render-status="ready"] [role="region"]'
          );
          if (!host) {
            resolve(null);
            return;
          }

          const r = host.getBoundingClientRect();
          const frameIntervalsMs = [];
          const rendererOwned = [];
          const synchronousRedrawMs = [];
          let lastFrame = performance.now();
          let previousOwned = null;
          let previousRedrawMs = null;
          let deltaY = -32;

          function step(now) {
            // Attribute each frame interval to the renderer workload dispatched
            // during the preceding frame. Five warm-up samples are discarded.
            if (previousOwned !== null && previousRedrawMs !== null) {
              frameIntervalsMs.push(now - lastFrame);
              rendererOwned.push(previousOwned);
              synchronousRedrawMs.push(previousRedrawMs);
            }

            if (frameIntervalsMs.length >= 180) {
              resolve({
                frameIntervalsMs: frameIntervalsMs.slice(5),
                rendererOwned: rendererOwned.slice(5),
                synchronousRedrawMs: synchronousRedrawMs.slice(5)
              });
              return;
            }

            lastFrame = now;
            const event = new WheelEvent('wheel', {
              bubbles: true,
              cancelable: true,
              clientX: r.x + r.width / 2,
              clientY: r.y + r.height / 2,
              deltaY
            });
            const redrawStart = performance.now();
            // Renderer wheel ownership is deliberately observable: accepted
            // zoom intent calls preventDefault() and synchronously render()s in
            // Motion Off. A zero-delta event is not owned and must never count
            // as renderer performance work.
            previousOwned = host.dispatchEvent(event) === false;
            previousRedrawMs = performance.now() - redrawStart;

            // Equal-and-opposite small deltas keep the camera near its starting
            // zoom instead of saturating a min/max boundary during the sample.
            deltaY = -deltaY;
            requestAnimationFrame(step);
          }

          requestAnimationFrame(step);
        })""",
        await_promise=True,
    )
    if not isinstance(workload, dict):
        return None

    intervals = workload.get("frameIntervalsMs")
    ownership = workload.get("rendererOwned")
    redraw_durations = workload.get("synchronousRedrawMs")
    if (
        not isinstance(intervals, list)
        or not isinstance(ownership, list)
        or not isinstance(redraw_durations, list)
        or len(intervals) != len(ownership)
        or len(intervals) != len(redraw_durations)
    ):
        return None

    return {
        "frameIntervalsMs": [float(value) for value in intervals],
        "rendererOwned": [value is True for value in ownership],
        "synchronousRedrawMs": [float(value) for value in redraw_durations],
    }


def frame_metrics(workload: dict[str, Any] | None, view: str) -> dict[str, Any]:
    if not workload:
        return {
            "view": view,
            "sampleCount": 0,
            "rendererOwnedRedraws": 0,
            "averageFrameMs": None,
            "p95FrameMs": None,
            "framesOver33ms": None,
            "averageSynchronousRedrawMs": None,
            "p95SynchronousRedrawMs": None,
        }

    samples = workload["frameIntervalsMs"]
    ownership = workload["rendererOwned"]
    redraw_durations = workload["synchronousRedrawMs"]
    if not samples:
        return {
            "view": view,
            "sampleCount": 0,
            "rendererOwnedRedraws": 0,
            "averageFrameMs": None,
            "p95FrameMs": None,
            "framesOver33ms": None,
            "averageSynchronousRedrawMs": None,
            "p95SynchronousRedrawMs": None,
        }

    ordered = sorted(samples)
    ordered_redraws = sorted(redraw_durations)
    avg = sum(samples) / len(samples)
    p95 = ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]
    over_33 = sum(value > 33.4 for value in samples)
    redraw_avg = sum(redraw_durations) / len(redraw_durations)
    redraw_p95 = ordered_redraws[
        min(len(ordered_redraws) - 1, int(len(ordered_redraws) * 0.95))
    ]
    return {
        "view": view,
        "sampleCount": len(samples),
        "rendererOwnedRedraws": sum(ownership),
        "averageFrameMs": round(avg, 3),
        "p95FrameMs": round(p95, 3),
        "framesOver33ms": over_33,
        "averageSynchronousRedrawMs": round(redraw_avg, 3),
        "p95SynchronousRedrawMs": round(redraw_p95, 3),
    }


def performance_pass(cdp: CDP) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False},
    )
    set_motion_setting(cdp, "off")
    time.sleep(0.1)
    render = wait_renderer_settled(cdp)
    ready = (
        render.get("status") == "ready"
        and render.get("canvas") is True
        and render.get("fallback") is False
    )
    checks.append(check("performance: renderer ready", ready, render))
    if not ready:
        return checks

    reset_ok = click_overview_reset(cdp)
    time.sleep(0.1)
    whole_png = capture_browser_png(cdp, "performance-whole-dish.png")
    whole_samples = renderer_frame_samples(cdp)
    whole = frame_metrics(whole_samples, "whole-dish")

    zoom_ok = dispatch_renderer_wheel(cdp, -650)
    time.sleep(0.1)
    zoom_png = capture_browser_png(cdp, "performance-colony-zoom.png")
    zoom_samples = renderer_frame_samples(cdp)
    zoomed = frame_metrics(zoom_samples, "colony-camera-zoom")

    whole_p95 = whole.get("p95FrameMs")
    zoom_p95 = zoomed.get("p95FrameMs")
    checks.extend(
        [
            check(
                "performance whole-dish: representative redraw samples captured",
                reset_ok
                and whole["sampleCount"] >= 175
                and whole["rendererOwnedRedraws"] == whole["sampleCount"],
                {
                    **whole,
                    "workload": "alternating -32/+32 px center-wheel redraws, Motion Off",
                    "fixtureSource": render.get("source"),
                    "artifact": str(ARTIFACT_DIR / "performance-whole-dish.png"),
                },
            ),
            check(
                "performance whole-dish: p95 under 33.4ms",
                isinstance(whole_p95, (int, float)) and whole_p95 < 33.4,
                whole,
            ),
            check(
                "performance colony zoom: presentation zoom applied",
                zoom_ok and hashlib.sha256(whole_png).hexdigest() != hashlib.sha256(zoom_png).hexdigest(),
                {
                    "wheelDeltaY": -650,
                    "wholeSha256": hashlib.sha256(whole_png).hexdigest(),
                    "zoomedSha256": hashlib.sha256(zoom_png).hexdigest(),
                    "artifact": str(ARTIFACT_DIR / "performance-colony-zoom.png"),
                },
            ),
            check(
                "performance colony zoom: representative redraw samples captured",
                zoom_ok
                and zoomed["sampleCount"] >= 175
                and zoomed["rendererOwnedRedraws"] == zoomed["sampleCount"],
                {
                    **zoomed,
                    "workload": "alternating -32/+32 px center-wheel redraws, Motion Off",
                    "fixtureSource": render.get("source"),
                    "artifact": str(ARTIFACT_DIR / "performance-colony-zoom.png"),
                },
            ),
            check(
                "performance colony zoom: p95 under 33.4ms",
                isinstance(zoom_p95, (int, float)) and zoom_p95 < 33.4,
                zoomed,
            ),
        ]
    )
    return checks


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--vite-port", type=int, default=VITE_PORT)
    args = parser.parse_args()
    if args.vite_port != VITE_PORT:
        raise SystemExit(f"This harness currently expects Vite port {VITE_PORT}.")

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_JSON.parent.mkdir(parents=True, exist_ok=True)
    chrome = browser_path()
    user_data = tempfile.TemporaryDirectory(prefix="petra-cdp-")
    vite: subprocess.Popen[bytes] | None = None
    browser: subprocess.Popen[bytes] | None = None
    cdp: CDP | None = None
    checks: list[dict[str, Any]] = []

    try:
        vite = subprocess.Popen(
            ["npm", "run", "dev", "--", "--host", HOST, "--port", str(VITE_PORT), "--strictPort"],
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_http(TARGET_URL)

        browser = subprocess.Popen(
            [
                chrome,
                "--headless=new",
                f"--remote-debugging-port={CDP_PORT}",
                f"--user-data-dir={user_data.name}",
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
        wait_http(f"http://{HOST}:{CDP_PORT}/json/version")
        cdp = new_page()
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call("Accessibility.enable")
        cdp.call("Page.navigate", {"url": TARGET_URL})
        time.sleep(1.2)

        checks += viewport_pass(cdp, "desktop", 1440, 900)
        checks += viewport_pass(cdp, "narrow", 768, 900)
        checks += motion_pass(cdp)
        checks += keyboard_pass(cdp)
        checks += accessibility_pass(cdp)
        checks += touch_pass(cdp)
        checks += performance_pass(cdp)

        checks.append(check("causal cues preserve camera ownership", False, "Requires an authoritative event trigger fixture.", "blocked"))
        # Whole-dish and zoomed presentation captures are produced by performance_pass.
        checks.append(check("critical lineage identity has non-color cue", False, "Requires authoritative lineage render fixture.", "blocked"))

    except Exception as exc:
        checks.append(check("harness execution", False, repr(exc)))
    finally:
        if cdp:
            cdp.close()
        for proc in (browser, vite):
            if proc and proc.poll() is None:
                proc.terminate()
                try:
                    proc.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    proc.kill()
        user_data.cleanup()

    passed = sum(item["status"] == "pass" for item in checks)
    failed = sum(item["status"] == "fail" for item in checks)
    blocked = sum(item["status"] == "blocked" for item in checks)
    result = {
        "schema_version": 1,
        "kind": "petra-expo-browser-acceptance",
        "target_url": TARGET_URL,
        "browser_executable": chrome,
        "checks": checks,
        "summary": {"pass": passed, "fail": failed, "blocked": blocked},
        "evidence_boundary": (
            "Headless browser evidence checks layout, accessibility plumbing, motion modes, "
            "input smoke, screenshots, and frame timing. Human visible-browser review remains "
            "required for final aesthetic judgment; this run does not validate scientific correctness."
        ),
    }
    RESULT_JSON.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(result["summary"], sort_keys=True))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
