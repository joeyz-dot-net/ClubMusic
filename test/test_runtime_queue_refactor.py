import asyncio
import json
import os
import threading
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from models.api_contracts import (
    DiagnosticInstanceStatusResponse,
    ErrorResponse,
    HistoryAddRequest,
    HistoryDeleteRequest,
    LoopModeResponse,
    PauseToggleResponse,
    PlaybackAdvanceResponse,
    PlaybackControlErrorResponse,
    PlaybackHistoryMergedResponse,
    PlaybackHistoryResponse,
    PitchShiftResponse,
    PlaylistCreateResponse,
    PlaylistCreateRestResponse,
    PlaylistQueryResponse,
    PlaylistRenameResponse,
    PlaylistsListResponse,
    PlayerStatusResponse,
    PlaySuccessResponse,
    RefreshVideoUrlResponse,
    RoomErrorResponse,
    RoomDestroyResponse,
    RoomInitRequest,
    RoomInitResponse,
    RoomListResponse,
    RoomStatusResponse,
    SearchSongResponse,
    SeekResponse,
    SettingsMutationResponse,
    SettingsSchemaResponse,
    ShuffleModeResponse,
    StatusMessageResponse,
    UIConfigResponse,
    UserSettingsResponse,
    VersionResponse,
    VolumeDefaultsResponse,
    VolumeRequestForm,
    VolumeResponse,
)
from models.api_contracts import PlaylistAddRequest, PlaylistNameRequest, SongSnapshot
from models.player import MusicPlayer
from models.playlists import Playlist, Playlists
from routers import dependencies as router_dependencies
from routers import history as history_router
from routers import media as media_router
from routers import player as player_router
from routers import playlist as playlist_router
from routers import room as room_router
from routers import search as search_router
from routers import settings as settings_router
from routers import state as state_router
from routers import websocket as websocket_router


class DummyRequest:
    def __init__(self, json_data=None, form_data=None, query_params=None, headers=None, client=None):
        self._json_data = json_data or {}
        self._form_data = form_data or {}
        self.query_params = query_params or {}
        self.headers = headers or {}
        self.client = client

    async def json(self):
        return self._json_data

    async def form(self):
        return self._form_data


class DummyDependencyRequest:
    def __init__(self, *, room_id=None, pipe=None, path="/status"):
        query_params = {}
        if room_id is not None:
            query_params["room_id"] = room_id
        if pipe is not None:
            query_params["pipe"] = pipe
        self.query_params = query_params
        self.url = SimpleNamespace(path=path)


class DummyQueue:
    def __init__(self, playlist_id="default", name="正在播放", songs=None):
        self.id = playlist_id
        self.name = name
        self.songs = list(songs or [])
        self.updated_at = 0
        self.current_playing_index = -1


class DummyPlayer:
    def __init__(self, songs=None, current_meta=None, current_index=-1):
        self.runtime_queue = DummyQueue(songs=songs)
        self.current_meta = current_meta or {}
        self.current_index = current_index
        self.loop_mode = 0
        self.shuffle_mode = False
        self.pitch_shift = 0
        self._lock = threading.RLock()
        self.mpv_cmd = None
        self.pipe_name = r"\\.\pipe\mpv-pipe"
        self.pipe_ready = True
        self.mpv_state = {
            "pause": False,
            "time-pos": 0,
            "duration": 0,
            "volume": 50,
        }
        self.local_file_tree = {"name": "root", "dirs": [], "files": []}
        self.local_search_max_results = 5
        self.youtube_search_max_results = 8
        self.youtube_url_extra_max = 16
        self.music_dir = os.getcwd()
        self.allowed_extensions = {".mp3", ".flac"}
        self.config = {"LOCAL_VOLUME": "50"}

    def get_runtime_queue(self):
        self.runtime_queue.current_playing_index = self.current_index
        return self.runtime_queue

    def mpv_command(self, cmd, *_args, **_kwargs):
        if cmd[:2] == ["set_property", "volume"] and len(cmd) >= 3:
            self.mpv_state["volume"] = int(cmd[2])
        return True

    def mpv_get(self, property_name):
        return self.mpv_state.get(property_name)

    def search_local(self, query, max_results=20):
        return [{"url": f"{query}.mp3", "title": query, "type": "local", "duration": 0}][:max_results]

    def mpv_pipe_exists(self):
        return self.pipe_ready

    def ensure_mpv(self):
        return True

    def is_room_output_ready(self):
        return True

    def reset_pitch_shift(self):
        self.pitch_shift = 0

    def toggle_loop_mode(self):
        self.loop_mode = (self.loop_mode + 1) % 3

    def toggle_shuffle_mode(self):
        self.shuffle_mode = not self.shuffle_mode

    def set_pitch_shift(self, semitones):
        self.pitch_shift = semitones

    def play(self, song, **_kwargs):
        self.current_meta = song.to_dict()
        return True

    def get_current_meta_snapshot(self):
        return dict(self.current_meta)


class DummyRoomPlayer(DummyPlayer):
    def __init__(self, room_id):
        super().__init__()
        self._room_id = room_id
        self._room_playlist_id = f"room_{room_id}"
        self._pcm_pipe_name = rf"\\.\pipe\pcm-{room_id}"
        self.runtime_queue.id = self._room_playlist_id
        self.runtime_queue.name = f"Room {room_id}"
        self.mpv_process = None
        self.pipe_ready = False
        self.started = False
        self.destroyed = False

    def start_room_mpv(self):
        self.started = True
        self.pipe_ready = True
        self.mpv_process = SimpleNamespace(poll=lambda: None)
        return True

    def is_room_output_ready(self):
        return self.pipe_ready

    def destroy_room_player(self):
        self.destroyed = True


class DummyHistory:
    def __init__(self, items):
        self._items = list(items)
        self.add_calls = []

    def get_all(self):
        return list(self._items)

    def add_to_history(self, *args, **kwargs):
        self.add_calls.append((args, kwargs))

    def remove_by_url(self, url):
        before = len(self._items)
        self._items = [item for item in self._items if item.get("url") != url]
        return len(self._items) != before


class DummyWebSocket:
    def __init__(self, query_params=None):
        self.accepted = False
        self.closed = None
        self.messages = []
        self.query_params = query_params or {}
        self.receive_count = 0

    async def accept(self):
        self.accepted = True

    async def send_json(self, message):
        self.messages.append(message)

    async def close(self, code=1000, reason=""):
        self.closed = {"code": code, "reason": reason}

    async def receive_text(self):
        self.receive_count += 1
        raise websocket_router.WebSocketDisconnect()


class DummyWsManager:
    def __init__(self):
        self.connected = []
        self.disconnected = []

    async def connect(self, websocket, room_id=None):
        self.connected.append((websocket, room_id))

    def disconnect(self, websocket):
        self.disconnected.append(websocket)


def _get_route(router_obj, path, method):
    routes = router_obj.routes if hasattr(router_obj, "routes") else router_obj
    for route in routes:
        if getattr(route, "path", None) == path and method in getattr(route, "methods", set()):
            return route
    raise AssertionError(f"route not found: {method} {path}")


def test_prev_track_walks_backward_without_rewriting_history(monkeypatch):
    broadcasts = []

    async def fake_broadcast(player, playlist_updated=False):
        broadcasts.append((player.current_meta.get("url"), playlist_updated))

    monkeypatch.setattr(player_router, "_broadcast_state", fake_broadcast)

    player = DummyPlayer(
        songs=[
            {"url": "song-c.mp3", "title": "Song C", "type": "local"},
        ],
        current_meta={"url": "song-c.mp3", "title": "Song C", "type": "local"},
        current_index=0,
    )
    history = DummyHistory(
        [
            {"url": "song-c.mp3", "title": "Song C", "type": "local"},
            {"url": "song-b.mp3", "title": "Song B", "type": "local"},
            {"url": "song-a.mp3", "title": "Song A", "type": "local"},
        ]
    )

    first = asyncio.run(player_router.prev_track(None, player, None, history, player._lock))
    second = asyncio.run(player_router.prev_track(None, player, None, history, player._lock))

    assert first["status"] == "OK"
    assert first["current"]["url"] == "song-b.mp3"
    assert second["status"] == "OK"
    assert second["current"]["url"] == "song-a.mp3"
    assert history.add_calls == []
    assert player.runtime_queue.songs[0]["url"] == "song-a.mp3"
    assert broadcasts == [
        ("song-b.mp3", True),
        ("song-a.mp3", True),
    ]


def test_runtime_queue_add_broadcasts_playlist_updated(monkeypatch):
    broadcasts = []

    async def fake_broadcast(player, playlist_updated=False):
        broadcasts.append((player.current_meta.get("url"), playlist_updated, len(player.runtime_queue.songs)))

    monkeypatch.setattr(playlist_router, "_broadcast_state", fake_broadcast)

    player = DummyPlayer(songs=[])
    request = DummyRequest(
        json_data={
            "playlist_id": "default",
            "song": {
                "url": "song-new.mp3",
                "title": "Song New",
                "type": "local",
                "duration": 0,
            },
        }
    )

    payload = PlaylistAddRequest(
        playlist_id="default",
        song=SongSnapshot(url="song-new.mp3", title="Song New", type="local", duration=0),
    )

    result = asyncio.run(playlist_router.add_to_playlist(payload, player, None))

    assert result["status"] == "OK"
    assert player.runtime_queue.songs[0]["url"] == "song-new.mp3"
    assert broadcasts == [(None, True, 1)]


def test_player_router_registers_core_response_models():
    assert _get_route(player_router.router, "/play", "POST").response_model is PlaySuccessResponse
    assert _get_route(player_router.router, "/play_song", "POST").response_model is PlaySuccessResponse
    assert _get_route(player_router.router, "/next", "POST").response_model is PlaybackAdvanceResponse
    assert _get_route(player_router.router, "/prev", "POST").response_model is PlaybackAdvanceResponse
    assert _get_route(player_router.router, "/status", "GET").response_model is PlayerStatusResponse
    assert _get_route(player_router.router, "/pause", "POST").response_model is PauseToggleResponse
    assert _get_route(player_router.router, "/toggle_pause", "POST").response_model is PauseToggleResponse
    assert _get_route(player_router.router, "/seek", "POST").response_model is SeekResponse
    assert _get_route(player_router.router, "/loop", "POST").response_model is LoopModeResponse
    assert _get_route(player_router.router, "/shuffle", "POST").response_model is ShuffleModeResponse
    assert _get_route(player_router.router, "/pitch", "POST").response_model is PitchShiftResponse


def test_playlist_search_settings_history_media_and_room_routes_register_response_models():
    assert _get_route(playlist_router.router, "/playlists", "GET").response_model is PlaylistsListResponse
    assert _get_route(playlist_router.router, "/playlists", "POST").response_model is PlaylistCreateRestResponse
    assert _get_route(playlist_router.router, "/playlist_create", "POST").response_model is PlaylistCreateResponse
    assert _get_route(playlist_router.router, "/playlist", "GET").response_model is PlaylistQueryResponse
    assert _get_route(playlist_router.router, "/playlists/{playlist_id}", "PUT").response_model is PlaylistRenameResponse
    assert _get_route(search_router.router, "/search_song", "POST").response_model is SearchSongResponse
    assert _get_route(settings_router.router, "/version", "GET").response_model is VersionResponse
    assert _get_route(settings_router.router, "/settings", "POST").response_model is SettingsMutationResponse
    assert _get_route(settings_router.router, "/settings/schema", "GET").response_model is SettingsSchemaResponse
    assert _get_route(settings_router.router, "/ui-config", "GET").response_model is UIConfigResponse
    assert _get_route(settings_router.router, "/diagnostic/instance-status", "GET").response_model is DiagnosticInstanceStatusResponse
    assert _get_route(history_router.router, "/playback_history", "GET").response_model is PlaybackHistoryResponse
    assert _get_route(history_router.router, "/playback_history_merged", "GET").response_model is PlaybackHistoryMergedResponse
    assert _get_route(history_router.router, "/song_add_to_history", "POST").response_model is StatusMessageResponse
    assert _get_route(history_router.router, "/playback_history_delete", "POST").response_model is StatusMessageResponse
    assert _get_route(media_router.router, "/refresh_video_url", "POST").response_model is RefreshVideoUrlResponse
    assert _get_route(media_router.router, "/volume", "POST").response_model is VolumeResponse
    assert _get_route(media_router.router, "/volume/defaults", "GET").response_model is VolumeDefaultsResponse
    assert _get_route(room_router.router, "/room/init", "POST").response_model is RoomInitResponse
    assert _get_route(room_router.router, "/room/{room_id}", "DELETE").response_model is RoomDestroyResponse
    assert _get_route(room_router.router, "/room/{room_id}/status", "GET").response_model is RoomStatusResponse
    assert _get_route(room_router.router, "/room/list", "GET").response_model is RoomListResponse


def test_get_status_payload_matches_response_schema():
    player = DummyPlayer(
        songs=[{"url": "status-song.mp3", "title": "Status Song", "type": "local"}],
        current_meta={"url": "status-song.mp3", "title": "Status Song", "type": "local"},
        current_index=0,
    )
    player.loop_mode = 2
    player.shuffle_mode = True
    player.pitch_shift = 1
    player.runtime_queue.updated_at = 123.0
    player.mpv_state = {
        "pause": False,
        "time-pos": 12.5,
        "duration": 240.0,
        "volume": 65,
    }

    result = asyncio.run(player_router.get_status(None, player, None))
    validated = PlayerStatusResponse(**result)

    assert validated.current_meta.url == "status-song.mp3"
    assert validated.current_index == 0
    assert validated.loop_mode == 2
    assert validated.shuffle_mode is True
    assert validated.pitch_shift == 1
    assert validated.mpv_state.time_pos == 12.5
    assert validated.mpv_state.volume == 65


def test_get_current_playlist_payload_matches_response_schema():
    room_player = DummyRoomPlayer("room-contract")
    room_player.runtime_queue.songs = [
        {"url": "room-song.mp3", "title": "Room Song", "type": "local", "duration": 123}
    ]
    room_player.current_index = 0

    shared_playlists = SimpleNamespace(get_playlist=lambda playlist_id: None)

    result = asyncio.run(
        playlist_router.get_current_playlist(
            request=None,
            playlist_id="default",
            player=room_player,
            playlists=shared_playlists,
        )
    )
    validated = PlaylistQueryResponse(**result)

    assert validated.playlist_id == "room_room-contract"
    assert validated.current_index == 0
    assert validated.playlist[0].url == "room-song.mp3"


def test_settings_and_search_payloads_match_response_schema(monkeypatch):
    settings_payload = asyncio.run(settings_router.get_user_settings())
    validated_settings = UserSettingsResponse(**settings_payload)
    assert validated_settings.data.language == "auto"

    settings_schema_payload = asyncio.run(settings_router.get_settings_schema())
    validated_schema = SettingsSchemaResponse(**settings_schema_payload)
    assert validated_schema.model_dump(by_alias=True)["schema"]["theme"]["default"] == "dark"

    version_payload = asyncio.run(settings_router.get_version())
    validated_version = VersionResponse(**version_payload)
    assert validated_version.version

    player = DummyPlayer()
    monkeypatch.setattr(search_router.StreamSong, "search", staticmethod(lambda query, max_results=10: {"status": "OK", "results": []}))
    search_payload = asyncio.run(
        search_router.search_song(
            payload=SimpleNamespace(query="hello", max_results=3),
            player=player,
        )
    )
    validated_search = SearchSongResponse(**search_payload)
    assert validated_search.status == "OK"
    assert validated_search.local_max_results == 5


def test_history_and_media_payloads_match_response_schema():
    player = DummyPlayer()
    player.playback_history = DummyHistory([
        {"url": "song-a.mp3", "title": "Song A", "is_local": True, "ts": 20},
        {"url": "song-b.mp3", "title": "Song B", "is_local": False, "ts": 10},
    ])

    history_payload = asyncio.run(history_router.get_playback_history(player))
    validated_history = PlaybackHistoryResponse(**history_payload)
    assert len(validated_history.history) == 2
    assert validated_history.history[0].url == "song-a.mp3"

    merged_payload = asyncio.run(history_router.get_playback_history_merged(player))
    validated_merged = PlaybackHistoryMergedResponse(**merged_payload)
    assert validated_merged.count == 2

    add_payload = asyncio.run(
        history_router.song_add_to_history(
            HistoryAddRequest(url="song-c.mp3", title="Song C", type="local", thumbnail_url=""),
            player,
        )
    )
    assert StatusMessageResponse(**add_payload).message
    assert player.playback_history.add_calls[-1][0][0] == "song-c.mp3"

    delete_payload = asyncio.run(
        history_router.delete_playback_history(HistoryDeleteRequest(url="song-a.mp3"), player)
    )
    assert StatusMessageResponse(**delete_payload).message

    volume_payload = asyncio.run(media_router.set_volume(VolumeRequestForm(value="65"), player))
    validated_volume = VolumeResponse(**volume_payload)
    assert validated_volume.volume == 65

    defaults_payload = asyncio.run(media_router.get_volume_defaults(player))
    validated_defaults = VolumeDefaultsResponse(**defaults_payload)
    assert validated_defaults.local_volume == 50


def test_runtime_queues_are_player_owned_and_isolated():
    main_player = object.__new__(MusicPlayer)
    main_player.current_index = 1
    main_player._init_runtime_queue("default", "正在播放")

    room_player = object.__new__(MusicPlayer)
    room_player.current_index = 0
    room_player._init_runtime_queue("room_bot_alpha", "Room alpha")

    main_queue = main_player.get_runtime_queue()
    room_queue = room_player.get_runtime_queue()

    main_queue.songs.append({"url": "main-song.mp3", "title": "Main Song", "type": "local"})
    room_queue.songs.append({"url": "room-song.mp3", "title": "Room Song", "type": "local"})

    assert main_queue is main_player.runtime_queue
    assert room_queue is room_player.runtime_queue
    assert main_queue is not room_queue
    assert main_queue.id == "default"
    assert room_queue.id == "room_bot_alpha"
    assert main_queue.current_playing_index == 1
    assert room_queue.current_playing_index == 0
    assert [song["url"] for song in main_queue.songs] == ["main-song.mp3"]
    assert [song["url"] for song in room_queue.songs] == ["room-song.mp3"]


def test_playlists_load_and_save_exclude_runtime_queues(tmp_path):
    data_file = tmp_path / "playlists.json"
    data_file.write_text(
        json.dumps(
            {
                "order": ["default", "shared", "room_demo"],
                "playlists": [
                    {"id": "default", "name": "默认", "songs": [{"url": "default-song.mp3"}]},
                    {"id": "shared", "name": "共享歌单", "songs": [{"url": "shared-song.mp3"}]},
                    {"id": "room_demo", "name": "房间队列", "songs": [{"url": "room-song.mp3"}]},
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    playlists = Playlists(str(data_file))

    assert playlists.get_playlist("default") is None
    assert playlists.get_playlist("room_demo") is None
    assert playlists.get_playlist("shared") is not None
    assert playlists.get_all()[0].id == "shared"

    playlists._playlists["default"] = Playlist("default", "默认", songs=[{"url": "runtime-default.mp3"}])
    playlists._playlists["room_extra"] = Playlist("room_extra", "Room Extra", songs=[{"url": "runtime-room.mp3"}])
    playlists._order = ["default", "shared", "room_extra"]
    playlists._do_save()

    saved = json.loads(Path(data_file).read_text(encoding="utf-8"))
    assert saved["order"] == ["shared"]
    assert [playlist["id"] for playlist in saved["playlists"]] == ["shared"]


def test_get_player_for_request_prefers_room_player(monkeypatch):
    default_player = object()
    room_player = SimpleNamespace(_room_id="room-alpha", _lock=threading.RLock())
    touched_rooms = []

    monkeypatch.setattr(router_dependencies, "PLAYER", default_player)
    monkeypatch.setattr(router_dependencies, "get_player_for_room_id", lambda room_id: room_player if room_id == "room-alpha" else None)
    monkeypatch.setattr(router_dependencies, "touch_room_activity", lambda room_id: touched_rooms.append(room_id))

    request = DummyDependencyRequest(room_id="room-alpha", path="/playlist")

    resolved = router_dependencies.get_player_for_request(request)

    assert resolved is room_player
    assert touched_rooms == ["room-alpha"]


def test_get_player_for_request_falls_back_to_pipe_when_no_room(monkeypatch):
    default_player = object()
    pipe_player = object()

    monkeypatch.setattr(router_dependencies, "PLAYER", default_player)
    monkeypatch.setattr(router_dependencies, "get_player_for_pipe", lambda pipe: pipe_player if pipe == "custom-pipe" else default_player)

    request = DummyDependencyRequest(pipe="custom-pipe", path="/status")

    resolved = router_dependencies.get_player_for_request(request)

    assert resolved is pipe_player


def test_get_player_for_request_raises_when_room_is_being_created(monkeypatch):
    monkeypatch.setattr(router_dependencies, "get_player_for_room_id", lambda room_id: None)
    monkeypatch.setattr(router_dependencies, "_creating_rooms", {"room-pending"})

    request = DummyDependencyRequest(room_id="room-pending", path="/status")

    with pytest.raises(HTTPException) as exc_info:
        router_dependencies.get_player_for_request(request)

    assert exc_info.value.status_code == 409
    assert exc_info.value.detail == "room is being created"


def test_get_player_for_request_raises_when_room_is_missing(monkeypatch):
    monkeypatch.setattr(router_dependencies, "get_player_for_room_id", lambda room_id: None)
    monkeypatch.setattr(router_dependencies, "_creating_rooms", set())

    request = DummyDependencyRequest(room_id="room-missing", path="/status")

    with pytest.raises(HTTPException) as exc_info:
        router_dependencies.get_player_for_request(request)

    assert exc_info.value.status_code == 404
    assert exc_info.value.detail == "room not found"


def test_get_playback_history_returns_room_history(monkeypatch):
    room_player = SimpleNamespace(_room_id="room-beta", _lock=threading.RLock())
    room_history = object()
    default_history = object()

    monkeypatch.setattr(router_dependencies, "get_player_for_request", lambda request: room_player)
    monkeypatch.setattr(router_dependencies, "ROOM_HISTORIES", {"room-beta": room_history})
    monkeypatch.setattr(router_dependencies, "PLAYBACK_HISTORY", default_history)

    request = DummyDependencyRequest(room_id="room-beta", path="/playback_history")

    resolved = router_dependencies.get_playback_history(request)

    assert resolved is room_history


def test_room_init_registers_player_and_history(monkeypatch):
    room_id = "room-alpha"
    created_players = []
    history_instances = []

    class DummyPlayHistory:
        def __init__(self, max_size=500):
            self.max_size = max_size
            history_instances.append(self)

    def fake_create_room_player(**kwargs):
        player = DummyRoomPlayer(kwargs["room_id"])
        created_players.append((player, kwargs))
        return player

    monkeypatch.setattr(room_router, "PlayHistory", DummyPlayHistory)
    monkeypatch.setattr(room_router.MusicPlayer, "create_room_player", staticmethod(fake_create_room_player))
    monkeypatch.setattr(room_router, "ROOM_PLAYERS", {})
    monkeypatch.setattr(room_router, "ROOM_HISTORIES", {})
    monkeypatch.setattr(room_router, "ROOM_LAST_ACTIVITY", {})
    monkeypatch.setattr(room_router, "_creating_rooms", set())
    monkeypatch.setattr(room_router, "ROOM_MAX", 10)
    monkeypatch.setattr(room_router, "_room_players_lock", threading.Lock())
    monkeypatch.setattr(room_router, "PLAYLISTS_MANAGER", object())
    monkeypatch.setattr(room_router, "PLAYER", SimpleNamespace(music_dir="D:/Music"))
    monkeypatch.setattr(room_router, "_make_room_broadcast", lambda room_id_arg: f"broadcast:{room_id_arg}")
    monkeypatch.setattr(
        room_router,
        "touch_room_activity",
        lambda room_id_arg: room_router.ROOM_LAST_ACTIVITY.__setitem__(room_id_arg, 1.0),
    )

    result = asyncio.run(room_router.init_room(RoomInitRequest(room_id=room_id, default_volume=65)))
    validated = RoomInitResponse(**result)

    assert result["status"] == "ok"
    assert validated.existed is False
    assert result["existed"] is False
    assert room_id in room_router.ROOM_PLAYERS
    assert room_id in room_router.ROOM_HISTORIES
    assert room_router.ROOM_LAST_ACTIVITY[room_id] > 0
    assert len(history_instances) == 1
    assert len(created_players) == 1
    created_player, kwargs = created_players[0]
    assert kwargs["room_id"] == room_id
    assert kwargs["default_volume"] == 65
    assert kwargs["music_dir"] == "D:/Music"
    assert kwargs["broadcast_from_thread"] == f"broadcast:{room_id}"
    assert kwargs["playback_history"] is history_instances[0]
    assert created_player.started is True
    assert result["bot_ready"] is True
    assert result["current_playlist_id"] == f"room_{room_id}"
    assert result["queue_length"] == 0


def test_room_init_recovers_existing_unready_room_player(monkeypatch):
    room_id = "room-recover"
    room_player = DummyRoomPlayer(room_id)

    monkeypatch.setattr(room_router, "ROOM_PLAYERS", {room_id: room_player})
    monkeypatch.setattr(room_router, "ROOM_HISTORIES", {room_id: object()})
    monkeypatch.setattr(room_router, "ROOM_LAST_ACTIVITY", {})
    monkeypatch.setattr(room_router, "_creating_rooms", set())
    monkeypatch.setattr(room_router, "ROOM_MAX", 10)
    monkeypatch.setattr(room_router, "_room_players_lock", threading.Lock())
    monkeypatch.setattr(
        room_router,
        "touch_room_activity",
        lambda room_id_arg: room_router.ROOM_LAST_ACTIVITY.__setitem__(room_id_arg, 2.0),
    )

    result = asyncio.run(room_router.init_room(RoomInitRequest(room_id=room_id, default_volume=80)))
    validated = RoomInitResponse(**result)

    assert result["status"] == "ok"
    assert validated.bot_ready is True
    assert result["existed"] is True
    assert result["bot_ready"] is True
    assert result["mpv_running"] is True
    assert room_player.started is True


def test_room_status_returns_room_bot_snapshot(monkeypatch):
    room_id = "room-status"
    room_player = DummyRoomPlayer(room_id)
    room_player.start_room_mpv()
    room_player.current_index = 1
    room_player.current_meta = {"url": "status-song.mp3", "title": "Status Song", "type": "local"}
    room_player.runtime_queue.songs = [
        {"url": "queued-a.mp3", "title": "Queued A", "type": "local"},
        {"url": "status-song.mp3", "title": "Status Song", "type": "local"},
    ]
    room_player.runtime_queue.updated_at = 42.0

    monkeypatch.setattr(room_router, "ROOM_PLAYERS", {room_id: room_player})
    monkeypatch.setattr(room_router, "ROOM_LAST_ACTIVITY", {room_id: 99.0})
    monkeypatch.setattr(room_router, "_room_players_lock", threading.Lock())

    result = asyncio.run(room_router.room_status(room_id))
    validated = RoomStatusResponse(**result)

    assert result["status"] == "ok"
    assert validated.current_meta.url == "status-song.mp3"
    assert result["exists"] is True
    assert result["bot_ready"] is True
    assert result["current_playlist_id"] == f"room_{room_id}"
    assert result["current_index"] == 1
    assert result["queue_length"] == 2
    assert result["playlist_updated_at"] == 42.0
    assert result["current_meta"]["url"] == "status-song.mp3"
    assert result["last_activity"] == 99.0


def test_room_status_returns_empty_snapshot_when_room_missing(monkeypatch):
    room_id = "room-missing"

    monkeypatch.setattr(room_router, "ROOM_PLAYERS", {})
    monkeypatch.setattr(room_router, "ROOM_LAST_ACTIVITY", {})
    monkeypatch.setattr(room_router, "_room_players_lock", threading.Lock())

    result = asyncio.run(room_router.room_status(room_id))
    validated = RoomStatusResponse(**result)

    assert result["status"] == "ok"
    assert validated.exists is False
    assert result["exists"] is False
    assert result["bot_ready"] is False
    assert result["queue_length"] == 0
    assert result["current_meta"] == {}


def test_list_rooms_returns_room_bot_snapshots(monkeypatch):
    alpha = DummyRoomPlayer("room-alpha-list")
    alpha.start_room_mpv()
    alpha.runtime_queue.songs = [{"url": "alpha.mp3", "title": "Alpha", "type": "local"}]

    beta = DummyRoomPlayer("room-beta-list")
    beta.start_room_mpv()
    beta.current_meta = {"url": "beta.mp3", "title": "Beta", "type": "local"}

    monkeypatch.setattr(room_router, "ROOM_PLAYERS", {
        "room-alpha-list": alpha,
        "room-beta-list": beta,
    })
    monkeypatch.setattr(room_router, "ROOM_LAST_ACTIVITY", {
        "room-alpha-list": 10.0,
        "room-beta-list": 20.0,
    })
    monkeypatch.setattr(room_router, "ROOM_MAX", 10)
    monkeypatch.setattr(room_router, "_room_players_lock", threading.Lock())

    result = asyncio.run(room_router.list_rooms())
    validated = RoomListResponse(**result)

    assert result["status"] == "ok"
    assert validated.count == 2
    assert result["count"] == 2
    assert result["max"] == 10
    assert {room["room_id"] for room in result["rooms"]} == {"room-alpha-list", "room-beta-list"}
    room_map = {room["room_id"]: room for room in result["rooms"]}
    assert room_map["room-alpha-list"]["queue_length"] == 1
    assert room_map["room-alpha-list"]["bot_ready"] is True
    assert room_map["room-beta-list"]["current_meta"]["url"] == "beta.mp3"


def test_destroy_room_cleans_registered_state(monkeypatch):
    room_id = "room-beta"
    room_player = DummyRoomPlayer(room_id)

    monkeypatch.setattr(room_router, "ROOM_PLAYERS", {room_id: room_player})
    monkeypatch.setattr(room_router, "ROOM_HISTORIES", {room_id: object()})
    monkeypatch.setattr(room_router, "ROOM_LAST_ACTIVITY", {room_id: 123.0})
    monkeypatch.setattr(room_router, "_room_players_lock", threading.Lock())

    result = asyncio.run(room_router.destroy_room(room_id))
    validated = RoomDestroyResponse(**result)

    assert result["status"] == "ok"
    assert validated.status == "ok"
    assert room_player.destroyed is True
    assert room_id not in room_router.ROOM_PLAYERS
    assert room_id not in room_router.ROOM_HISTORIES
    assert room_id not in room_router.ROOM_LAST_ACTIVITY


def test_room_init_rejects_missing_room_id():
    response = asyncio.run(room_router.init_room(RoomInitRequest(room_id="  ", default_volume=80)))
    payload = json.loads(response.body)
    validated = RoomErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.message == "missing room_id"
    assert payload == {"status": "error", "message": "missing room_id"}


def test_destroy_room_returns_404_when_room_is_missing(monkeypatch):
    monkeypatch.setattr(room_router, "ROOM_PLAYERS", {})
    monkeypatch.setattr(room_router, "_room_players_lock", threading.Lock())

    response = asyncio.run(room_router.destroy_room("room-missing"))
    payload = json.loads(response.body)
    validated = RoomErrorResponse(**payload)

    assert response.status_code == 404
    assert validated.message == "room not found"
    assert payload == {"status": "error", "message": "room not found"}


def test_update_single_setting_rejects_unknown_key():
    response = asyncio.run(settings_router.update_single_setting("unknown", settings_router.SettingsValueRequest(value="x")))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "未知的设置项: unknown"
    assert payload == {"status": "ERROR", "error": "未知的设置项: unknown"}


def test_create_playlist_restful_rejects_blank_name():
    response = asyncio.run(
        playlist_router.create_playlist_restful(
            PlaylistNameRequest(name="   "),
            playlists=SimpleNamespace(create_playlist=lambda name: None),
        )
    )
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "歌单名称不能为空"
    assert payload == {"status": "ERROR", "error": "歌单名称不能为空"}


def test_delete_playback_history_rejects_missing_url():
    player = SimpleNamespace(playback_history=DummyHistory([]))

    response = asyncio.run(history_router.delete_playback_history(HistoryDeleteRequest(url=""), player=player))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "url不能为空"
    assert payload == {"status": "ERROR", "error": "url不能为空"}


def test_delete_playback_history_returns_404_when_entry_missing():
    player = SimpleNamespace(playback_history=DummyHistory([]))

    response = asyncio.run(history_router.delete_playback_history(HistoryDeleteRequest(url="missing.mp3"), player=player))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 404
    assert validated.error == "未找到该播放历史记录"
    assert payload == {"status": "ERROR", "error": "未找到该播放历史记录"}


def test_refresh_video_url_rejects_non_youtube_song():
    player = DummyPlayer(current_meta={"url": "local.mp3", "title": "Local", "type": "local"})

    response = asyncio.run(media_router.refresh_video_url(player=player))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "当前不是YouTube歌曲"
    assert payload == {"status": "ERROR", "error": "当前不是YouTube歌曲"}


def test_set_volume_rejects_invalid_value():
    player = DummyPlayer()

    response = asyncio.run(media_router.set_volume(VolumeRequestForm(value="loud"), player=player))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "无效的音量值: loud"
    assert payload == {"status": "ERROR", "error": "无效的音量值: loud"}


def test_play_rejects_blank_url():
    player = DummyPlayer()
    request = DummyRequest(headers={}, query_params={})

    response = asyncio.run(
        player_router.play(
            request,
            player_router.PlayRequestForm(url="", title="", type="local", stream_format="mp3", duration=0),
            player,
            SimpleNamespace(),
            DummyHistory([]),
            player._lock,
        )
    )
    payload = json.loads(response.body)
    validated = PlaybackControlErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "URL不能为空"
    assert payload == {"status": "ERROR", "error": "URL不能为空"}


def test_next_track_empty_payload_matches_response_schema():
    player = DummyPlayer(songs=[])
    request = DummyRequest(headers={}, query_params={})

    result = asyncio.run(player_router.next_track(request, player, None, DummyHistory([]), player._lock))
    validated = PlaybackAdvanceResponse(**result)

    assert validated.status == "EMPTY"
    assert validated.message == "队列为空"
    assert result == {"status": "EMPTY", "message": "队列为空"}


def test_next_track_returns_room_output_not_ready_error_shape():
    player = DummyRoomPlayer("room-blocked")
    request = DummyRequest(headers={}, query_params={})

    response = asyncio.run(player_router.next_track(request, player, None, DummyHistory([]), player._lock))
    payload = json.loads(response.body)
    validated = PlaybackControlErrorResponse(**payload)

    assert response.status_code == 409
    assert validated.error == "房间音频输出未就绪，请先连接 ClubVoice"
    assert validated.room_id == "room-blocked"
    assert validated.pcm_pipe == player._pcm_pipe_name


def test_prev_track_empty_payload_matches_response_schema():
    player = DummyPlayer(
        songs=[{"url": "song-c.mp3", "title": "Song C", "type": "local"}],
        current_meta={"url": "song-c.mp3", "title": "Song C", "type": "local"},
        current_index=0,
    )
    history = DummyHistory([
        {"url": "song-c.mp3", "title": "Song C", "type": "local"},
    ])

    response = asyncio.run(player_router.prev_track(None, player, None, history, player._lock))
    payload = json.loads(response.body)
    validated = PlaybackAdvanceResponse(**payload)

    assert response.status_code == 200
    assert validated.status == "EMPTY"
    assert validated.message == "播放历史中没有上一首"


def test_prev_track_rejects_song_missing_from_history():
    player = DummyPlayer(
        songs=[{"url": "song-x.mp3", "title": "Song X", "type": "local"}],
        current_meta={"url": "song-x.mp3", "title": "Song X", "type": "local"},
        current_index=0,
    )
    history = DummyHistory([
        {"url": "other.mp3", "title": "Other", "type": "local"},
    ])

    response = asyncio.run(player_router.prev_track(None, player, None, history, player._lock))
    payload = json.loads(response.body)
    validated = PlaybackControlErrorResponse(**payload)

    assert response.status_code == 404
    assert validated.error == "当前歌曲不在播放历史中"


def test_search_song_rejects_blank_query():
    player = DummyPlayer()

    response = asyncio.run(search_router.search_song(search_router.SearchSongRequest(query="   "), player=player))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "搜索词不能为空"
    assert payload == {"status": "ERROR", "error": "搜索词不能为空"}


def test_get_directory_songs_rejects_path_escape():
    player = DummyPlayer()
    player.music_dir = "D:/Music"

    response = asyncio.run(search_router.get_directory_songs(search_router.DirectorySongsRequest(directory="../outside"), player=player))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "无效的目录路径"
    assert payload == {"status": "ERROR", "error": "无效的目录路径"}


def test_set_pitch_shift_rejects_invalid_semitones():
    player = DummyPlayer()

    response = asyncio.run(player_router.set_pitch_shift(None, SimpleNamespace(semitones="bad"), player=player))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert "无效的半音值" in validated.error


def test_youtube_extract_playlist_requires_url():
    player = DummyPlayer()
    request = DummyRequest(form_data={})

    response = asyncio.run(player_router.youtube_extract_playlist(request, player=player))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "URL不能为空"
    assert payload == {"status": "ERROR", "error": "URL不能为空"}


def test_play_youtube_playlist_rejects_empty_list():
    player = DummyPlayer()
    request = DummyRequest(json_data={"videos": []})

    response = asyncio.run(player_router.play_youtube_playlist(request, player=player, playlists=SimpleNamespace()))
    payload = json.loads(response.body)
    validated = ErrorResponse(**payload)

    assert response.status_code == 400
    assert validated.error == "播放列表为空"
    assert payload == {"status": "ERROR", "error": "播放列表为空"}


def test_connection_manager_broadcasts_only_to_target_room():
    manager = state_router.ConnectionManager()
    default_ws = DummyWebSocket()
    room_ws = DummyWebSocket()

    asyncio.run(manager.connect(default_ws, room_id=None))
    asyncio.run(manager.connect(room_ws, room_id="room-gamma"))
    asyncio.run(manager.broadcast_to_room("room-gamma", {"type": "state_update", "value": 1}))

    assert default_ws.messages == []
    assert room_ws.messages == [{"type": "state_update", "value": 1}]


def test_broadcast_state_targets_room_specific_connections(monkeypatch):
    captured = []

    class DummyManager:
        active_connections = {"connected"}

        async def broadcast_to_room(self, room_id, message):
            captured.append((room_id, message))

    room_player = DummyRoomPlayer("room-delta")
    room_player.current_meta = {"url": "room-song.mp3", "title": "Room Song", "type": "local"}
    room_player.current_index = 0
    room_player.runtime_queue.updated_at = 123.0

    monkeypatch.setattr(state_router, "ws_manager", DummyManager())
    monkeypatch.setattr(state_router, "get_runtime_playlist", lambda player: player.runtime_queue)
    monkeypatch.setattr(state_router, "get_current_playlist_id", lambda player: player.runtime_queue.id)
    monkeypatch.setattr(state_router, "time", SimpleNamespace(time=lambda: 456.0))

    asyncio.run(state_router._broadcast_state(room_player, playlist_updated=True))

    assert len(captured) == 1
    room_id, message = captured[0]
    assert room_id == "room-delta"
    assert message["playlist_updated"] is True
    assert message["current_playlist_id"] == "room_room-delta"
    assert message["current_meta"]["url"] == "room-song.mp3"


def test_websocket_endpoint_sends_room_snapshot(monkeypatch):
    manager = DummyWsManager()
    room_player = DummyRoomPlayer("room-epsilon")
    room_player.current_meta = {"url": "epsilon.mp3", "title": "Epsilon", "type": "local"}
    room_player.runtime_queue.updated_at = 10
    selected_players = []

    monkeypatch.setattr(websocket_router, "get_player_for_room_id", lambda room_id: room_player if room_id == "room-epsilon" else None)
    monkeypatch.setattr(websocket_router, "PLAYER", SimpleNamespace(name="default-player"))
    monkeypatch.setattr(
        websocket_router,
        "_build_state_message",
        lambda player, playlist_updated=False: selected_players.append(player) or {
            "type": "state_update",
            "player_id": getattr(player, "_room_id", "default"),
            "playlist_updated": playlist_updated,
        },
    )

    websocket = DummyWebSocket(query_params={"room_id": "room-epsilon"})

    asyncio.run(websocket_router.websocket_endpoint(websocket, manager=manager))

    assert manager.connected == [(websocket, "room-epsilon")]
    assert manager.disconnected == [websocket]
    assert selected_players == [room_player]
    assert websocket.messages == [{"type": "state_update", "player_id": "room-epsilon", "playlist_updated": False}]


def test_websocket_endpoint_defaults_to_main_player_snapshot(monkeypatch):
    manager = DummyWsManager()
    default_player = SimpleNamespace(name="default-player")
    selected_players = []

    monkeypatch.setattr(websocket_router, "PLAYER", default_player)
    monkeypatch.setattr(websocket_router, "get_player_for_room_id", lambda room_id: None)
    monkeypatch.setattr(
        websocket_router,
        "_build_state_message",
        lambda player, playlist_updated=False: selected_players.append(player) or {
            "type": "state_update",
            "player_id": getattr(player, "name", "unknown"),
            "playlist_updated": playlist_updated,
        },
    )

    websocket = DummyWebSocket(query_params={})

    asyncio.run(websocket_router.websocket_endpoint(websocket, manager=manager))

    assert manager.connected == [(websocket, None)]
    assert manager.disconnected == [websocket]
    assert selected_players == [default_player]
    assert websocket.messages == [{"type": "state_update", "player_id": "default-player", "playlist_updated": False}]


def test_websocket_endpoint_closes_when_room_is_being_created(monkeypatch):
    manager = DummyWsManager()

    monkeypatch.setattr(websocket_router, "get_player_for_room_id", lambda room_id: None)
    monkeypatch.setattr(websocket_router, "_creating_rooms", {"room-pending"})

    websocket = DummyWebSocket(query_params={"room_id": "room-pending"})

    asyncio.run(websocket_router.websocket_endpoint(websocket, manager=manager))

    assert manager.connected == []
    assert manager.disconnected == []
    assert websocket.closed == {"code": 1013, "reason": "room is being created"}
    assert websocket.messages == []


def test_websocket_endpoint_closes_when_room_is_missing(monkeypatch):
    manager = DummyWsManager()

    monkeypatch.setattr(websocket_router, "get_player_for_room_id", lambda room_id: None)
    monkeypatch.setattr(websocket_router, "_creating_rooms", set())

    websocket = DummyWebSocket(query_params={"room_id": "room-missing"})

    asyncio.run(websocket_router.websocket_endpoint(websocket, manager=manager))

    assert manager.connected == []
    assert manager.disconnected == []
    assert websocket.closed == {"code": 1008, "reason": "room not found"}
    assert websocket.messages == []


def test_resolve_playlist_for_request_maps_default_to_room_runtime_queue():
    room_player = DummyRoomPlayer("room-zeta")
    room_player.runtime_queue.songs = [{"url": "room-only.mp3", "title": "Room Only", "type": "local"}]

    shared_playlists = SimpleNamespace(
        get_playlist=lambda playlist_id: None,
    )

    playlist, target_playlist_id, is_runtime = state_router.resolve_playlist_for_request(
        room_player,
        shared_playlists,
        "default",
    )

    assert playlist is room_player.runtime_queue
    assert target_playlist_id == "room_room-zeta"
    assert is_runtime is True
    assert playlist.songs[0]["url"] == "room-only.mp3"


def test_room_playlist_endpoint_returns_room_runtime_queue_for_default_alias():
    room_player = DummyRoomPlayer("room-eta")
    room_player.runtime_queue.songs = [
        {"url": "room-song.mp3", "title": "Room Song", "type": "local", "duration": 123}
    ]
    room_player.current_index = 0

    shared_playlists = SimpleNamespace(
        get_playlist=lambda playlist_id: None,
    )

    result = asyncio.run(
        playlist_router.get_current_playlist(
            request=None,
            playlist_id="default",
            player=room_player,
            playlists=shared_playlists,
        )
    )

    assert result["status"] == "OK"
    assert result["playlist_id"] == "room_room-eta"
    assert result["playlist_name"] == "Room room-eta"
    assert result["current_index"] == 0
    assert result["playlist"][0]["url"] == "room-song.mp3"


def test_switch_playlist_accepts_default_alias_for_room_runtime_queue():
    room_player = DummyRoomPlayer("room-theta")
    room_player.runtime_queue.songs = [{"url": "theta.mp3", "title": "Theta", "type": "local"}]

    shared_playlists = SimpleNamespace(
        get_playlist=lambda playlist_id: None,
    )

    result = asyncio.run(
        playlist_router.switch_playlist(
            playlist_id="default",
            player=room_player,
            playlists=shared_playlists,
        )
    )

    assert result["status"] == "OK"
    assert result["playlist"]["id"] == "room_room-theta"
    assert result["playlist"]["name"] == "Room room-theta"
    assert result["playlist"]["count"] == 1