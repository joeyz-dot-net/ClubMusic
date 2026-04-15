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
from urllib.parse import parse_qsl, quote, urlencode
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

APP_CONTEXT_READY_JS = """
() => Boolean(
    window.app?.initialized
    && window.app?.modules?.api
    && window.app?.modules?.player
    && window.app?.modules?.playlistManager
)
"""

ROOM_CONTEXT_SNAPSHOT_JS = """
async ({ roomId, expectedPlaylistId }) => {
    const app = window.app;
    if (!app?.modules?.api || !app?.modules?.player || !app?.modules?.playlistManager || !app?.initialized) {
        return {
            ready: false,
            reason: 'app-not-ready',
            roomId: app?.modules?.api?.roomId || '',
            expectedPlaylistId,
        };
    }

    const roomStatus = await app.modules.api.getRoomStatus(roomId);
    const playerStatus = app.modules.player.getStatus?.() || null;
    const selectedPlaylistId = app.modules.playlistManager.getSelectedPlaylistId?.() || '';
    const activeDefaultId = app.modules.playlistManager.getActiveDefaultId?.() || '';
    const wsUrl = app.modules.player.ws?.url || '';
    const currentPlaylistId = playerStatus?.current_playlist_id || '';
    const expectedRoomQuery = `room_id=${encodeURIComponent(roomId)}`;

    return {
        ready: app.modules.api.roomId === roomId
            && roomStatus?.status === 'ok'
            && roomStatus?.bot_ready === true
            && selectedPlaylistId === expectedPlaylistId
            && activeDefaultId === expectedPlaylistId
            && currentPlaylistId === expectedPlaylistId
            && wsUrl.includes(expectedRoomQuery),
        roomId: app.modules.api.roomId || '',
        selectedPlaylistId,
        activeDefaultId,
        expectedPlaylistId,
        currentPlaylistId,
        wsUrl,
        roomStatus,
        playerStatus,
    };
}
"""

DEFAULT_PAGE_ISOLATION_SNAPSHOT_JS = """
({ roomId }) => {
    const app = window.app;
    if (!app?.modules?.api || !app?.modules?.player || !app?.modules?.playlistManager || !app?.initialized) {
        return {
            ready: false,
            reason: 'app-not-ready',
            roomId: app?.modules?.api?.roomId || '',
            targetRoomId: roomId,
        };
    }

    const selectedPlaylistId = app.modules.playlistManager.getSelectedPlaylistId?.() || '';
    const activeDefaultId = app.modules.playlistManager.getActiveDefaultId?.() || '';
    const wsUrl = app.modules.player.ws?.url || '';
    const playerStatus = app.modules.player.getStatus?.() || null;
    const currentPlaylistId = playerStatus?.current_playlist_id || '';
    return {
        ready: true,
        roomId: app.modules.api.roomId || '',
        selectedPlaylistId,
        activeDefaultId,
        currentPlaylistId,
        wsUrl,
        targetRoomId: roomId,
    };
}
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
    parser.add_argument(
        "--include-room-suite",
        action="store_true",
        help="Also validate room-scoped player binding and room auto-recovery.",
    )
    parser.add_argument(
        "--include-queue-suite",
        action="store_true",
        help="Also validate queue delete and reorder rendering flows.",
    )
    parser.add_argument(
        "--include-local-suite",
        action="store_true",
        help="Also validate local tree search, breadcrumb navigation, and search reset with a deterministic fixture.",
    )
    parser.add_argument(
        "--room-id",
        help="Optional fixed room_id for the room suite. Defaults to a generated regression room id.",
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


def build_expected_room_playlist_id(room_id):
    safe_id = room_id.replace("\\", "_").replace(".", "_").replace(":", "_")
    return f"room_{safe_id}"


def build_room_query_fragment(room_id):
    return f"room_id={quote(room_id, safe='')}"


def build_room_url(base_url, room_id):
    parsed = urlparse(base_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query["room_id"] = room_id
    return urlunparse(parsed._replace(query=urlencode(query)))


def build_room_context_payload(room_id):
    return {
        "roomId": room_id,
        "expectedPlaylistId": build_expected_room_playlist_id(room_id),
        "expectedRoomQuery": build_room_query_fragment(room_id),
    }


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


def is_page_closed(page):
    try:
        return page.is_closed()
    except Exception:
        return False


def capture_snapshot(page, expression, arg=None, *, reason):
    try:
        return evaluate(page, expression, arg)
    except (PlaywrightTimeoutError, PlaywrightError) as error:
        return {
            "ready": False,
            "reason": reason,
            "error": str(error),
            "pageClosed": is_page_closed(page),
        }
    except Exception as error:
        return {
            "ready": False,
            "reason": reason,
            "error": str(error),
            "pageClosed": is_page_closed(page),
        }


def wait_for_app_context(page, *, timeout_ms=30000):
    page.wait_for_load_state("domcontentloaded")
    page.wait_for_function(APP_CONTEXT_READY_JS, timeout=timeout_ms)


def wait_for_local_state(
    page,
    *,
    expected_query=None,
    expected_dir_view=None,
    expected_breadcrumb_length=None,
    expected_last_breadcrumb=None,
    timeout_ms=5000,
):
    page.wait_for_function(
        """
        ({ expectedQuery, expectedDirView, expectedBreadcrumbLength, expectedLastBreadcrumb }) => {
            const searchBody = document.getElementById('searchModalBody');
            const searchInput = document.getElementById('searchModalInput');
            if (!searchBody || !searchInput) {
                return false;
            }

            const breadcrumbLabels = Array.from(searchBody.querySelectorAll('.search-breadcrumb-item'))
                .map((node) => node.textContent?.trim() || '')
                .filter(Boolean);
            const dirViewActive = !!searchBody.querySelector('.search-dir-view');
            const searchValue = searchInput.value || '';
            const matchesQuery = expectedQuery === null || searchValue === expectedQuery;
            const matchesDirView = expectedDirView === null || dirViewActive === expectedDirView;
            const matchesBreadcrumbLength = expectedBreadcrumbLength === null || breadcrumbLabels.length === expectedBreadcrumbLength;
            const matchesLastBreadcrumb = expectedLastBreadcrumb === null || breadcrumbLabels[breadcrumbLabels.length - 1] === expectedLastBreadcrumb;
            return matchesQuery && matchesDirView && matchesBreadcrumbLength && matchesLastBreadcrumb;
        }
        """,
        arg={
            "expectedQuery": expected_query,
            "expectedDirView": expected_dir_view,
            "expectedBreadcrumbLength": expected_breadcrumb_length,
            "expectedLastBreadcrumb": expected_last_breadcrumb,
        },
        timeout=timeout_ms,
    )


def get_room_context_snapshot(page, room_id):
    return capture_snapshot(
        page,
        ROOM_CONTEXT_SNAPSHOT_JS,
        build_room_context_payload(room_id),
        reason="room-context-snapshot-failed",
    )


def get_default_page_isolation_snapshot(page, room_id):
    return capture_snapshot(
        page,
        DEFAULT_PAGE_ISOLATION_SNAPSHOT_JS,
        build_room_context_payload(room_id),
        reason="default-page-isolation-snapshot-failed",
    )


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


def run_queue_delete(page, *, quiet=False):
    log("[browser-regression] preparing queue delete flow", quiet=quiet)
    prepared = evaluate(
        page,
        "async () => await window.app.regression.prepareQueueDeleteFlow()",
    )
    page.click(prepared["deleteSelector"])
    page.wait_for_selector(prepared["confirmSelector"], state="visible")
    page.click(prepared["confirmSelector"])
    return evaluate(
        page,
        "async ({ probeId }) => await window.app.regression.evaluateQueueDeleteFlow({ probeId })",
        {"probeId": prepared["probeId"]},
    )


def run_queue_reorder(page, *, quiet=False):
    log("[browser-regression] preparing queue reorder flow", quiet=quiet)
    prepared = evaluate(
        page,
        "async () => await window.app.regression.prepareQueueReorderFlow()",
    )
    return evaluate(
        page,
        "async ({ probeId }) => await window.app.regression.evaluateQueueReorderFlow({ probeId })",
        {"probeId": prepared["probeId"]},
    )


def run_queue_suite(page, base_url, *, quiet=False, timeout_ms=30000):
    log("[browser-regression] opening queue regression page", quiet=quiet)
    page.goto(base_url, wait_until="domcontentloaded")
    wait_for_app_context(page, timeout_ms=timeout_ms)

    queue_delete = run_queue_delete(page, quiet=quiet)
    queue_reorder = run_queue_reorder(page, quiet=quiet)

    result = {
        "queueDelete": queue_delete,
        "queueReorder": queue_reorder,
    }
    result["summary"] = summarize_checks({
        "queueDeleteFlow": queue_delete.get("summary", {}).get("passed") is True,
        "queueReorderFlow": queue_reorder.get("summary", {}).get("passed") is True,
    })
    return result


def capture_local_search_step(page, probe_id, label):
    return evaluate(
        page,
        "({ probeId, label }) => window.app.regression.captureLocalSearchProbeStep({ probeId, label })",
        {"probeId": probe_id, "label": label},
    )


def run_local_suite(page, base_url, *, quiet=False, timeout_ms=30000):
    log("[browser-regression] opening local search regression page", quiet=quiet)
    page.goto(base_url, wait_until="domcontentloaded")
    wait_for_app_context(page, timeout_ms=timeout_ms)

    prepared = evaluate(
        page,
        "async () => await window.app.regression.prepareLocalSearchFlow()",
    )

    page.wait_for_selector(prepared["searchInputSelector"], state="visible")
    page.fill(prepared["searchInputSelector"], prepared["searchQuery"])
    evaluate(
        page,
        "async ({ probeId }) => await window.app.regression.renderLocalSearchFixtureResults({ probeId })",
        {"probeId": prepared["probeId"]},
    )
    page.wait_for_selector(prepared["firstSearchResultSelector"], state="visible")

    page.click(prepared["firstSearchResultSelector"])
    wait_for_local_state(
        page,
        expected_query=prepared["searchQuery"],
        expected_dir_view=True,
        expected_breadcrumb_length=2,
        expected_last_breadcrumb="Acoustic Set",
        timeout_ms=timeout_ms,
    )
    capture_local_search_step(page, prepared["probeId"], "afterFirstDirectory")

    page.click(prepared["firstDirCardSelector"])
    wait_for_local_state(
        page,
        expected_query=prepared["searchQuery"],
        expected_dir_view=True,
        expected_breadcrumb_length=3,
        expected_last_breadcrumb="Ballads",
        timeout_ms=timeout_ms,
    )
    capture_local_search_step(page, prepared["probeId"], "afterSecondDirectory")

    page.click(prepared["breadcrumbResultsSelector"])
    wait_for_local_state(
        page,
        expected_query=prepared["searchQuery"],
        expected_dir_view=False,
        expected_breadcrumb_length=0,
        timeout_ms=timeout_ms,
    )
    capture_local_search_step(page, prepared["probeId"], "afterBreadcrumbReturn")

    local_search = evaluate(
        page,
        "async ({ probeId }) => await window.app.regression.evaluateLocalSearchFlow({ probeId })",
        {"probeId": prepared["probeId"]},
    )

    result = {
        "localSearch": local_search,
    }
    result["summary"] = summarize_checks({
        "localSearchFlow": local_search.get("summary", {}).get("passed") is True,
    })
    return result


def wait_for_room_context(page, room_id, *, timeout_ms=30000):
    deadline = time.monotonic() + (timeout_ms / 1000)
    last_snapshot = None

    try:
        wait_for_app_context(page, timeout_ms=timeout_ms)
    except (PlaywrightTimeoutError, PlaywrightError) as error:
        last_snapshot = get_room_context_snapshot(page, room_id)
        last_snapshot.setdefault("error", str(error))
        raise RuntimeError(f"Timed out waiting for room app context to become ready: {last_snapshot}") from error

    while time.monotonic() < deadline:
        last_snapshot = get_room_context_snapshot(page, room_id)

        if last_snapshot.get("ready") is True:
            return last_snapshot

        if is_page_closed(page):
            break

        time.sleep(0.25)

    raise RuntimeError(f"Timed out waiting for room context to become ready: {last_snapshot}")


def get_default_page_snapshot(page, room_id, *, timeout_ms=5000):
    try:
        wait_for_app_context(page, timeout_ms=timeout_ms)
    except (PlaywrightTimeoutError, PlaywrightError) as error:
        snapshot = get_default_page_isolation_snapshot(page, room_id)
        snapshot.setdefault("error", str(error))
        return snapshot

    return get_default_page_isolation_snapshot(page, room_id)


def build_room_suite_checks(
    room_id,
    initial,
    deleted,
    refresh_probe,
    recovered,
    *,
    expected_playlist_id,
    expected_room_query,
    isolation_result=None,
):
    checks = {
        "roomContextPropagated": initial.get("roomId") == room_id and recovered.get("roomId") == room_id,
        "roomBotReady": initial.get("roomStatus", {}).get("status") == "ok" and initial.get("roomStatus", {}).get("bot_ready") is True,
        "selectedPlaylistBoundToRoom": initial.get("selectedPlaylistId") == expected_playlist_id,
        "activeDefaultBoundToRoom": initial.get("activeDefaultId") == expected_playlist_id,
        "playerStatusBoundToRoom": initial.get("currentPlaylistId") == expected_playlist_id,
        "websocketScopedToRoom": expected_room_query in (initial.get("wsUrl") or ""),
        "roomDeleteSucceeded": deleted.get("ok") is True,
        "refreshProbeReturnedStatus": refresh_probe.get("ok") is True,
        "roomRecovered": recovered.get("roomStatus", {}).get("status") == "ok" and recovered.get("roomStatus", {}).get("bot_ready") is True,
        "recoveredStatusBoundToRoom": recovered.get("currentPlaylistId") == expected_playlist_id,
    }
    if isolation_result is not None:
        isolation_ready = isolation_result.get("ready") is True
        checks["defaultPageNotInRoom"] = isolation_ready and isolation_result.get("roomId") == ""
        checks["defaultPagePlaylistNotLeaked"] = isolation_ready and isolation_result.get("selectedPlaylistId") != expected_playlist_id
        checks["defaultPageWsNotScopedToRoom"] = isolation_ready and expected_room_query not in (isolation_result.get("wsUrl") or "")
    return checks


def run_room_suite(page, base_url, room_id, *, quiet=False, timeout_ms=30000, default_page=None):
    log(f"[browser-regression] opening room page for {room_id}", quiet=quiet)
    page.goto(build_room_url(base_url, room_id), wait_until="domcontentloaded")
    initial = wait_for_room_context(page, room_id, timeout_ms=timeout_ms)
    room_context = build_room_context_payload(room_id)

    log(f"[browser-regression] forcing room recovery for {room_id}", quiet=quiet)
    deleted = evaluate(
        page,
        """
        async (targetRoomId) => {
            const response = await fetch(`/room/${encodeURIComponent(targetRoomId)}`, { method: 'DELETE' });
            let body = null;
            try {
                body = await response.json();
            } catch (error) {
                body = { parseError: String(error) };
            }
            return { ok: response.ok, status: response.status, body };
        }
        """,
        room_id,
    )

    refresh_probe = evaluate(
        page,
        """
        async () => {
            try {
                const status = await window.app.modules.player.refreshStatus('room regression recovery probe failed');
                return { ok: true, status };
            } catch (error) {
                return {
                    ok: false,
                    message: error?.message || String(error),
                    result: error?.result || null,
                };
            }
        }
        """,
    )

    recovered = wait_for_room_context(page, room_id, timeout_ms=timeout_ms)
    expected_playlist_id = room_context["expectedPlaylistId"]
    expected_room_query = room_context["expectedRoomQuery"]

    # --- Parallel isolation: verify default page is NOT affected by room ---
    isolation_result = None
    if default_page is not None:
        log(f"[browser-regression] checking parallel isolation (default vs room {room_id})", quiet=quiet)
        isolation_result = get_default_page_snapshot(
            default_page,
            room_id,
            timeout_ms=min(timeout_ms, 5000),
        )

    checks = build_room_suite_checks(
        room_id,
        initial,
        deleted,
        refresh_probe,
        recovered,
        expected_playlist_id=expected_playlist_id,
        expected_room_query=expected_room_query,
        isolation_result=isolation_result,
    )

    result = {
        "roomId": room_id,
        "roomUrl": build_room_url(base_url, room_id),
        "initial": initial,
        "delete": deleted,
        "refreshProbe": refresh_probe,
        "recovered": recovered,
    }
    if isolation_result is not None:
        result["isolation"] = isolation_result
    result["summary"] = summarize_checks(checks)
    return result


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
    room_suite=None,
    queue_suite=None,
    local_suite=None,
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
    summary_checks = {
        "controlSuite": control_suite["summary"].get("passed") is True,
        "trustedResumeSuite": trusted_resume_suite["summary"].get("passed") is True,
    }
    if room_suite is not None:
        result["roomSuite"] = room_suite
        summary_checks["roomSuite"] = room_suite.get("summary", {}).get("passed") is True
    if queue_suite is not None:
        result["queueSuite"] = queue_suite
        summary_checks["queueSuite"] = queue_suite.get("summary", {}).get("passed") is True
    if local_suite is not None:
        result["localSuite"] = local_suite
        summary_checks["localSuite"] = local_suite.get("summary", {}).get("passed") is True
    result["summary"] = summarize_checks(summary_checks)
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
            room_suite = None
            queue_suite = None
            local_suite = None
            if args.include_room_suite:
                room_page = context.new_page()
                try:
                    room_page.set_default_timeout(args.timeout_ms)
                    room_id = args.room_id or f"regression_room_{int(time.time())}"
                    room_suite = run_room_suite(
                        room_page,
                        args.base_url,
                        room_id,
                        quiet=args.quiet,
                        timeout_ms=args.timeout_ms,
                        default_page=page,
                    )
                finally:
                    if not is_page_closed(room_page):
                        room_page.close()
            if args.include_queue_suite:
                queue_page = context.new_page()
                try:
                    queue_page.set_default_timeout(args.timeout_ms)
                    queue_suite = run_queue_suite(
                        queue_page,
                        args.base_url,
                        quiet=args.quiet,
                        timeout_ms=args.timeout_ms,
                    )
                finally:
                    if not is_page_closed(queue_page):
                        queue_page.close()
            if args.include_local_suite:
                local_page = context.new_page()
                try:
                    local_page.set_default_timeout(args.timeout_ms)
                    local_suite = run_local_suite(
                        local_page,
                        args.base_url,
                        quiet=args.quiet,
                        timeout_ms=args.timeout_ms,
                    )
                finally:
                    if not is_page_closed(local_page):
                        local_page.close()
            result = build_suite_result(
                trusted_next,
                trusted_prev,
                trusted_playpause_resume,
                trusted_playpause_resume_stale_local_state,
                room_suite=room_suite,
                queue_suite=queue_suite,
                local_suite=local_suite,
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