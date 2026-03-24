# -*- coding: utf-8 -*-
"""
routers/room.py - 自定义房间 RoomPlayer 管理 API

路由：
  POST /room/init         — 创建 RoomPlayer + 启动 MPV + PCM Pipe
  DELETE /room/{room_id}  — 销毁 RoomPlayer
  GET /room/{room_id}/status — 查询房间 RoomPlayer 状态
  GET /room/list          — 列出所有活跃房间
"""

import logging
import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from models import MusicPlayer, PlayHistory
from routers.state import (
    ROOM_PLAYERS, _room_players_lock, _creating_rooms,
    PLAYLISTS_MANAGER,
    ROOM_HISTORIES, ROOM_LAST_ACTIVITY, ROOM_MAX,
    _make_room_broadcast, PLAYER, touch_room_activity,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/room/init")
async def init_room(request: Request):
    """为自定义房间创建 RoomPlayer + 启动 MPV。

    MPV 通过 --ao-pcm-file 直接写入 ClubVoice 创建的 Named Pipe，
    ClubMusic 不再管理 PCM 管道。

    请求体: {"room_id": "testbots_ef36", "default_volume": 80}
    返回: {"status": "ok", "ipc_pipe": "...", "pcm_pipe": "..."}
    """
    body = await request.json()
    room_id = body.get("room_id", "").strip()
    if not room_id:
        return JSONResponse({"status": "error", "message": "missing room_id"}, 400)

    default_volume = int(body.get("default_volume", 80))
    ipc_pipe = rf'\\.\pipe\mpv-ipc-{room_id}'
    init_started_at = time.perf_counter()

    # 检查是否已存在
    with _room_players_lock:
        if room_id in ROOM_PLAYERS:
            player = ROOM_PLAYERS[room_id]
            pcm_pipe = getattr(player, '_pcm_pipe_name', '')
            touch_room_activity(room_id)
            elapsed_ms = (time.perf_counter() - init_started_at) * 1000
            logger.info(f"[Room] 房间已存在: {room_id}, elapsed_ms={elapsed_ms:.1f}")
            return {"status": "ok", "ipc_pipe": ipc_pipe, "pcm_pipe": pcm_pipe, "existed": True}

        # 防止并发创建同一房间的竞态
        if room_id in _creating_rooms:
            return JSONResponse({"status": "error", "message": "room is being created"}, 409)

        # 房间数量上限检查
        if len(ROOM_PLAYERS) >= ROOM_MAX:
            logger.warning(f"[Room] 房间数量已达上限 ({ROOM_MAX})")
            return JSONResponse({"status": "error", "message": f"room limit reached ({ROOM_MAX})"}, 429)

        _creating_rooms.add(room_id)

    try:
        logger.info(f"[Room] 初始化开始: room_id={room_id}, default_volume={default_volume}")

        # 创建房间独立播放历史
        history_started_at = time.perf_counter()
        room_history = PlayHistory(max_size=500)
        ROOM_HISTORIES[room_id] = room_history
        history_elapsed_ms = (time.perf_counter() - history_started_at) * 1000

        # 创建 RoomPlayer（锁外执行，避免长时间持锁）
        player_create_started_at = time.perf_counter()
        logger.info(f"[Room] 创建 RoomPlayer: {room_id}")
        player = MusicPlayer.create_room_player(
            room_id=room_id,
            playlists_manager=PLAYLISTS_MANAGER,
            playback_history=room_history,
            broadcast_from_thread=_make_room_broadcast(room_id),
            default_volume=default_volume,
            music_dir=PLAYER.music_dir,
        )
        player_create_elapsed_ms = (time.perf_counter() - player_create_started_at) * 1000

        registration_started_at = time.perf_counter()
        with _room_players_lock:
            ROOM_PLAYERS[room_id] = player
        registration_elapsed_ms = (time.perf_counter() - registration_started_at) * 1000

        # 启动 MPV（PCM 音频直接写入 ClubVoice 的 Named Pipe）
        mpv_start_started_at = time.perf_counter()
        ok = player.start_room_mpv()
        mpv_start_elapsed_ms = (time.perf_counter() - mpv_start_started_at) * 1000
        if not ok:
            total_elapsed_ms = (time.perf_counter() - init_started_at) * 1000
            logger.error(
                f"[Room] MPV 启动失败: {room_id}, history_ms={history_elapsed_ms:.1f}, "
                f"create_ms={player_create_elapsed_ms:.1f}, register_ms={registration_elapsed_ms:.1f}, "
                f"mpv_start_ms={mpv_start_elapsed_ms:.1f}, total_ms={total_elapsed_ms:.1f}"
            )
            with _room_players_lock:
                ROOM_PLAYERS.pop(room_id, None)
            player.destroy_room_player()
            ROOM_HISTORIES.pop(room_id, None)
            return JSONResponse({"status": "error", "message": "MPV start failed"}, 500)

        touch_room_activity(room_id)
        pcm_pipe = getattr(player, '_pcm_pipe_name', '')
        total_elapsed_ms = (time.perf_counter() - init_started_at) * 1000
        logger.info(
            f"[Room] ✓ 房间就绪: {room_id}, ipc={ipc_pipe}, pcm={pcm_pipe}, "
            f"history_ms={history_elapsed_ms:.1f}, create_ms={player_create_elapsed_ms:.1f}, "
            f"register_ms={registration_elapsed_ms:.1f}, mpv_start_ms={mpv_start_elapsed_ms:.1f}, "
            f"total_ms={total_elapsed_ms:.1f}"
        )
        return {"status": "ok", "ipc_pipe": ipc_pipe, "pcm_pipe": pcm_pipe, "existed": False}
    finally:
        with _room_players_lock:
            _creating_rooms.discard(room_id)


@router.delete("/room/{room_id}")
async def destroy_room(room_id: str):
    """销毁自定义房间的 RoomPlayer。"""
    with _room_players_lock:
        player = ROOM_PLAYERS.pop(room_id, None)

    if not player:
        return JSONResponse({"status": "error", "message": "room not found"}, 404)

    player.destroy_room_player()
    ROOM_HISTORIES.pop(room_id, None)
    ROOM_LAST_ACTIVITY.pop(room_id, None)
    logger.info(f"[Room] ✓ 已销毁房间: {room_id}")
    return {"status": "ok"}


@router.get("/room/{room_id}/status")
async def room_status(room_id: str):
    """查询房间 RoomPlayer 状态。"""
    ipc_pipe = rf'\\.\pipe\mpv-ipc-{room_id}'

    with _room_players_lock:
        player = ROOM_PLAYERS.get(room_id)

    if not player:
        return {"exists": False}

    mpv_running = player.mpv_process is not None and player.mpv_process.poll() is None

    return {
        "exists": True,
        "room_id": room_id,
        "ipc_pipe": ipc_pipe,
        "pcm_pipe": getattr(player, '_pcm_pipe_name', ''),
        "mpv_running": mpv_running,
        "pipe_exists": player.mpv_pipe_exists(),
    }


@router.get("/room/list")
async def list_rooms():
    """列出所有活跃房间及其状态。"""
    with _room_players_lock:
        room_ids = list(ROOM_PLAYERS.keys())

    rooms = []
    for rid in room_ids:
        with _room_players_lock:
            player = ROOM_PLAYERS.get(rid)
        if player:
            mpv_running = player.mpv_process is not None and player.mpv_process.poll() is None
            rooms.append({
                "room_id": rid,
                "mpv_running": mpv_running,
                "last_activity": ROOM_LAST_ACTIVITY.get(rid, 0),
            })
    return {"rooms": rooms, "count": len(rooms), "max": ROOM_MAX}
