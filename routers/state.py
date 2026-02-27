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
    HitRank,
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
PLAYLISTS_MANAGER.load()

RANK_MANAGER = HitRank()

logger.info("\n✓ 所有模块初始化完成！\n")

DEFAULT_PLAYLIST_ID = "default"
CURRENT_PLAYLIST_ID = DEFAULT_PLAYLIST_ID
PLAYBACK_HISTORY = PLAYER.playback_history


def _init_default_playlist():
    """初始化系统默认歌单"""
    default_pl = PLAYLISTS_MANAGER.get_playlist(DEFAULT_PLAYLIST_ID)
    if not default_pl:
        default_pl = PLAYLISTS_MANAGER.create_playlist("正在播放")
        default_pl.id = DEFAULT_PLAYLIST_ID
        PLAYLISTS_MANAGER._playlists[DEFAULT_PLAYLIST_ID] = default_pl
        PLAYLISTS_MANAGER.save()
        logger.debug(f"创建默认歌单: {DEFAULT_PLAYLIST_ID}")
    return default_pl


_init_default_playlist()

# ==================== 并发保护 ====================
# 复用 PLAYER 内已有的 RLock 作为全局播放锁
# RLock 支持同线程重入，避免 handle_playback_end -> PLAYER.play() 路径的死锁
_player_lock: threading.RLock = PLAYER._lock

# 事件循环引用（供后台线程跨线程触发 WebSocket 广播）
_main_loop = None

# ==================== WebSocket 连接管理 ====================

class ConnectionManager:
    """管理所有活跃的 WebSocket 客户端连接"""

    def __init__(self):
        self.active_connections: set = set()

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)
        logger.info(f"[WS] 客户端连接，当前连接数: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.discard(websocket)
        logger.info(f"[WS] 客户端断开，当前连接数: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        """广播消息给所有连接的客户端，自动清理失效连接"""
        dead = set()
        for conn in self.active_connections:
            try:
                await conn.send_json(message)
            except Exception:
                dead.add(conn)
        self.active_connections -= dead


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

def _build_state_message() -> dict:
    """构建要广播的状态消息（同步函数，可在任意线程调用）"""
    try:
        mpv_state = {
            "paused": mpv_get("pause"),
            "time_pos": mpv_get("time-pos"),
            "duration": mpv_get("duration"),
            "volume": mpv_get("volume"),
        }
    except Exception:
        mpv_state = {"paused": True, "time_pos": 0, "duration": 0, "volume": 50}
    return {
        "type": "state_update",
        "current_meta": dict(PLAYER.current_meta) if PLAYER.current_meta else {},
        "mpv_state": mpv_state,
        "loop_mode": PLAYER.loop_mode,
        "pitch_shift": PLAYER.pitch_shift,
        "current_playlist_id": CURRENT_PLAYLIST_ID,
        "playlist_updated": True,
        "ts": time.time(),
        "server_time": time.time(),
    }


async def _broadcast_state():
    """广播当前状态给所有 WebSocket 客户端（必须在锁外调用）"""
    if ws_manager.active_connections:
        await ws_manager.broadcast(_build_state_message())


def _broadcast_from_thread():
    """从后台线程安全地触发 WebSocket 广播（线程安全入口）"""
    if _main_loop is None or not ws_manager.active_connections:
        return
    try:
        asyncio.run_coroutine_threadsafe(_broadcast_state(), _main_loop)
    except Exception as e:
        logger.debug(f"[WS] 跨线程广播失败: {e}")


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


# ==================== PipePlayer 池（多房间支持）====================
from typing import Dict

PIPE_PLAYERS: Dict[str, MusicPlayer] = {}
_pipe_players_lock = threading.Lock()


def get_player_for_pipe(pipe_name: str) -> MusicPlayer:
    """获取或创建指定管道的 PipePlayer 实例。

    无 pipe 或匹配默认管道 → 返回全局 PLAYER；
    否则从池中返回/创建 PipePlayer。
    """
    if not pipe_name or pipe_name == PLAYER.pipe_name:
        return PLAYER

    with _pipe_players_lock:
        if pipe_name in PIPE_PLAYERS:
            return PIPE_PLAYERS[pipe_name]

        logger.info(f"[PipePool] 创建 PipePlayer: {pipe_name}")
        pipe_player = MusicPlayer.create_pipe_player(
            pipe_name=pipe_name,
            playlists_manager=PLAYLISTS_MANAGER,
            playback_history=PLAYBACK_HISTORY,
            broadcast_from_thread=_broadcast_from_thread,
        )
        PIPE_PLAYERS[pipe_name] = pipe_player
        return pipe_player


def get_current_playlist_id(player: MusicPlayer) -> str:
    """获取玩家的当前播放列表 ID。

    PipePlayer → room_{safe_id}；默认 PLAYER → CURRENT_PLAYLIST_ID。
    """
    room_pid = getattr(player, '_room_playlist_id', None)
    if room_pid:
        return room_pid
    return CURRENT_PLAYLIST_ID


def cleanup_pipe_player(pipe_name: str):
    """清理指定管道的 PipePlayer（房间销毁时调用）。"""
    with _pipe_players_lock:
        player = PIPE_PLAYERS.pop(pipe_name, None)
    if player:
        player.destroy_pipe_player()
        logger.info(f"[PipePool] 已清理 PipePlayer: {pipe_name}")
