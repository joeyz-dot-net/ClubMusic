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

from routers.state import (
    PLAYER,
    PLAYLISTS_MANAGER,
    RANK_MANAGER,
    PLAYBACK_HISTORY,
    SETTINGS,
    _player_lock,
    ws_manager,
)
from models import MusicPlayer, Playlists, HitRank, PlayHistory


def get_player() -> MusicPlayer:
    """提供 MusicPlayer 单例"""
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
