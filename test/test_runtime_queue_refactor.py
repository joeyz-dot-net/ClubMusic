import asyncio
import json
import threading
from pathlib import Path
from types import SimpleNamespace

from models.player import MusicPlayer
from models.playlists import Playlist, Playlists
from routers import dependencies as router_dependencies
from routers import player as player_router
from routers import playlist as playlist_router
from routers import room as room_router
from routers import state as state_router
from routers import websocket as websocket_router


class DummyRequest:
    def __init__(self, json_data=None, form_data=None):
        self._json_data = json_data or {}
        self._form_data = form_data or {}

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
        self.pipe_ready = True

    def get_runtime_queue(self):
        self.runtime_queue.current_playing_index = self.current_index
        return self.runtime_queue

    def mpv_command(self, *_args, **_kwargs):
        return True

    def mpv_pipe_exists(self):
        return self.pipe_ready

    def ensure_mpv(self):
        return True

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


class DummyWebSocket:
    def __init__(self, query_params=None):
        self.accepted = False
        self.messages = []
        self.query_params = query_params or {}
        self.receive_count = 0

    async def accept(self):
        self.accepted = True

    async def send_json(self, message):
        self.messages.append(message)

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

    result = asyncio.run(playlist_router.add_to_playlist(request, player, None))

    assert result["status"] == "OK"
    assert player.runtime_queue.songs[0]["url"] == "song-new.mp3"
    assert broadcasts == [(None, True, 1)]


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

    request = DummyRequest(json_data={"room_id": room_id, "default_volume": 65})

    result = asyncio.run(room_router.init_room(request))

    assert result["status"] == "ok"
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

    request = DummyRequest(json_data={"room_id": room_id, "default_volume": 80})

    result = asyncio.run(room_router.init_room(request))

    assert result["status"] == "ok"
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

    assert result["status"] == "ok"
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

    assert result["status"] == "ok"
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

    assert result["status"] == "ok"
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

    assert result["status"] == "ok"
    assert room_player.destroyed is True
    assert room_id not in room_router.ROOM_PLAYERS
    assert room_id not in room_router.ROOM_HISTORIES
    assert room_id not in room_router.ROOM_LAST_ACTIVITY


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