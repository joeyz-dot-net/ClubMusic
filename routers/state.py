# -*- coding: utf-8 -*-
"""
routers/state.py - 全局共享状态和辅助函数

所有 Router 模块通过本文件访问全局单例，避免循环导入。
"""

import os
import sys
import time
import logging
import asyncio
import threading
from typing import Dict

from fastapi import WebSocket
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

# ==================== 模型导入 ====================
from models import (
    Song,
    LocalSong,
    StreamSong,
    Playlist,
    LocalPlaylist,
    MusicPlayer,
    Playlists,
)

from models.settings import initialize_settings

# ==================== 获取资源路径函数 ====================
def _get_resource_path(relative_path: str) -> str:
    """获取资源路径（支持 PyInstaller 打包后的环境）

    由于本文件在 routers/ 子目录中，开发环境下需要往上两级到项目根目录。
    PyInstaller 打包后使用 sys._MEIPASS。
    """
    if getattr(sys, 'frozen', False):
        base_path = getattr(sys, '_MEIPASS', os.path.dirname(sys.executable))
    else:
        # 开发环境：routers/ -> 项目根目录
        base_path = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base_path, relative_path)


# ==================== 全局单例实例 ====================
SETTINGS = initialize_settings()

PLAYER = MusicPlayer.initialize(data_dir=".")

PLAYLISTS_MANAGER = Playlists()

logger.info("\n✓ 所有模块初始化完成！\n")

DEFAULT_PLAYLIST_ID = "default"
CURRENT_PLAYLIST_ID = DEFAULT_PLAYLIST_ID
PLAYBACK_HISTORY = PLAYER.playback_history

# ==================== 并发保护 ====================
# 复用 PLAYER 内已有的 RLock 作为全局播放锁
# RLock 支持同线程重入，避免 handle_playback_end -> PLAYER.play() 路径的死锁
_player_lock: threading.RLock = PLAYER._lock

# 事件循环引用（供后台线程跨线程触发 WebSocket 广播）
_main_loop = None

# ==================== WebSocket 连接管理 ====================

class ConnectionManager:
    """管理所有活跃的 WebSocket 客户端连接，支持 per-room 分组"""

    def __init__(self):
        self.active_connections: set = set()
        # room_id -> set[WebSocket]，None 表示默认播放器（dev/prod）
        self._room_connections: dict = {}
        # WebSocket -> room_id（反向映射，方便 disconnect 时查找）
        self._ws_to_room: dict = {}

    async def connect(self, websocket: WebSocket, room_id: str = None):
        await websocket.accept()
        self.active_connections.add(websocket)
        # 按 room_id 分组
        if room_id not in self._room_connections:
            self._room_connections[room_id] = set()
        self._room_connections[room_id].add(websocket)
        self._ws_to_room[websocket] = room_id
        room_label = room_id or '(default)'
        logger.info(f"[WS] 客户端连接 room={room_label}，当前连接数: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        room_id = self._ws_to_room.pop(websocket, None)
        if room_id in self._room_connections:
            self._room_connections[room_id].discard(websocket)
            if not self._room_connections[room_id]:
                del self._room_connections[room_id]
        elif None in self._room_connections:
            self._room_connections[None].discard(websocket)
        logger.info(f"[WS] 客户端断开，当前连接数: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """广播消息给默认房间（room_id=None）的客户端"""
        await self.broadcast_to_room(None, message)

    async def broadcast_to_room(self, room_id: str, message: dict):
        """广播消息给指定 room 的客户端，自动清理失效连接"""
        conns = self._room_connections.get(room_id, set())
        if not conns:
            return
        dead = set()
        for conn in conns:
            try:
                await conn.send_json(message)
            except Exception:
                dead.add(conn)
        if dead:
            conns -= dead
            self.active_connections -= dead
            for ws in dead:
                self._ws_to_room.pop(ws, None)

    def has_connections_for_room(self, room_id: str) -> bool:
        """检查指定 room 是否有活跃连接"""
        return bool(self._room_connections.get(room_id))


ws_manager = ConnectionManager()


# ==================== MPV 包装函数 ====================
# 必须在 _build_state_message 之前定义

def mpv_command(cmd_list):
    """向 MPV 发送命令"""
    return PLAYER.mpv_command(cmd_list)


def mpv_get(property_name):
    """获取 MPV 属性值"""
    return PLAYER.mpv_get(property_name)


# ==================== 状态消息和广播函数 ====================

def _build_state_message(player: MusicPlayer = None, playlist_updated: bool = False) -> dict:
    """构建要广播的状态消息（同步函数，可在任意线程调用）

    Args:
        player: 目标播放器实例。None 则使用全局默认 PLAYER。
    """
    p = player or PLAYER
    current_playlist = get_runtime_playlist(p)
    try:
        mpv_state = {
            "paused": p.mpv_get("pause"),
            "time_pos": p.mpv_get("time-pos"),
            "duration": p.mpv_get("duration"),
            "volume": p.mpv_get("volume"),
        }
    except Exception:
        mpv_state = {"paused": True, "time_pos": 0, "duration": 0, "volume": 50}
    return {
        "type": "state_update",
        "current_meta": p.get_current_meta_snapshot(),
        "mpv_state": mpv_state,
        "loop_mode": p.loop_mode,
        "shuffle_mode": getattr(p, 'shuffle_mode', False),
        "pitch_shift": p.pitch_shift,
        "current_playlist_id": get_current_playlist_id(p),
        "current_index": getattr(p, 'current_index', -1),
        "playlist_updated_at": getattr(current_playlist, 'updated_at', 0) if current_playlist else 0,
        "playlist_updated": playlist_updated,
        "ts": time.time(),
        "server_time": time.time(),
    }


async def _broadcast_state(player: MusicPlayer = None, playlist_updated: bool = False):
    """广播当前状态给对应 room 的 WebSocket 客户端（必须在锁外调用）

    Args:
        player: 目标播放器。None 或默认 PLAYER → 广播给 room_id=None 的连接；
                RoomPlayer → 广播给对应 room_id 的连接。
    """
    if not ws_manager.active_connections:
        return
    p = player or PLAYER
    room_id = getattr(p, '_room_id', None)
    msg = _build_state_message(p, playlist_updated=playlist_updated)
    await ws_manager.broadcast_to_room(room_id, msg)


def _broadcast_from_thread(playlist_updated: bool = True):
    """从后台线程安全地触发默认 PLAYER 的 WebSocket 广播（线程安全入口）"""
    if _main_loop is None or not ws_manager.active_connections:
        return
    try:
        asyncio.run_coroutine_threadsafe(_broadcast_state(playlist_updated=playlist_updated), _main_loop)
    except Exception as e:
        logger.debug(f"[WS] 跨线程广播失败: {e}")


def _make_room_broadcast(room_id: str):
    """为 RoomPlayer 创建 room-specific 的广播回调（闭包）。

    返回的函数签名与 _broadcast_from_thread 相同，可直接传给
    MusicPlayer.set_external_deps(broadcast_from_thread=...)。
    """
    def _room_broadcast(playlist_updated: bool = True):
        if _main_loop is None:
            return
        with _room_players_lock:
            player = ROOM_PLAYERS.get(room_id)
        if player is None:
            return
        if not ws_manager.has_connections_for_room(room_id):
            return
        try:
            asyncio.run_coroutine_threadsafe(
                _broadcast_state(player, playlist_updated=playlist_updated), _main_loop
            )
        except Exception as e:
            logger.debug(f"[WS] 房间 {room_id} 跨线程广播失败: {e}")
    return _room_broadcast


# ==================== 统一错误响应 ====================

def error_response(
    msg: str,
    status_code: int = 500,
    *,
    exc: Exception = None,
    _logger: logging.Logger = None,
    extra: dict = None,
) -> JSONResponse:
    """返回标准化的 JSON 错误响应，并自动记录日志。

    - 当提供 *exc* 时：记录 msg + 完整堆栈；5xx 响应对客户端隐藏内部细节
    - 当 *exc* 为 None 且 status >= 500 时：仅记录 msg
    - 4xx：直接将 *msg* 返回给客户端，不自动记录日志
    """
    _log = _logger or logger
    if exc is not None:
        _log.error(msg, exc_info=exc)
        client_msg = "Internal server error" if status_code >= 500 else msg
    else:
        if status_code >= 500:
            _log.error(msg)
        client_msg = msg
    body: dict = {"status": "ERROR", "error": client_msg}
    if extra:
        body.update(extra)
    return JSONResponse(body, status_code=status_code)


# ==================== 注入外部依赖到 MusicPlayer ====================
# 消除 models/player.py 对 routers.state 的循环导入
# handle_playback_end() 和 _prefetch_next_song_url() 通过这些回调访问全局单例
PLAYER.set_external_deps(
    playlists_manager=PLAYLISTS_MANAGER,
    default_playlist_id=DEFAULT_PLAYLIST_ID,
    playback_history=PLAYBACK_HISTORY,
    broadcast_from_thread=_broadcast_from_thread,
)

# 预启动 MPV 进程，避免首次播放时等待管道创建
if PLAYER.mpv_cmd is not None:
    threading.Thread(
        target=PLAYER.ensure_mpv, daemon=True, name="mpv-prestart"
    ).start()


# ==================== PipePlayer 池（多房间支持）====================
PIPE_PLAYERS: Dict[str, MusicPlayer] = {}
_pipe_players_lock = threading.Lock()

# ==================== RoomPlayer 池（ClubMusic 管理的 MPV 房间）====================
ROOM_PLAYERS: Dict[str, MusicPlayer] = {}
_room_players_lock = threading.Lock()

# 房间独立播放历史（room_id → PlayHistory）
from models import PlayHistory
ROOM_HISTORIES: Dict[str, PlayHistory] = {}

# 房间最后活跃时间（room_id → timestamp），用于空闲清理
ROOM_LAST_ACTIVITY: Dict[str, float] = {}

# 正在创建中的房间 ID 集合（防止并发创建竞态）
_creating_rooms: set = set()

# 房间最大数量（从 settings.ini [room] 读取，默认 10）
import configparser as _cfgparser
_room_cfg = _cfgparser.ConfigParser()
_room_cfg.read("settings.ini", encoding="utf-8")
ROOM_MAX: int = _room_cfg.getint("room", "max_rooms", fallback=10)


def touch_room_activity(room_id: str):
    """更新房间最后活跃时间戳"""
    ROOM_LAST_ACTIVITY[room_id] = time.time()


def get_player_for_room_id(room_id: str):
    """根据 room_id 查找 RoomPlayer。

    不存在时返回 None（不自动创建 PipePlayer），由调用方决定 fallback。
    """
    if not room_id:
        return None
    with _room_players_lock:
        return ROOM_PLAYERS.get(room_id, None)


# 房间管道前缀，用于识别房间管道模式
_ROOM_IPC_PREFIX = r'\\.\pipe\mpv-ipc-'


def get_player_for_pipe(pipe_name: str) -> MusicPlayer:
    """获取或创建指定管道的 Player 实例。

    无 pipe 或匹配默认管道 → 返回全局 PLAYER；
    房间管道模式（\\\\.\\pipe\\mpv-ipc-*）→ 按 room_id 查 ROOM_PLAYERS，不自动创建；
    其他管道 → 查/创建 PipePlayer。
    """
    if not pipe_name or pipe_name == PLAYER.pipe_name:
        return PLAYER

    # 房间管道模式：提取 room_id 查 ROOM_PLAYERS
    if pipe_name.startswith(_ROOM_IPC_PREFIX):
        room_id = pipe_name[len(_ROOM_IPC_PREFIX):]
        with _room_players_lock:
            if room_id in ROOM_PLAYERS:
                return ROOM_PLAYERS[room_id]
        # 房间管道但 RoomPlayer 不存在 → 不自动创建幻影 PipePlayer
        logger.info(f"[PipePool] 房间管道 {pipe_name} 无对应 RoomPlayer（可能房间未创建或已过期），回退默认播放器")
        return PLAYER

    # 非房间管道：兼容旧的 PipePlayer 池
    with _pipe_players_lock:
        if pipe_name in PIPE_PLAYERS:
            return PIPE_PLAYERS[pipe_name]

        logger.info(f"[PipePool] 创建 PipePlayer: {pipe_name}")
        pipe_player = MusicPlayer.create_pipe_player(
            pipe_name=pipe_name,
            playlists_manager=PLAYLISTS_MANAGER,
            playback_history=PLAYBACK_HISTORY,
            broadcast_from_thread=_broadcast_from_thread,
            music_dir=PLAYER.music_dir,
        )
        PIPE_PLAYERS[pipe_name] = pipe_player
        return pipe_player


def get_current_playlist_id(player: MusicPlayer) -> str:
    """获取玩家的当前播放列表 ID。

    PipePlayer/RoomPlayer → room_{safe_id}；默认 PLAYER → CURRENT_PLAYLIST_ID。
    """
    room_pid = getattr(player, '_room_playlist_id', None)
    if room_pid:
        return room_pid
    return CURRENT_PLAYLIST_ID


def get_runtime_playlist(player: MusicPlayer):
    """获取播放器专属运行时队列。"""
    if player is None:
        return None
    queue = player.get_runtime_queue()
    queue.current_playing_index = getattr(player, 'current_index', -1)
    return queue


def is_runtime_playlist_id(player: MusicPlayer, playlist_id: str) -> bool:
    """判断请求的 playlist_id 是否指向当前播放器运行时队列。"""
    if not playlist_id:
        return False
    active_pid = get_current_playlist_id(player)
    return playlist_id == active_pid or playlist_id == DEFAULT_PLAYLIST_ID


def resolve_playlist_for_request(player: MusicPlayer, playlists: Playlists, playlist_id: str = None):
    """解析前端请求的歌单：运行时队列优先，其余走共享歌单。"""
    active_pid = get_current_playlist_id(player)
    target_playlist_id = playlist_id or active_pid

    if is_runtime_playlist_id(player, target_playlist_id):
        return get_runtime_playlist(player), active_pid, True

    playlist = playlists.get_playlist(target_playlist_id)
    if playlist:
        return playlist, target_playlist_id, False

    return get_runtime_playlist(player), active_pid, True


def cleanup_pipe_player(pipe_name: str):
    """清理指定管道的 Player（房间销毁时调用）。

    支持 room_id 或完整管道路径作为参数。
    """
    # 尝试从管道路径提取 room_id
    lookup_key = pipe_name
    if pipe_name.startswith(_ROOM_IPC_PREFIX):
        lookup_key = pipe_name[len(_ROOM_IPC_PREFIX):]

    # 先查 ROOM_PLAYERS（以 room_id 为 key）
    with _room_players_lock:
        room_player = ROOM_PLAYERS.pop(lookup_key, None)
    if room_player:
        room_player.destroy_room_player()
        logger.info(f"[RoomPool] 已清理 RoomPlayer: {lookup_key}")
        return

    # 再查 PIPE_PLAYERS（以完整管道路径为 key）
    with _pipe_players_lock:
        player = PIPE_PLAYERS.pop(pipe_name, None)
    if player:
        player.destroy_pipe_player()
        logger.info(f"[PipePool] 已清理 PipePlayer: {pipe_name}")
