import errno
import json
import logging
from types import SimpleNamespace

from models.player import MusicPlayer
import models.player as player_model


class FakePipe:
    def __init__(self, lines):
        self._lines = list(lines)
        self.writes = []

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def write(self, data):
        self.writes.append(data)
        return len(data)

    def flush(self):
        return None

    def readline(self):
        if self._lines:
            return self._lines.pop(0)
        return b""


def _make_room_player(room_id="room-test"):
    player = object.__new__(MusicPlayer)
    player.pipe_name = rf"\\.\pipe\mpv-ipc-{room_id}"
    player.mpv_cmd = "mpv --input-ipc-server=test"
    player._room_id = room_id
    player._stop_flag = False
    player.mpv_process = SimpleNamespace(poll=lambda: None)
    player.mpv_pipe_exists = lambda: True
    return player


def test_room_mpv_request_retries_transient_invalid_argument(monkeypatch):
    player = _make_room_player("room-retry")
    payload = {"command": ["get_property", "pause"], "request_id": 7}
    response_line = json.dumps({"request_id": 7, "data": False}).encode("utf-8") + b"\n"
    attempts = {"count": 0}

    def fake_open(path, mode, buffering=0):
        attempts["count"] += 1
        if attempts["count"] == 1:
            raise OSError(errno.EINVAL, "Invalid argument", path)
        return FakePipe([response_line])

    monkeypatch.setattr("builtins.open", fake_open)
    monkeypatch.setattr(player_model.time, "sleep", lambda *_args, **_kwargs: None)

    result = player.mpv_request(payload)

    assert result == {"request_id": 7, "data": False}
    assert attempts["count"] == 2


def test_room_mpv_request_rate_limits_repeated_invalid_argument_warnings(monkeypatch, caplog):
    player = _make_room_player("room-noisy")
    payload = {"command": ["get_property", "volume"], "request_id": 11}
    attempts = {"count": 0}

    def fake_open(path, mode, buffering=0):
        attempts["count"] += 1
        raise OSError(errno.EINVAL, "Invalid argument", path)

    monkeypatch.setattr("builtins.open", fake_open)
    monkeypatch.setattr(player_model.time, "sleep", lambda *_args, **_kwargs: None)

    with caplog.at_level(logging.DEBUG):
        assert player.mpv_request(payload) is None
        assert player.mpv_request(payload) is None

    warnings = [
        record for record in caplog.records
        if record.levelno == logging.WARNING and "[mpv_request]" in record.message
    ]
    assert len(warnings) == 1
    assert attempts["count"] == 6


def test_room_mpv_request_skips_when_player_stopped(monkeypatch):
    player = _make_room_player("room-stopped")
    player._stop_flag = True

    def fail_open(*_args, **_kwargs):
        raise AssertionError("mpv_request should not open the pipe after stop")

    monkeypatch.setattr("builtins.open", fail_open)

    assert player.mpv_request({"command": ["get_property", "pause"], "request_id": 1}) is None