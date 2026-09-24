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


def viewport_pass(cdp: CDP, label: str, width: int, height: int) -> list[dict[str, Any]]:
    cdp.call(
        "Emulation.setDeviceMetricsOverride",
        {"width": width, "height": height, "deviceScaleFactor": 1, "mobile": False},
    )
    time.sleep(0.3)
    metrics = cdp.eval(
        """(() => {
          const root = document.querySelector('.petra-app');
          const dish = document.querySelector('.dish-stage');
          const canvas = document.querySelector('canvas');
          return {
            title: document.title,
            root: !!root,
            dish: !!dish,
            canvas: !!canvas,
            bodyScrollWidth: document.body.scrollWidth,
            bodyClientWidth: document.body.clientWidth,
            bodyScrollHeight: document.body.scrollHeight,
            viewportHeight: innerHeight,
            dishRect: dish ? dish.getBoundingClientRect().toJSON() : null
          };
        })()"""
    )
    overflow_x = metrics["bodyScrollWidth"] > metrics["bodyClientWidth"] + 1
    artifact = ARTIFACT_DIR / f"{label}-{width}x{height}.png"
    screenshot = cdp.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
    artifact.write_bytes(base64.b64decode(screenshot["data"]))
    return [
        check(f"{label}: app root present", bool(metrics["root"]), metrics),
        check(f"{label}: dish present", bool(metrics["dish"]), metrics.get("dishRect")),
        check(f"{label}: no horizontal clipping", not overflow_x, metrics),
        check(f"{label}: screenshot captured", artifact.exists() and artifact.stat().st_size > 0, str(artifact)),
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


def wait_for_app(cdp: CDP, timeout: float = 10.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        ready = cdp.eval(
            """document.readyState === 'complete' &&
               document.querySelector('.petra-app') !== null"""
        )
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
    cdp.call("Page.reload", {"ignoreCache": True})
    wait_for_app(cdp)
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


def touch_pass(cdp: CDP) -> list[dict[str, Any]]:
    cdp.call("Emulation.setTouchEmulationEnabled", {"enabled": True, "maxTouchPoints": 1})
    rect = cdp.eval(
        """(() => {
          const dish = document.querySelector('.dish-stage');
          if (!dish) return null;
          const r = dish.getBoundingClientRect();
          return {x:r.x+r.width/2, y:r.y+r.height/2};
        })()"""
    )
    if not rect:
        return [check("touch: dish target available", False)]
    cdp.call("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": rect["x"], "y": rect["y"], "radiusX": 1, "radiusY": 1}]})
    cdp.call("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    cdp.call("Emulation.setTouchEmulationEnabled", {"enabled": False, "maxTouchPoints": 1})
    return [check("touch: synthetic pointer smoke completed", True, rect)]


def performance_pass(cdp: CDP) -> list[dict[str, Any]]:
    samples = cdp.eval(
        """new Promise(resolve => {
          const values = [];
          let last = performance.now();
          function step(now) {
            values.push(now-last);
            last = now;
            if (values.length >= 180) resolve(values.slice(5));
            else requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
        })""",
        await_promise=True,
    )
    ordered = sorted(samples)
    avg = sum(samples) / len(samples)
    p95 = ordered[min(len(ordered) - 1, int(len(ordered) * 0.95))]
    over_33 = sum(value > 33.4 for value in samples)
    metrics = {"sampleCount": len(samples), "averageFrameMs": round(avg, 3), "p95FrameMs": round(p95, 3), "framesOver33ms": over_33}
    return [
        check("frame timing: 175+ samples captured", len(samples) >= 175, metrics),
        check("frame timing: p95 under 33.4ms", p95 < 33.4, metrics),
    ]


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
        checks.append(check("colony semantic-zoom visual capture", False, "Requires exposed semantic-zoom control/fixture.", "blocked"))
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
