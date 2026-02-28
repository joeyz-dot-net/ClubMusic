# -*- coding: utf-8 -*-
"""
routers/room.py - 自定义房间 RoomPlayer 管理 API

路由：
  POST /room/init         — 创建 RoomPlayer + 启动 MPV + PCM Pipe
  DELETE /room/{room_id}  — 销毁 RoomPlayer
  GET /room/{room_id}/status — 查询房间 RoomPlayer 状态
"""

import logging
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from models import MusicPlayer
from routers.state import (
    ROOM_PLAYERS, _room_players_lock,
    PLAYLISTS_MANAGER, PLAYBACK_HISTORY,
    _broadcast_from_thread, PLAYER,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/room/init")
async def init_room(request: Request):
    """为自定义房间创建 RoomPlayer + MPV + PCM Pipe。

    请求体: {"room_id": "testbots_ef36", "default_volume": 80}
    返回: {"status": "ok", "ipc_pipe": "...", "pcm_pipe": "..."}
    """
    body = await request.json()
    room_id = body.get("room_id", "").strip()
    if not room_id:
        return JSONResponse({"status": "error", "message": "missing room_id"}, 400)

    default_volume = int(body.get("default_volume", 80))
    ipc_pipe = rf'\\.\pipe\mpv-ipc-{room_id}'

    with _room_players_lock:
        if ipc_pipe in ROOM_PLAYERS:
            player = ROOM_PLAYERS[ipc_pipe]
            pcm_pipe = getattr(player, '_pcm_pipe_name', '')
            logger.info(f"[Room] 房间已存在: {room_id}")
            return {"status": "ok", "ipc_pipe": ipc_pipe, "pcm_pipe": pcm_pipe, "existed": True}

    # 创建 RoomPlayer（锁外执行，避免长时间持锁）
    logger.info(f"[Room] 创建 RoomPlayer: {room_id}")
    player = MusicPlayer.create_room_player(
        room_id=room_id,
        playlists_manager=PLAYLISTS_MANAGER,
        playback_history=PLAYBACK_HISTORY,
        broadcast_from_thread=_broadcast_from_thread,
        default_volume=default_volume,
        music_dir=PLAYER.music_dir,
    )

    # 启动 MPV + PCM relay
    ok = player.start_room_mpv()
    if not ok:
        logger.error(f"[Room] MPV 启动失败: {room_id}")
        player.destroy_room_player()
        return JSONResponse({"status": "error", "message": "MPV start failed"}, 500)

    with _room_players_lock:
        ROOM_PLAYERS[ipc_pipe] = player

    pcm_pipe = getattr(player, '_pcm_pipe_name', '')
    logger.info(f"[Room] ✓ 房间就绪: {room_id}, ipc={ipc_pipe}, pcm={pcm_pipe}")
    return {"status": "ok", "ipc_pipe": ipc_pipe, "pcm_pipe": pcm_pipe, "existed": False}


@router.delete("/room/{room_id}")
async def destroy_room(room_id: str):
    """销毁自定义房间的 RoomPlayer。"""
    ipc_pipe = rf'\\.\pipe\mpv-ipc-{room_id}'

    with _room_players_lock:
        player = ROOM_PLAYERS.pop(ipc_pipe, None)

    if not player:
        return JSONResponse({"status": "error", "message": "room not found"}, 404)

    player.destroy_room_player()
    logger.info(f"[Room] ✓ 已销毁房间: {room_id}")
    return {"status": "ok"}


@router.get("/room/{room_id}/status")
async def room_status(room_id: str):
    """查询房间 RoomPlayer 状态。"""
    ipc_pipe = rf'\\.\pipe\mpv-ipc-{room_id}'

    with _room_players_lock:
        player = ROOM_PLAYERS.get(ipc_pipe)

    if not player:
        return {"exists": False}

    mpv_running = player.mpv_process is not None and player.mpv_process.poll() is None
    pcm_connected = False
    if hasattr(player, '_pcm_pipe_server') and player._pcm_pipe_server:
        pcm_connected = getattr(player._pcm_pipe_server, 'is_connected', False)

    return {
        "exists": True,
        "room_id": room_id,
        "ipc_pipe": ipc_pipe,
        "pcm_pipe": getattr(player, '_pcm_pipe_name', ''),
        "mpv_running": mpv_running,
        "pcm_client_connected": pcm_connected,
        "pipe_exists": player.mpv_pipe_exists(),
    }
