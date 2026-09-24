#!/usr/bin/env python3
"""Local-only offline/no-external-network release preflight for Petra."""

from __future__ import annotations

import argparse
import base64
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path
from typing import Any

from expo_browser_acceptance import CDP

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / "dist"
ARTIFACT_DIR = Path(
    os.environ.get("PETRA_LOCAL_ARTIFACT_DIR", ROOT / ".petra_local" / "manual-offline")
)
RESULT_JSON = Path(
    os.environ.get("PETRA_LOCAL_RESULT_JSON", ARTIFACT_DIR / "compact-result.json")
)
HOST = "127.0.0.1"
PORT = 4175
CDP_PORT = 9239
TARGET_URL = "http://{}:{}/".format(HOST, PORT)
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
            "Refusing Petra offline acceptance in hosted CI. Detected: "
            + ", ".join(active)
        )


def check(name: str, passed: bool, detail: Any = None, status: str | None = None) -> dict[str, Any]:
    return {
        "name": name,
        "status": status or ("pass" if passed else "fail"),
        "detail": detail,
    }


def short_command(argv: list[str], timeout: int = 8) -> str | None:
    try:
        proc = subprocess.run(
            argv,
            cwd=ROOT,
            text=True,
            capture_output=True,
            timeout=timeout,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    output = (proc.stdout or proc.stderr).strip()
    return output.splitlines()[0] if output else None


def chromium_path() -> str:
    env = os.environ.get("PETRA_CHROMIUM_BROWSER") or os.environ.get("PETRA_BROWSER")
    candidates = [
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
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)
    raise RuntimeError(
        "Chrome/Chromium not found. Install it or set PETRA_CHROMIUM_BROWSER."
    )


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


def new_page(port: int, url: str) -> CDP:
    request = urllib.request.Request(
        "http://{}:{}/json/new?{}".format(HOST, port, url),
        method="PUT",
    )
    with urllib.request.urlopen(request, timeout=5) as response:
        target = json.load(response)
    return CDP(target["webSocketDebuggerUrl"])


def wait_app(cdp: CDP, expected_url: str, timeout: float = 15.0) -> dict[str, Any]:
    deadline = time.monotonic() + timeout
    latest: dict[str, Any] = {}
    expression = """(() => {
      const shell = document.querySelector('.dish-renderer-shell');
      const renderer = document.querySelector('.dish-renderer-canvas');
      return {
        href: location.href,
        readyState: document.readyState,
        appRoot: !!document.querySelector('.petra-app'),
        renderSource: shell?.dataset.renderSource ?? null,
        renderStatus: renderer?.dataset.renderStatus ?? null,
        canvas: !!renderer?.querySelector('canvas'),
        fallback: !!renderer?.querySelector('[data-render-fallback="true"]')
      };
    })()"""
    while time.monotonic() < deadline:
        value = cdp.eval(expression)
        latest = value if isinstance(value, dict) else {}
        if (
            latest.get("href") == expected_url
            and latest.get("readyState") == "complete"
            and latest.get("renderStatus") in {"ready", "failed"}
        ):
            return latest
        time.sleep(0.1)
    return latest


class BuildReferenceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.references: list[dict[str, str]] = []

    def handle_starttag(
        self,
        tag: str,
        attrs: list[tuple[str, str | None]],
    ) -> None:
        attribute = "src" if tag in {"script", "img", "source", "iframe"} else "href"
        if tag not in {"script", "img", "source", "iframe", "link"}:
            return
        mapping = dict(attrs)
        value = mapping.get(attribute)
        if value:
            self.references.append({"tag": tag, "attribute": attribute, "value": value})


def is_external_runtime_url(value: str) -> bool:
    parsed = urllib.parse.urlparse(value)
    return parsed.scheme in {"http", "https"} and parsed.hostname not in {
        None,
        "localhost",
        "127.0.0.1",
        "::1",
    }


def static_dependency_audit() -> dict[str, Any]:
    index_path = DIST / "index.html"
    if not index_path.exists():
        raise RuntimeError("dist/index.html does not exist after build")
    parser = BuildReferenceParser()
    parser.feed(index_path.read_text(encoding="utf-8"))
    html_external = [
        item for item in parser.references if is_external_runtime_url(item["value"])
    ]

    css_external: list[dict[str, str]] = []
    css_pattern = re.compile(
        r"(?:url\(\s*|@import\s+)(?:['\"])?(https?://[^'\"\)\s;]+)",
        re.IGNORECASE,
    )
    for path in DIST.rglob("*.css"):
        text = path.read_text(encoding="utf-8", errors="replace")
        for match in css_pattern.finditer(text):
            url = match.group(1)
            if is_external_runtime_url(url):
                css_external.append(
                    {"file": str(path.relative_to(DIST)), "value": url}
                )

    return {
        "index_references": parser.references,
        "external_html_dependencies": html_external,
        "external_css_dependencies": css_external,
        "passed": not html_external and not css_external,
    }


def resource_urls(cdp: CDP) -> list[str]:
    value = cdp.eval(
        """performance.getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((name) => typeof name === 'string')"""
    )
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, str)]


def external_resources(urls: list[str]) -> list[str]:
    return sorted({url for url in urls if is_external_runtime_url(url)})


def worker_roundtrip(cdp: CDP) -> dict[str, Any]:
    value = cdp.eval(
        """new Promise((resolve) => {
          try {
            const source = 'self.onmessage = e => self.postMessage(e.data + 1)';
            const blobUrl = URL.createObjectURL(
              new Blob([source], {type: 'text/javascript'})
            );
            const worker = new Worker(blobUrl);
            const timer = setTimeout(() => {
              worker.terminate();
              URL.revokeObjectURL(blobUrl);
              resolve({ok: false, reason: 'timeout'});
            }, 2000);
            worker.onmessage = (event) => {
              clearTimeout(timer);
              worker.terminate();
              URL.revokeObjectURL(blobUrl);
              resolve({ok: event.data === 8, value: event.data});
            };
            worker.onerror = (event) => {
              clearTimeout(timer);
              worker.terminate();
              URL.revokeObjectURL(blobUrl);
              resolve({ok: false, reason: String(event.message || 'worker error')});
            };
            worker.postMessage(7);
          } catch (error) {
            resolve({ok: false, reason: String(error)});
          }
        })""",
        await_promise=True,
    )
    return value if isinstance(value, dict) else {"ok": False, "reason": value}


def build_release() -> dict[str, Any]:
    log = ARTIFACT_DIR / "release-build.log"
    try:
        with log.open("wb") as handle:
            proc = subprocess.run(
                ["npm", "run", "build"],
                cwd=ROOT,
                stdout=handle,
                stderr=subprocess.STDOUT,
                timeout=240,
                check=False,
            )
        return {
            "status": "pass" if proc.returncode == 0 else "fail",
            "return_code": proc.returncode,
            "error": None,
            "log": str(log),
        }
    except subprocess.TimeoutExpired:
        return {
            "status": "fail",
            "return_code": None,
            "error": "timed out after 240s",
            "log": str(log),
        }
    except OSError as exc:
        return {
            "status": "fail",
            "return_code": None,
            "error": str(exc),
            "log": str(log),
        }


def package_version() -> str | None:
    try:
        data = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    value = data.get("version")
    return value if isinstance(value, str) else None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Use an existing dist/ directory. Intended only for local harness debugging.",
    )
    args = parser.parse_args()

    refuse_ci()
    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    RESULT_JSON.parent.mkdir(parents=True, exist_ok=True)

    build = (
        {
            "status": "skipped",
            "return_code": None,
            "error": None,
            "log": None,
        }
        if args.skip_build
        else build_release()
    )
    checks: list[dict[str, Any]] = []
    if build["status"] == "fail":
        checks.append(check("production build succeeds", False, build))
    else:
        checks.append(check("production build succeeds", True, build))

    static_audit: dict[str, Any] | None = None
    if build["status"] != "fail":
        try:
            static_audit = static_dependency_audit()
            checks.append(
                check(
                    "built HTML/CSS has no required external asset dependency",
                    bool(static_audit["passed"]),
                    static_audit,
                )
            )
        except Exception as exc:
            checks.append(check("static build dependency audit", False, repr(exc)))

    chrome: str | None = None
    browser_version: str | None = None
    server: subprocess.Popen[bytes] | None = None
    browser: subprocess.Popen[bytes] | None = None
    cdp: CDP | None = None
    user_data: tempfile.TemporaryDirectory[str] | None = None
    observed_resources: list[str] = []

    if build["status"] != "fail" and static_audit is not None:
        try:
            chrome = chromium_path()
            browser_version = short_command([chrome, "--version"])
            server = subprocess.Popen(
                [
                    sys.executable,
                    "-m",
                    "http.server",
                    str(PORT),
                    "--bind",
                    HOST,
                    "--directory",
                    str(DIST),
                ],
                cwd=ROOT,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            wait_http(TARGET_URL)

            user_data = tempfile.TemporaryDirectory(prefix="petra-offline-cdp-")
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
                    "--disable-default-apps",
                    "--host-resolver-rules=MAP * 0.0.0.0, EXCLUDE localhost, EXCLUDE 127.0.0.1",
                    "about:blank",
                ],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            wait_http("http://{}:{}/json/version".format(HOST, CDP_PORT))
            cdp = new_page(CDP_PORT, TARGET_URL)
            cdp.call("Page.enable")
            cdp.call("Runtime.enable")
            cdp.call("Network.enable")
            cdp.call("Page.navigate", {"url": TARGET_URL})
            first = wait_app(cdp, TARGET_URL)
            checks.append(
                check(
                    "clean-start app shell loads with external DNS blocked",
                    bool(first.get("appRoot")),
                    first,
                )
            )
            checks.append(
                check(
                    "clean-start Pixi renderer reaches ready canvas",
                    first.get("renderStatus") == "ready"
                    and first.get("canvas") is True
                    and first.get("fallback") is False,
                    first,
                )
            )
            worker = worker_roundtrip(cdp)
            checks.append(
                check(
                    "browser Worker executes with external DNS blocked",
                    worker.get("ok") is True,
                    worker,
                )
            )
            observed_resources.extend(resource_urls(cdp))

            cdp.call("Page.reload", {"ignoreCache": True})
            reloaded = wait_app(cdp, TARGET_URL)
            checks.append(
                check(
                    "cold reload remains usable with external DNS blocked",
                    reloaded.get("appRoot") is True
                    and reloaded.get("renderStatus") == "ready"
                    and reloaded.get("canvas") is True
                    and reloaded.get("fallback") is False,
                    reloaded,
                )
            )
            observed_resources.extend(resource_urls(cdp))

            navigation_url = TARGET_URL + "?offline-navigation=1"
            cdp.call("Page.navigate", {"url": navigation_url})
            navigated = wait_app(cdp, navigation_url)
            checks.append(
                check(
                    "root navigation remains usable with external DNS blocked",
                    navigated.get("appRoot") is True
                    and navigated.get("renderStatus") == "ready"
                    and navigated.get("canvas") is True
                    and navigated.get("fallback") is False,
                    navigated,
                )
            )
            observed_resources.extend(resource_urls(cdp))

            outside = external_resources(observed_resources)
            checks.append(
                check(
                    "startup/reload/navigation load no external runtime resource",
                    not outside,
                    {
                        "external": outside,
                        "observed_resource_count": len(set(observed_resources)),
                    },
                )
            )

            shot = cdp.call(
                "Page.captureScreenshot",
                {"format": "png", "captureBeyondViewport": False},
            )
            screenshot_path = ARTIFACT_DIR / "offline-release.png"
            screenshot_path.write_bytes(base64.b64decode(shot["data"]))
            checks.append(check("offline screenshot captured", True, str(screenshot_path)))
        except Exception as exc:
            checks.append(check("offline browser smoke execution", False, repr(exc)))
        finally:
            if cdp:
                cdp.close()
            for proc in (browser, server):
                if proc and proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()
            if user_data:
                user_data.cleanup()

    lockfile_path = ROOT / "package-lock.json"
    checks.append(
        check(
            "reproducible clean-install lockfile",
            lockfile_path.exists(),
            (
                str(lockfile_path)
                if lockfile_path.exists()
                else "Blocked on #30: current repository has no generated package-lock.json, so clean npm installs are not yet reproducible."
            ),
            None if lockfile_path.exists() else "blocked",
        )
    )

    checks.append(
        check(
            "final 90-second flagship flow offline",
            False,
            "Blocked until the authoritative flagship/intervention path and final release flow are frozen (#37/#580).",
            "blocked",
        )
    )
    checks.append(
        check(
            "optional online features degrade explicitly",
            False,
            "No optional-online product surface is declared yet; re-evaluate before final #580 rehearsal.",
            "blocked",
        )
    )

    summary = {
        status: sum(item["status"] == status for item in checks)
        for status in ("pass", "fail", "blocked")
    }
    result = {
        "schema_version": 1,
        "kind": "petra-offline-expo-acceptance",
        "git_commit": short_command(["git", "rev-parse", "HEAD"]),
        "package_version": package_version(),
        "platform": platform.platform(),
        "browser_executable": chrome,
        "browser_version": browser_version,
        "network_policy": {
            "loopback_http_allowed": True,
            "external_hostname_resolution": "mapped to 0.0.0.0 in fresh Chromium profile",
            "browser_background_networking": "disabled",
        },
        "build": build,
        "static_dependency_audit": static_audit,
        "observed_resources": sorted(set(observed_resources)),
        "checks": checks,
        "summary": summary,
        "evidence_boundary": (
            "This is a current-build offline preflight, not the final expo rehearsal. "
            "It proves the built SPA can start/reload/navigate from a loopback static server "
            "with external hostname resolution blocked and no observed external runtime asset "
            "loads. It does not prove the unfinished 90-second authoritative intervention flow, "
            "user-triggered citation links, or future optional online features."
        ),
    }
    RESULT_JSON.write_text(
        json.dumps(result, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(summary, sort_keys=True))
    return 1 if summary["fail"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
