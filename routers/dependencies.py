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

from fastapi import Request

from routers.state import (
    PLAYER,
    PLAYLISTS_MANAGER,
    RANK_MANAGER,
    PLAYBACK_HISTORY,
    SETTINGS,
    _player_lock,
    ws_manager,
    get_player_for_pipe,
    get_player_for_room_id,
)
from models import MusicPlayer, Playlists, HitRank, PlayHistory


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
            return player
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


def get_rank() -> HitRank:
    """提供 HitRank 排行榜单例"""
    return RANK_MANAGER


def get_playback_history() -> PlayHistory:
    """提供播放历史单例"""
    return PLAYBACK_HISTORY


def get_player_lock():
    """提供播放器线程锁（RLock）"""
    return _player_lock


def get_ws_manager():
    """提供 WebSocket 连接管理器"""
    return ws_manager
