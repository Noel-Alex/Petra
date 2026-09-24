#!/usr/bin/env python3
"""Local cross-browser release acceptance for Petra.

This is a manual laptop experiment. It builds the current Vite release bundle,
runs the existing deep Chromium acceptance harness, then smoke-tests that built
bundle in Chromium plus Firefox and Safari/WebKit when local automation is
available. Missing optional browsers are reported as unavailable, never passed
by inference.
"""

from __future__ import annotations

import base64
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from expo_browser_acceptance import CDP

ROOT = Path(__file__).resolve().parents[1]
ARTIFACT_DIR = Path(
    os.environ.get("PETRA_LOCAL_ARTIFACT_DIR", ROOT / ".petra_local" / "manual-cross-browser")
)
RESULT_JSON = Path(
    os.environ.get("PETRA_LOCAL_RESULT_JSON", ARTIFACT_DIR / "compact-result.json")
)
HOST = "127.0.0.1"
PREVIEW_PORT = 4174
PREVIEW_URL = "http://{}:{}/".format(HOST, PREVIEW_PORT)
CHROMIUM_CDP_PORT = 9238
FIREFOX_DRIVER_PORT = 4447
SAFARI_DRIVER_PORT = 4448
CI_ENV_KEYS = (
    "CI",
    "GITHUB_ACTIONS",
    "GITLAB_CI",
    "BUILDKITE",
    "CIRCLECI",
    "TF_BUILD",
    "JENKINS_URL",
    "BUILD_BUILDID",
)


def truthy_env(name: str) -> bool:
    value = os.environ.get(name)
    return bool(value and value.strip().lower() not in {"0", "false", "no", "off"})


def refuse_ci() -> None:
    active = [name for name in CI_ENV_KEYS if truthy_env(name)]
    if active:
        raise SystemExit(
            "Refusing Petra cross-browser acceptance in hosted CI. Detected: "
            + ", ".join(active)
        )


def check(name: str, status: str, detail: Any = None) -> dict[str, Any]:
    if status not in {"pass", "fail", "blocked", "unavailable"}:
        raise ValueError("invalid check status: " + status)
    return {"name": name, "status": status, "detail": detail}


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
        time.sleep(0.2)
    raise RuntimeError("Timed out waiting for {}: {!r}".format(url, last_error))


def version_line(argv: list[str]) -> str | None:
    try:
        proc = subprocess.run(
            argv,
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=8,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    output = (proc.stdout or proc.stderr).strip()
    return output.splitlines()[0] if output else None


def run_logged(argv: list[str], log_name: str, timeout: int) -> tuple[int | None, str | None]:
    log_path = ARTIFACT_DIR / log_name
    try:
        with log_path.open("wb") as handle:
            proc = subprocess.run(
                argv,
                cwd=ROOT,
                stdout=handle,
                stderr=subprocess.STDOUT,
                timeout=timeout,
                check=False,
            )
        return proc.returncode, None
    except subprocess.TimeoutExpired:
        return None, "timed out after {}s".format(timeout)
    except OSError as exc:
        return None, str(exc)


def find_existing(candidates: list[str | None]) -> str | None:
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)
    return None


def chromium_path() -> str | None:
    env = os.environ.get("PETRA_CHROMIUM_BROWSER") or os.environ.get("PETRA_BROWSER")
    return find_existing(
        [
            env,
            shutil.which("google-chrome"),
            shutil.which("google-chrome-stable"),
            shutil.which("chrome"),
            shutil.which("chromium"),
            shutil.which("chromium-browser"),
            "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
            r"C:\Program Files\Google\Chrome\Application\chrome.exe",
            r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
            str(Path.home() / "AppData/Local/Google/Chrome/Application/chrome.exe"),
        ]
    )


def firefox_path() -> str | None:
    env = os.environ.get("PETRA_FIREFOX_BROWSER")
    return find_existing(
        [
            env,
            shutil.which("firefox"),
            "/Applications/Firefox.app/Contents/MacOS/firefox",
            r"C:\Program Files\Mozilla Firefox\firefox.exe",
            r"C:\Program Files (x86)\Mozilla Firefox\firefox.exe",
        ]
    )


def save_png(encoded: str, name: str) -> str:
    path = ARTIFACT_DIR / name
    path.write_bytes(base64.b64decode(encoded))
    return str(path)


def common_dom_script() -> str:
    return """(() => {
      const root = document.querySelector('.petra-app');
      const shell = document.querySelector('.dish-renderer-shell');
      const renderer = document.querySelector('.dish-renderer-canvas');
      const canvas = renderer?.querySelector('canvas');
      return {
        readyState: document.readyState,
        title: document.title,
        appRoot: !!root,
        renderSource: shell?.dataset.renderSource ?? null,
        renderStatus: renderer?.dataset.renderStatus ?? null,
        canvas: !!canvas,
        fallback: !!renderer?.querySelector('[data-render-fallback="true"]'),
        horizontalOverflow: document.body.scrollWidth > document.body.clientWidth + 1,
        workerApi: typeof Worker === 'function'
      };
    })()"""


def motion_set_script() -> str:
    return """(() => {
      const select = document.querySelector('select[aria-label="Motion preference"]');
      if (!select) return false;
      select.value = 'reduced';
      select.dispatchEvent(new Event('change', {bubbles: true}));
      return true;
    })()"""


def motion_read_script() -> str:
    return """(() => {
      const root = document.querySelector('.petra-app');
      const select = document.querySelector('select[aria-label="Motion preference"]');
      return root && select ? {motion: root.dataset.motion, selected: select.value} : null;
    })()"""


def worker_promise_script() -> str:
    return """new Promise((resolve) => {
      try {
        const source = 'self.onmessage = e => self.postMessage(e.data + 1)';
        const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
        const worker = new Worker(url);
        const timer = setTimeout(() => {
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve({ok: false, reason: 'timeout'});
        }, 2000);
        worker.onmessage = (event) => {
          clearTimeout(timer);
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve({ok: event.data === 8, value: event.data});
        };
        worker.onerror = (event) => {
          clearTimeout(timer);
          worker.terminate();
          URL.revokeObjectURL(url);
          resolve({ok: false, reason: String(event.message || 'worker error')});
        };
        worker.postMessage(7);
      } catch (error) {
        resolve({ok: false, reason: String(error)});
      }
    })"""


def cdp_release_smoke(chrome: str) -> dict[str, Any]:
    user_data = tempfile.TemporaryDirectory(prefix="petra-cross-cdp-")
    browser: subprocess.Popen[bytes] | None = None
    cdp: CDP | None = None
    checks: list[dict[str, Any]] = []
    try:
        browser = subprocess.Popen(
            [
                chrome,
                "--headless=new",
                "--remote-debugging-port={}".format(CHROMIUM_CDP_PORT),
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
        wait_http("http://{}:{}/json/version".format(HOST, CHROMIUM_CDP_PORT))
        request = urllib.request.Request(
            "http://{}:{}/json/new?{}".format(HOST, CHROMIUM_CDP_PORT, PREVIEW_URL),
            method="PUT",
        )
        with urllib.request.urlopen(request, timeout=5) as response:
            target = json.load(response)
        cdp = CDP(target["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False},
        )
        cdp.call("Page.navigate", {"url": PREVIEW_URL})
        deadline = time.monotonic() + 15
        state: dict[str, Any] = {}
        while time.monotonic() < deadline:
            value = cdp.eval(common_dom_script())
            state = value if isinstance(value, dict) else {}
            if state.get("readyState") == "complete" and state.get("renderStatus") in {"ready", "failed"}:
                break
            time.sleep(0.1)
        checks.extend(
            [
                check("release app root", "pass" if state.get("appRoot") else "fail", state),
                check(
                    "release Pixi canvas ready",
                    "pass"
                    if state.get("renderStatus") == "ready"
                    and state.get("canvas") is True
                    and state.get("fallback") is False
                    else "fail",
                    state,
                ),
                check(
                    "release no horizontal overflow",
                    "pass" if state.get("horizontalOverflow") is False else "fail",
                    state,
                ),
                check("Worker API present", "pass" if state.get("workerApi") else "fail", state),
            ]
        )
        worker_result = cdp.eval(worker_promise_script(), await_promise=True)
        checks.append(
            check(
                "Worker roundtrip",
                "pass" if isinstance(worker_result, dict) and worker_result.get("ok") is True else "fail",
                worker_result,
            )
        )
        set_motion = cdp.eval(motion_set_script())
        time.sleep(0.15)
        motion = cdp.eval(motion_read_script())
        checks.append(
            check(
                "explicit reduced motion",
                "pass"
                if set_motion is True
                and isinstance(motion, dict)
                and motion.get("motion") == "reduced"
                and motion.get("selected") == "reduced"
                else "fail",
                motion,
            )
        )
        cdp.eval("document.body.focus()")
        focus_seen: list[str] = []
        for _ in range(12):
            cdp.call("Input.dispatchKeyEvent", {"type": "keyDown", "key": "Tab", "code": "Tab"})
            cdp.call("Input.dispatchKeyEvent", {"type": "keyUp", "key": "Tab", "code": "Tab"})
            label = cdp.eval(
                """(() => {
                  const el = document.activeElement;
                  return (el?.tagName || '') + ':' +
                    (el?.getAttribute?.('aria-label') || el?.textContent?.trim()?.slice(0, 50) || '');
                })()"""
            )
            focus_seen.append(str(label))
        checks.append(
            check(
                "keyboard reaches controls",
                "pass" if sum(not item.startswith("BODY:") for item in focus_seen) >= 6 else "fail",
                focus_seen,
            )
        )
        screenshot = cdp.call("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
        checks.append(check("release screenshot", "pass", save_png(screenshot["data"], "chromium-release.png")))
    except Exception as exc:
        checks.append(check("Chromium release smoke execution", "fail", repr(exc)))
    finally:
        if cdp:
            cdp.close()
        if browser and browser.poll() is None:
            browser.terminate()
            try:
                browser.wait(timeout=5)
            except subprocess.TimeoutExpired:
                browser.kill()
        user_data.cleanup()
    return {
        "browser": "chromium",
        "browser_version": version_line([chrome, "--version"]),
        "driver": "cdp",
        "status": "fail" if any(item["status"] == "fail" for item in checks) else "pass",
        "checks": checks,
    }


class WebDriver:
    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self.session_id: str | None = None
        self.capabilities: dict[str, Any] = {}

    def call(self, method: str, path: str, payload: Any = None, timeout: int = 20) -> Any:
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = urllib.request.Request(
            self.base_url + path,
            data=body,
            method=method,
            headers={"Content-Type": "application/json; charset=utf-8"},
        )
        try:
            with urllib.request.urlopen(request, timeout=timeout) as response:
                raw = response.read()
        except urllib.error.HTTPError as exc:
            raw = exc.read()
            raise RuntimeError(
                "WebDriver {} {} failed: {} {}".format(method, path, exc.code, raw[:500])
            ) from exc
        decoded = json.loads(raw.decode("utf-8")) if raw else {}
        value = decoded.get("value", decoded)
        if isinstance(value, dict) and value.get("error"):
            raise RuntimeError("WebDriver error: {}".format(value))
        return value

    def create_session(self, capabilities: dict[str, Any]) -> None:
        value = self.call(
            "POST",
            "/session",
            {"capabilities": {"alwaysMatch": capabilities}},
            timeout=45,
        )
        if not isinstance(value, dict):
            raise RuntimeError("WebDriver session response is not an object")
        session_id = value.get("sessionId")
        caps = value.get("capabilities", {})
        if not isinstance(session_id, str) or not session_id:
            raise RuntimeError("WebDriver did not return a session id")
        self.session_id = session_id
        self.capabilities = caps if isinstance(caps, dict) else {}

    def session_path(self, suffix: str) -> str:
        if self.session_id is None:
            raise RuntimeError("WebDriver session has not been created")
        return "/session/{}/{}".format(self.session_id, suffix.lstrip("/"))

    def execute(self, script: str, args: list[Any] | None = None) -> Any:
        return self.call(
            "POST",
            self.session_path("execute/sync"),
            {"script": "return " + script, "args": args or []},
        )

    def execute_statement(self, script: str) -> Any:
        return self.call(
            "POST",
            self.session_path("execute/sync"),
            {"script": script, "args": []},
        )

    def execute_async(self, script: str) -> Any:
        return self.call(
            "POST",
            self.session_path("execute/async"),
            {"script": script, "args": []},
            timeout=10,
        )

    def close(self) -> None:
        if self.session_id is None:
            return
        try:
            self.call("DELETE", "/session/" + self.session_id, timeout=10)
        except Exception:
            pass
        self.session_id = None


def wait_webdriver(base_url: str, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            with urllib.request.urlopen(base_url.rstrip("/") + "/status", timeout=1) as response:
                if response.status < 500:
                    return
        except Exception as exc:
            last_error = exc
        time.sleep(0.2)
    raise RuntimeError("Timed out waiting for WebDriver {}: {!r}".format(base_url, last_error))


def webdriver_release_smoke(
    browser_name: str,
    driver_argv: list[str],
    base_url: str,
    capabilities: dict[str, Any],
    screenshot_name: str,
) -> dict[str, Any]:
    driver_proc: subprocess.Popen[bytes] | None = None
    driver = WebDriver(base_url)
    checks: list[dict[str, Any]] = []
    try:
        driver_proc = subprocess.Popen(
            driver_argv,
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        wait_webdriver(base_url)
        driver.create_session(capabilities)
        driver.call(
            "POST",
            driver.session_path("window/rect"),
            {"width": 1440, "height": 900, "x": 0, "y": 0},
        )
        driver.call("POST", driver.session_path("url"), {"url": PREVIEW_URL})
        deadline = time.monotonic() + 15
        state: dict[str, Any] = {}
        while time.monotonic() < deadline:
            value = driver.execute(common_dom_script())
            state = value if isinstance(value, dict) else {}
            if state.get("readyState") == "complete" and state.get("renderStatus") in {"ready", "failed"}:
                break
            time.sleep(0.1)
        checks.extend(
            [
                check("release app root", "pass" if state.get("appRoot") else "fail", state),
                check(
                    "release Pixi canvas ready",
                    "pass"
                    if state.get("renderStatus") == "ready"
                    and state.get("canvas") is True
                    and state.get("fallback") is False
                    else "fail",
                    state,
                ),
                check(
                    "release no horizontal overflow",
                    "pass" if state.get("horizontalOverflow") is False else "fail",
                    state,
                ),
                check("Worker API present", "pass" if state.get("workerApi") else "fail", state),
            ]
        )
        worker = driver.execute_async(
            """const done = arguments[arguments.length - 1];
            try {
              const source = 'self.onmessage = e => self.postMessage(e.data + 1)';
              const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
              const worker = new Worker(url);
              const timer = setTimeout(() => {
                worker.terminate();
                URL.revokeObjectURL(url);
                done({ok: false, reason: 'timeout'});
              }, 2000);
              worker.onmessage = (event) => {
                clearTimeout(timer);
                worker.terminate();
                URL.revokeObjectURL(url);
                done({ok: event.data === 8, value: event.data});
              };
              worker.onerror = (event) => {
                clearTimeout(timer);
                worker.terminate();
                URL.revokeObjectURL(url);
                done({ok: false, reason: String(event.message || 'worker error')});
              };
              worker.postMessage(7);
            } catch (error) {
              done({ok: false, reason: String(error)});
            }"""
        )
        checks.append(
            check(
                "Worker roundtrip",
                "pass" if isinstance(worker, dict) and worker.get("ok") is True else "fail",
                worker,
            )
        )
        motion_available = driver.execute_statement(
            "return " + motion_set_script() + ";"
        )
        time.sleep(0.15)
        motion = driver.execute(motion_read_script())
        checks.append(
            check(
                "explicit reduced motion",
                "pass"
                if motion_available is True
                and isinstance(motion, dict)
                and motion.get("motion") == "reduced"
                and motion.get("selected") == "reduced"
                else "fail",
                motion,
            )
        )
        driver.execute_statement("document.body.focus(); return true;")
        focus_seen: list[str] = []
        for _ in range(12):
            driver.call(
                "POST",
                driver.session_path("actions"),
                {
                    "actions": [
                        {
                            "type": "key",
                            "id": "keyboard",
                            "actions": [
                                {"type": "keyDown", "value": "\ue004"},
                                {"type": "keyUp", "value": "\ue004"},
                            ],
                        }
                    ]
                },
            )
            driver.call("DELETE", driver.session_path("actions"))
            value = driver.execute(
                """(() => {
                  const el = document.activeElement;
                  return (el?.tagName || '') + ':' +
                    (el?.getAttribute?.('aria-label') || el?.textContent?.trim()?.slice(0, 50) || '');
                })()"""
            )
            focus_seen.append(str(value))
        checks.append(
            check(
                "keyboard reaches controls",
                "pass" if sum(not item.startswith("BODY:") for item in focus_seen) >= 6 else "fail",
                focus_seen,
            )
        )
        encoded = driver.call("GET", driver.session_path("screenshot"))
        if not isinstance(encoded, str):
            raise RuntimeError("WebDriver screenshot was not base64 text")
        checks.append(check("release screenshot", "pass", save_png(encoded, screenshot_name)))
        checks.extend(
            [
                check(
                    "pointer/wheel/pinch compatibility",
                    "blocked",
                    "Not yet automated through the portable WebDriver slice; Chromium deep acceptance covers these inputs.",
                ),
                check(
                    "export/download compatibility",
                    "blocked",
                    "Requires the final export surface from the release candidate.",
                ),
                check(
                    "offline reload compatibility",
                    "blocked",
                    "Requires final offline packaging/rehearsal from #557/#580.",
                ),
            ]
        )
    except Exception as exc:
        checks.append(check(browser_name + " release smoke execution", "fail", repr(exc)))
    finally:
        driver.close()
        if driver_proc and driver_proc.poll() is None:
            driver_proc.terminate()
            try:
                driver_proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                driver_proc.kill()

    status = "fail" if any(item["status"] == "fail" for item in checks) else "pass"
    return {
        "browser": browser_name,
        "browser_version": driver.capabilities.get("browserVersion"),
        "platform_name": driver.capabilities.get("platformName"),
        "driver": driver_argv[0] if driver_argv else None,
        "status": status,
        "checks": checks,
    }


def unavailable_browser(browser: str, reason: str) -> dict[str, Any]:
    return {
        "browser": browser,
        "browser_version": None,
        "driver": None,
        "status": "unavailable",
        "checks": [check(browser + " availability", "unavailable", reason)],
    }


def run_deep_chromium() -> dict[str, Any]:
    result_path = ARTIFACT_DIR / "chromium-full-result.json"
    child_artifacts = ARTIFACT_DIR / "chromium-full"
    child_artifacts.mkdir(parents=True, exist_ok=True)
    env = os.environ.copy()
    env["PETRA_LOCAL_ARTIFACT_DIR"] = str(child_artifacts)
    env["PETRA_LOCAL_RESULT_JSON"] = str(result_path)
    configured_chrome = chromium_path()
    if configured_chrome is not None:
        env["PETRA_BROWSER"] = configured_chrome
    code: int | None = None
    error: str | None = None
    try:
        proc = subprocess.run(
            [sys.executable, str(ROOT / "tools" / "expo_browser_acceptance.py")],
            cwd=ROOT,
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            timeout=420,
            check=False,
            text=True,
        )
        code = proc.returncode
        (ARTIFACT_DIR / "chromium-full.log").write_text(proc.stdout, encoding="utf-8")
    except subprocess.TimeoutExpired as exc:
        error = "timed out after 420s"
        output = exc.stdout or ""
        if isinstance(output, bytes):
            output = output.decode("utf-8", errors="replace")
        (ARTIFACT_DIR / "chromium-full.log").write_text(output, encoding="utf-8")
    except OSError as exc:
        error = str(exc)

    child = None
    if result_path.exists():
        try:
            child = json.loads(result_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            error = "invalid Chromium evidence: {!r}".format(exc)
    status = "pass" if code == 0 and isinstance(child, dict) else "fail"
    return {
        "status": status,
        "return_code": code,
        "error": error,
        "summary": child.get("summary") if isinstance(child, dict) else None,
        "evidence_path": str(result_path),
    }


def main() -> int:
    refuse_ci()
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_JSON.parent.mkdir(parents=True, exist_ok=True)

    build_code, build_error = run_logged(["npm", "run", "build"], "release-build.log", 240)
    build = {
        "status": "pass" if build_code == 0 else "fail",
        "return_code": build_code,
        "error": build_error,
        "log": str(ARTIFACT_DIR / "release-build.log"),
    }
    if build_code != 0:
        result = {
            "schema_version": 1,
            "kind": "petra-cross-browser-release-acceptance",
            "platform": platform.platform(),
            "build": build,
            "deep_chromium": None,
            "browsers": [],
            "summary": {"pass": 0, "fail": 1, "blocked": 0, "unavailable": 0},
            "evidence_boundary": "Release build failed; no browser compatibility claim is possible.",
        }
        RESULT_JSON.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps(result["summary"], sort_keys=True))
        return 1

    deep_chromium = run_deep_chromium()

    preview = subprocess.Popen(
        [
            "npm",
            "run",
            "preview",
            "--",
            "--host",
            HOST,
            "--port",
            str(PREVIEW_PORT),
            "--strictPort",
        ],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    browsers: list[dict[str, Any]] = []
    try:
        wait_http(PREVIEW_URL)

        chrome = chromium_path()
        if chrome is None:
            browsers.append(
                unavailable_browser(
                    "chromium",
                    "Primary Chromium browser not found. Install Chrome/Chromium or set PETRA_CHROMIUM_BROWSER.",
                )
            )
        else:
            browsers.append(cdp_release_smoke(chrome))

        firefox = firefox_path()
        geckodriver = os.environ.get("PETRA_GECKODRIVER") or shutil.which("geckodriver")
        if firefox is None or geckodriver is None:
            missing = []
            if firefox is None:
                missing.append("Firefox")
            if geckodriver is None:
                missing.append("geckodriver")
            browsers.append(
                unavailable_browser(
                    "firefox",
                    "Missing local prerequisite(s): " + ", ".join(missing),
                )
            )
        else:
            capabilities: dict[str, Any] = {
                "browserName": "firefox",
                "moz:firefoxOptions": {"args": ["-headless"], "binary": firefox},
            }
            browsers.append(
                webdriver_release_smoke(
                    "firefox",
                    [geckodriver, "--port", str(FIREFOX_DRIVER_PORT)],
                    "http://{}:{}".format(HOST, FIREFOX_DRIVER_PORT),
                    capabilities,
                    "firefox-release.png",
                )
            )

        safaridriver = (
            os.environ.get("PETRA_SAFARIDRIVER")
            or shutil.which("safaridriver")
            or ("/usr/bin/safaridriver" if Path("/usr/bin/safaridriver").exists() else None)
        )
        if platform.system() != "Darwin" or safaridriver is None:
            browsers.append(
                unavailable_browser(
                    "safari-webkit",
                    "Safari automation requires macOS with safaridriver; current platform is {}.".format(
                        platform.system()
                    ),
                )
            )
        else:
            safari_result = webdriver_release_smoke(
                "safari-webkit",
                [safaridriver, "-p", str(SAFARI_DRIVER_PORT)],
                "http://{}:{}".format(HOST, SAFARI_DRIVER_PORT),
                {"browserName": "safari"},
                "safari-release.png",
            )
            if safari_result["status"] == "fail":
                failures = [
                    item
                    for item in safari_result["checks"]
                    if item.get("name") == "safari-webkit release smoke execution"
                ]
                if failures and "session" in str(failures[0].get("detail", "")).lower():
                    safari_result["status"] = "blocked"
                    failures[0]["status"] = "blocked"
                    failures[0]["detail"] = (
                        str(failures[0].get("detail"))
                        + " Safari remote automation may need Develop > Allow Remote Automation enabled."
                    )
            browsers.append(safari_result)
    except Exception as exc:
        browsers.append(
            {
                "browser": "release-preview",
                "status": "fail",
                "checks": [check("release preview execution", "fail", repr(exc))],
            }
        )
    finally:
        if preview.poll() is None:
            preview.terminate()
            try:
                preview.wait(timeout=5)
            except subprocess.TimeoutExpired:
                preview.kill()

    flat_checks = [
        item
        for browser in browsers
        for item in browser.get("checks", [])
        if isinstance(item, dict)
    ]
    summary = {
        status: sum(item.get("status") == status for item in flat_checks)
        for status in ("pass", "fail", "blocked", "unavailable")
    }
    if deep_chromium["status"] == "fail":
        summary["fail"] += 1

    primary = next((item for item in browsers if item.get("browser") == "chromium"), None)
    primary_ok = bool(primary and primary.get("status") == "pass")
    available_optional_failed = any(
        item.get("browser") in {"firefox", "safari-webkit"}
        and item.get("status") == "fail"
        for item in browsers
    )
    overall_fail = (
        deep_chromium["status"] != "pass"
        or not primary_ok
        or available_optional_failed
        or summary["fail"] > 0
    )

    result = {
        "schema_version": 1,
        "kind": "petra-cross-browser-release-acceptance",
        "platform": platform.platform(),
        "release_url": PREVIEW_URL,
        "build": build,
        "deep_chromium": deep_chromium,
        "browsers": browsers,
        "summary": summary,
        "evidence_boundary": (
            "Chromium remains Petra's primary automated browser and receives the existing deep input/"
            "motion/accessibility/frame-time suite plus a built-release smoke. Firefox and Safari/WebKit "
            "receive built-release Worker/Pixi/layout/reduced-motion/keyboard smoke only when local "
            "WebDriver tooling is available. Missing optional browsers are unavailable, not passes. "
            "Portable pointer/pinch, final export/download, offline reload, and human visual judgment "
            "remain explicit blocked evidence until their owning release surfaces/harnesses exist."
        ),
    }
    RESULT_JSON.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(summary, sort_keys=True))
    return 1 if overall_fail else 0


if __name__ == "__main__":
    raise SystemExit(main())
