# -*- coding: utf-8 -*-
"""
routers/dependencies.py - FastAPI 依赖注入提供函数

通过 Depends() 注入单例实例，使路由处理函数可测试。
测试时可通过 app.dependency_overrides[get_player] = lambda: mock_player 替换为 Mock 对象。

使用方法:
    from fastapi import Depends
    from routers.dependencies import get_player, get_playlists

    @router.post("/play")
    async def play(request: Request, player: MusicPlayer = Depends(get_player)):
        player.play(song, ...)
"""

import logging

from fastapi import Request

from routers.state import (
    PLAYER,
    PLAYLISTS_MANAGER,
    PLAYBACK_HISTORY,
    SETTINGS,
    _player_lock,
    _creating_rooms,
    ws_manager,
    get_player_for_pipe,
    get_player_for_room_id,
    ROOM_HISTORIES,
    touch_room_activity,
)
from models import MusicPlayer, Playlists, PlayHistory


logger = logging.getLogger(__name__)


def get_player() -> MusicPlayer:
    """提供 MusicPlayer 单例"""
    return PLAYER


def get_player_for_request(request: Request) -> MusicPlayer:
    """根据请求参数返回对应的 Player 实例。

    优先使用 room_id 参数（URL 安全，无编码问题）；
    向后兼容 pipe 参数；
    无参数 → 返回默认 PLAYER 单例。
    """
    # 优先：room_id 参数（新方式，由 ClubVoice iframe 传递）
    room_id = request.query_params.get('room_id', None)
    if room_id:
        player = get_player_for_room_id(room_id)
        if player:
            touch_room_activity(room_id)
            return player
        endpoint = request.url.path
        if room_id in _creating_rooms:
            logger.warning(
                f"[RoomRouting] room_id={room_id} 请求命中初始化窗口，临时回退默认播放器: {endpoint}"
            )
        else:
            logger.warning(
                f"[RoomRouting] room_id={room_id} 未找到对应 RoomPlayer，回退默认播放器: {endpoint}"
            )
        # RoomPlayer 不存在（可能尚未创建或已销毁）→ 回退默认播放器
        return PLAYER

    # 向后兼容：pipe 参数（旧方式）
    pipe = request.query_params.get('pipe', None)
    if pipe:
        return get_player_for_pipe(pipe)

    return PLAYER


def get_playlists() -> Playlists:
    """提供 Playlists 管理器单例"""
    return PLAYLISTS_MANAGER


def get_playback_history(request: Request) -> PlayHistory:
    """提供播放历史实例（房间独立）"""
    player = get_player_for_request(request)
    room_id = getattr(player, '_room_id', None)
    if room_id and room_id in ROOM_HISTORIES:
        return ROOM_HISTORIES[room_id]
    return PLAYBACK_HISTORY


def get_player_lock(request: Request):
    """提供播放器线程锁（房间独立 RLock）"""
    player = get_player_for_request(request)
    return player._lock


def get_ws_manager():
    """提供 WebSocket 连接管理器"""
    return ws_manager
