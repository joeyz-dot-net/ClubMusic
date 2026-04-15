from urllib.parse import parse_qs, urlparse

import pytest


pytest.importorskip("playwright.sync_api")

from tools import browser_control_regression


def test_build_expected_room_playlist_id_matches_room_player_sanitization():
    room_id = r"room.alpha:beta\gamma"

    result = browser_control_regression.build_expected_room_playlist_id(room_id)

    assert result == "room_room_alpha_beta_gamma"


def test_build_room_query_fragment_matches_frontend_websocket_encoding():
    room_id = "room alpha/beta"

    result = browser_control_regression.build_room_query_fragment(room_id)

    assert result == "room_id=room%20alpha%2Fbeta"


def test_build_room_url_preserves_existing_query_and_overwrites_room_id():
    url = "http://127.0.0.1:9000/app/?foo=1&room_id=old"

    result = browser_control_regression.build_room_url(url, "room/new")
    parsed = urlparse(result)

    assert parsed.path == "/app/"
    assert parse_qs(parsed.query) == {
        "foo": ["1"],
        "room_id": ["room/new"],
    }


def test_build_room_suite_checks_fail_isolation_when_default_snapshot_is_not_ready():
    room_id = "room.alpha:beta"
    expected_playlist_id = browser_control_regression.build_expected_room_playlist_id(room_id)
    expected_room_query = browser_control_regression.build_room_query_fragment(room_id)

    checks = browser_control_regression.build_room_suite_checks(
        room_id,
        {
            "roomId": room_id,
            "roomStatus": {"status": "ok", "bot_ready": True},
            "selectedPlaylistId": expected_playlist_id,
            "activeDefaultId": expected_playlist_id,
            "currentPlaylistId": expected_playlist_id,
            "wsUrl": f"ws://127.0.0.1:9000/ws?{expected_room_query}",
        },
        {"ok": True},
        {"ok": True},
        {
            "roomId": room_id,
            "roomStatus": {"status": "ok", "bot_ready": True},
            "currentPlaylistId": expected_playlist_id,
        },
        expected_playlist_id=expected_playlist_id,
        expected_room_query=expected_room_query,
        isolation_result={
            "ready": False,
            "reason": "app-not-ready",
            "roomId": "",
            "selectedPlaylistId": "",
            "wsUrl": "",
        },
    )

    assert checks["roomContextPropagated"] is True
    assert checks["websocketScopedToRoom"] is True
    assert checks["defaultPageNotInRoom"] is False
    assert checks["defaultPagePlaylistNotLeaked"] is False
    assert checks["defaultPageWsNotScopedToRoom"] is False


def test_build_suite_result_includes_optional_queue_suite_in_summary():
    passed_flow = {"summary": {"passed": True}}
    queue_suite = {"summary": {"passed": True}}

    result = browser_control_regression.build_suite_result(
        passed_flow,
        passed_flow,
        {"summary": {"passed": True}, "syncSummary": {"passed": True}, "diagnostics": {"failureMode": None}},
        {"summary": {"passed": True}, "syncSummary": {"passed": True}, "diagnostics": {"failureMode": None}},
        queue_suite=queue_suite,
    )

    assert result["queueSuite"] is queue_suite
    assert result["summary"]["passed"] is True
    assert result["summary"]["checks"]["queueSuite"] is True


def test_build_suite_result_fails_when_optional_queue_suite_fails():
    passed_flow = {"summary": {"passed": True}}
    failing_queue_suite = {"summary": {"passed": False}}

    result = browser_control_regression.build_suite_result(
        passed_flow,
        passed_flow,
        {"summary": {"passed": True}, "syncSummary": {"passed": True}, "diagnostics": {"failureMode": None}},
        {"summary": {"passed": True}, "syncSummary": {"passed": True}, "diagnostics": {"failureMode": None}},
        queue_suite=failing_queue_suite,
    )

    assert result["summary"]["passed"] is False
    assert result["summary"]["checks"]["queueSuite"] is False
    assert "queueSuite" in result["summary"]["failedChecks"]


def test_build_suite_result_includes_optional_local_suite_in_summary():
    passed_flow = {"summary": {"passed": True}}
    local_suite = {"summary": {"passed": True}}

    result = browser_control_regression.build_suite_result(
        passed_flow,
        passed_flow,
        {"summary": {"passed": True}, "syncSummary": {"passed": True}, "diagnostics": {"failureMode": None}},
        {"summary": {"passed": True}, "syncSummary": {"passed": True}, "diagnostics": {"failureMode": None}},
        local_suite=local_suite,
    )

    assert result["localSuite"] is local_suite
    assert result["summary"]["passed"] is True
    assert result["summary"]["checks"]["localSuite"] is True


def test_build_suite_result_fails_when_optional_local_suite_fails():
    passed_flow = {"summary": {"passed": True}}
    failing_local_suite = {"summary": {"passed": False}}

    result = browser_control_regression.build_suite_result(
        passed_flow,
        passed_flow,
        {"summary": {"passed": True}, "syncSummary": {"passed": True}, "diagnostics": {"failureMode": None}},
        {"summary": {"passed": True}, "syncSummary": {"passed": True}, "diagnostics": {"failureMode": None}},
        local_suite=failing_local_suite,
    )

    assert result["summary"]["passed"] is False
    assert result["summary"]["checks"]["localSuite"] is False
    assert "localSuite" in result["summary"]["failedChecks"]