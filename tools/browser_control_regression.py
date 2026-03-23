# -*- coding: utf-8 -*-
import sys

# Ensure stdout uses UTF-8 on Windows consoles.
if sys.stdout and sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    try:
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    except Exception:
        pass

import argparse
import json
import subprocess
import time
from pathlib import Path
from urllib.error import URLError
from urllib.parse import urlparse, urlunparse
from urllib.request import urlopen

try:
    from playwright.sync_api import Error as PlaywrightError
    from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
    from playwright.sync_api import sync_playwright
except ImportError:
    print(
        "Missing dependency: playwright\n"
        "Install with: pip install \".[browser]\"\n"
        "Then install Chromium with: playwright install chromium",
        file=sys.stderr,
    )
    raise SystemExit(2)


DIAGNOSE_READY_JS = """
() => Boolean(
    window.app?.diagnose?.prepareTrustedNextClickFlow
    && window.app?.diagnose?.evaluateTrustedNextClickFlow
    && window.app?.diagnose?.prepareTrustedPrevClickFlow
    && window.app?.diagnose?.evaluateTrustedPrevClickFlow
    && window.app?.diagnose?.prepareTrustedPlayPauseResumeFlow
    && window.app?.diagnose?.evaluateTrustedPlayPauseResumeFlow
    && window.app?.diagnose?.prepareTrustedPlayPauseResumeStaleLocalStateFlow
    && window.app?.diagnose?.evaluateTrustedPlayPauseResumeStaleLocalStateFlow
)
"""


def parse_args():
    parser = argparse.ArgumentParser(
        description="Run the trusted browser regression suite against a ClubMusic server."
    )
    parser.add_argument(
        "--base-url",
        default="http://127.0.0.1:9000/",
        help="ClubMusic base URL. Default: %(default)s",
    )
    parser.add_argument(
        "--browser",
        choices=["chromium", "firefox", "webkit"],
        default="chromium",
        help="Browser engine to use. Default: %(default)s",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run with a visible browser window.",
    )
    parser.add_argument(
        "--slow-mo",
        type=int,
        default=0,
        help="Delay browser actions by N milliseconds.",
    )
    parser.add_argument(
        "--timeout-ms",
        type=int,
        default=30000,
        help="Playwright action timeout in milliseconds. Default: %(default)s",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional path to write the JSON result.",
    )
    parser.add_argument(
        "--ensure-server",
        action="store_true",
        help="Start a local uvicorn server if the target base URL is not reachable.",
    )
    parser.add_argument(
        "--server-start-timeout-ms",
        type=int,
        default=45000,
        help="How long to wait for an auto-started server to become ready. Default: %(default)s",
    )
    parser.add_argument(
        "--screenshot-dir",
        type=Path,
        help="Optional directory for failure screenshots.",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Only print the final JSON payload.",
    )
    return parser.parse_args()


def log(message, *, quiet=False):
    if not quiet:
        print(message)


def get_healthcheck_url(base_url):
    parsed = urlparse(base_url)
    path = "/status"
    if parsed.path and parsed.path not in ("", "/"):
        path = f"{parsed.path.rstrip('/')}/status"
    return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))


def is_server_ready(base_url, timeout_seconds=2):
    healthcheck_url = get_healthcheck_url(base_url)
    try:
        with urlopen(healthcheck_url, timeout=timeout_seconds) as response:
            return 200 <= response.status < 500
    except URLError:
        return False
    except Exception:
        return False


def build_server_command(base_url):
    parsed = urlparse(base_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    return [
        sys.executable,
        "-m",
        "uvicorn",
        "app:app",
        "--host",
        host,
        "--port",
        str(port),
    ]


def start_local_server_if_needed(args):
    if is_server_ready(args.base_url):
        log("[browser-regression] reusing existing server", quiet=args.quiet)
        return None

    if not args.ensure_server:
        return None

    command = build_server_command(args.base_url)
    repo_root = Path(__file__).resolve().parent.parent
    creationflags = 0
    if sys.platform.startswith("win"):
        creationflags = subprocess.CREATE_NEW_PROCESS_GROUP

    log(f"[browser-regression] starting local server: {' '.join(command)}", quiet=args.quiet)
    process = subprocess.Popen(
        command,
        cwd=repo_root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        creationflags=creationflags,
    )

    deadline = time.time() + (args.server_start_timeout_ms / 1000)
    while time.time() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Auto-started server exited before becoming ready")
        if is_server_ready(args.base_url):
            log("[browser-regression] local server is ready", quiet=args.quiet)
            return process
        time.sleep(0.5)

    process.terminate()
    process.wait(timeout=10)
    raise RuntimeError("Timed out waiting for auto-started server to become ready")


def stop_local_server(process, *, quiet=False):
    if not process:
        return

    if process.poll() is None:
        log("[browser-regression] stopping auto-started server", quiet=quiet)
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


def wait_for_diagnose(page):
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_selector("#fullPlayerNext", state="attached")
    page.wait_for_selector("#fullPlayerPrev", state="attached")
    page.wait_for_function(DIAGNOSE_READY_JS)


def evaluate(page, expression, arg=None):
    if arg is None:
        return page.evaluate(expression)
    return page.evaluate(expression, arg)


def run_trusted_next(page, *, quiet=False):
    log("[browser-regression] preparing trusted next flow", quiet=quiet)
    prepared = evaluate(
        page,
        "async () => await window.app.diagnose.prepareTrustedNextClickFlow()",
    )
    page.click(prepared["selector"])
    return evaluate(
        page,
        "async () => await window.app.diagnose.evaluateTrustedNextClickFlow()",
    )


def run_trusted_prev(page, *, quiet=False):
    log("[browser-regression] preparing trusted prev flow", quiet=quiet)
    prepared = evaluate(
        page,
        "async () => await window.app.diagnose.prepareTrustedPrevClickFlow()",
    )
    page.click(prepared["selector"])
    return evaluate(
        page,
        "async () => await window.app.diagnose.evaluateTrustedPrevClickFlow()",
    )


def run_trusted_playpause_resume(page, *, quiet=False):
    log("[browser-regression] preparing trusted play/pause resume flow", quiet=quiet)
    prepared = evaluate(
        page,
        "async () => await window.app.diagnose.prepareTrustedPlayPauseResumeFlow()",
    )
    page.click(prepared["selector"])
    return evaluate(
        page,
        "async () => await window.app.diagnose.evaluateTrustedPlayPauseResumeFlow()",
    )


def run_trusted_playpause_resume_stale_local_state(page, *, quiet=False):
    log("[browser-regression] preparing trusted play/pause resume flow with stale local paused state", quiet=quiet)
    prepared = evaluate(
        page,
        "async () => await window.app.diagnose.prepareTrustedPlayPauseResumeStaleLocalStateFlow()",
    )
    page.click(prepared["selector"])
    return evaluate(
        page,
        "async () => await window.app.diagnose.evaluateTrustedPlayPauseResumeStaleLocalStateFlow()",
    )


def summarize_checks(checks):
    failed_checks = [name for name, passed in checks.items() if not passed]
    return {
        "passed": not failed_checks,
        "failedChecks": failed_checks,
        "checks": checks,
    }


def build_suite_result(
    trusted_next,
    trusted_prev,
    trusted_playpause_resume,
    trusted_playpause_resume_stale_local_state,
):
    control_suite = {
        "trustedNext": trusted_next,
        "trustedPrev": trusted_prev,
    }
    control_suite["summary"] = summarize_checks({
        "trustedNextFlow": trusted_next.get("summary", {}).get("passed") is True,
        "trustedPrevFlow": trusted_prev.get("summary", {}).get("passed") is True,
    })

    trusted_resume_suite = {
        "trustedPlayPauseResume": trusted_playpause_resume,
        "trustedPlayPauseResumeStaleLocalState": trusted_playpause_resume_stale_local_state,
    }
    trusted_resume_failure_mode = trusted_playpause_resume.get("diagnostics", {}).get("failureMode")
    stale_local_state_failure_mode = trusted_playpause_resume_stale_local_state.get("diagnostics", {}).get("failureMode")
    trusted_resume_suite["summary"] = summarize_checks({
        "trustedPlayPauseResumeFlow": trusted_playpause_resume.get("summary", {}).get("passed") is True,
        "trustedPlayPauseResumeSync": trusted_playpause_resume.get("syncSummary", {}).get("passed") is True,
        "trustedPlayPauseResumeStaleLocalStateFlow": trusted_playpause_resume_stale_local_state.get("summary", {}).get("passed") is True,
        "trustedPlayPauseResumeStaleLocalStateSync": trusted_playpause_resume_stale_local_state.get("syncSummary", {}).get("passed") is True,
        "notStuckBuffering": trusted_resume_failure_mode != "stuck_buffering",
        "notStuckPaused": trusted_resume_failure_mode != "stuck_paused",
        "notRevertedToPaused": trusted_resume_failure_mode != "reverted_to_paused",
        "staleLocalStateNotStuckBuffering": stale_local_state_failure_mode != "stuck_buffering",
        "staleLocalStateNotStuckPaused": stale_local_state_failure_mode != "stuck_paused",
        "staleLocalStateNotRevertedToPaused": stale_local_state_failure_mode != "reverted_to_paused",
    })
    trusted_resume_suite["failureMode"] = trusted_resume_failure_mode
    trusted_resume_suite["staleLocalStateFailureMode"] = stale_local_state_failure_mode

    result = {
        "controlSuite": control_suite,
        "trustedResumeSuite": trusted_resume_suite,
        "trustedNext": trusted_next,
        "trustedPrev": trusted_prev,
        "trustedPlayPauseResume": trusted_playpause_resume,
        "trustedPlayPauseResumeStaleLocalState": trusted_playpause_resume_stale_local_state,
    }
    result["summary"] = summarize_checks({
        "controlSuite": control_suite["summary"].get("passed") is True,
        "trustedResumeSuite": trusted_resume_suite["summary"].get("passed") is True,
    })
    return result


def maybe_capture_failure_artifacts(page, args):
    if not args.screenshot_dir:
        return None

    args.screenshot_dir.mkdir(parents=True, exist_ok=True)
    screenshot_path = args.screenshot_dir / "browser-control-regression-failure.png"
    page.screenshot(path=str(screenshot_path), full_page=True)
    return str(screenshot_path)


def main():
    args = parse_args()
    result = None
    exit_code = 1
    server_process = None

    try:
        server_process = start_local_server_if_needed(args)

        with sync_playwright() as playwright:
            browser_type = getattr(playwright, args.browser)
            browser = browser_type.launch(headless=not args.headed, slow_mo=args.slow_mo)
            context = browser.new_context(ignore_https_errors=True)
            page = context.new_page()
            page.set_default_timeout(args.timeout_ms)

            log(f"[browser-regression] opening {args.base_url}", quiet=args.quiet)
            page.goto(args.base_url, wait_until="domcontentloaded")
            wait_for_diagnose(page)

            trusted_next = run_trusted_next(page, quiet=args.quiet)
            trusted_prev = run_trusted_prev(page, quiet=args.quiet)
            trusted_playpause_resume = run_trusted_playpause_resume(page, quiet=args.quiet)
            trusted_playpause_resume_stale_local_state = run_trusted_playpause_resume_stale_local_state(page, quiet=args.quiet)
            result = build_suite_result(
                trusted_next,
                trusted_prev,
                trusted_playpause_resume,
                trusted_playpause_resume_stale_local_state,
            )
            result["baseUrl"] = args.base_url
            result["browser"] = args.browser
            result["serverStartedByScript"] = bool(server_process)

            if result.get("summary", {}).get("passed"):
                exit_code = 0
            else:
                result["failureScreenshot"] = maybe_capture_failure_artifacts(page, args)

            browser.close()

    except PlaywrightTimeoutError as error:
        result = {
            "status": "ERROR",
            "error": f"Timed out waiting for browser regression flow: {error}",
            "baseUrl": args.base_url,
            "serverStartedByScript": bool(server_process),
        }
    except PlaywrightError as error:
        result = {
            "status": "ERROR",
            "error": f"Playwright failed: {error}",
            "baseUrl": args.base_url,
            "serverStartedByScript": bool(server_process),
        }
    except Exception as error:
        result = {
            "status": "ERROR",
            "error": str(error),
            "baseUrl": args.base_url,
            "serverStartedByScript": bool(server_process),
        }
    finally:
        stop_local_server(server_process, quiet=args.quiet)

    if args.output and result is not None:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(
            json.dumps(result, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    if result is not None:
        print(json.dumps(result, ensure_ascii=False, indent=2))

    raise SystemExit(exit_code)


if __name__ == "__main__":
    main()