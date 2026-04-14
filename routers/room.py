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
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from models.api_contracts import (
    RoomErrorResponse,
    RoomDestroyResponse,
    RoomInitRequest,
    RoomInitResponse,
    RoomListResponse,
    RoomStatusResponse,
)
from models.player import MusicPlayer
from models.playlist import PlayHistory
from routers.state import (
    ROOM_PLAYERS, _room_players_lock, _creating_rooms,
    PLAYLISTS_MANAGER,
    ROOM_HISTORIES, ROOM_LAST_ACTIVITY, ROOM_MAX,
    _make_room_broadcast, PLAYER, touch_room_activity,
)

logger = logging.getLogger(__name__)
router = APIRouter()

_ROOM_INIT_ERROR_RESPONSES = {
    400: {"model": RoomErrorResponse, "description": "Missing room id"},
    409: {"model": RoomErrorResponse, "description": "Room is being created"},
    429: {"model": RoomErrorResponse, "description": "Room limit reached"},
    500: {"model": RoomErrorResponse, "description": "Room initialization failed"},
}
_ROOM_DESTROY_ERROR_RESPONSES = {
    404: {"model": RoomErrorResponse, "description": "Room not found"},
}


def _build_room_status_payload(room_id: str, player) -> dict:
    """Build a room bot status snapshot for API callers."""
    ipc_pipe = rf'\\.\pipe\mpv-ipc-{room_id}'
    runtime_queue = player.get_runtime_queue() if player else None
    mpv_running = bool(player and player.mpv_process is not None and player.mpv_process.poll() is None)
    pipe_exists = bool(player and player.mpv_pipe_exists())

    return {
        "room_id": room_id,
        "ipc_pipe": ipc_pipe,
        "pcm_pipe": getattr(player, '_pcm_pipe_name', '') if player else '',
        "exists": player is not None,
        "mpv_running": mpv_running,
        "pipe_exists": pipe_exists,
        "bot_ready": mpv_running and pipe_exists,
        "current_playlist_id": getattr(runtime_queue, 'id', ''),
        "current_index": getattr(player, 'current_index', -1) if player else -1,
        "queue_length": len(getattr(runtime_queue, 'songs', []) or []),
        "playlist_updated_at": getattr(runtime_queue, 'updated_at', 0) if runtime_queue else 0,
        "current_meta": player.get_current_meta_snapshot() if player else {},
        "last_activity": ROOM_LAST_ACTIVITY.get(room_id, 0),
    }


@router.post(
    "/room/init",
    response_model=RoomInitResponse,
    response_model_exclude_none=True,
    responses=_ROOM_INIT_ERROR_RESPONSES,
)
async def init_room(payload: RoomInitRequest):
    """为自定义房间创建 RoomPlayer + 启动 MPV。

    MPV 通过 --ao-pcm-file 直接写入 ClubVoice 创建的 Named Pipe，
    ClubMusic 不再管理 PCM 管道。

    请求体: {"room_id": "testbots_ef36", "default_volume": 80}
    返回: {"status": "ok", "ipc_pipe": "...", "pcm_pipe": "..."}
    """
    room_id = payload.room_id.strip()
    if not room_id:
        return JSONResponse({"status": "error", "message": "missing room_id"}, 400)

    default_volume = int(payload.default_volume)
    ipc_pipe = rf'\\.\pipe\mpv-ipc-{room_id}'
    init_started_at = time.perf_counter()

    # 检查是否已存在
    with _room_players_lock:
        if room_id in ROOM_PLAYERS:
            player = ROOM_PLAYERS[room_id]
            room_status = _build_room_status_payload(room_id, player)
            if not room_status["bot_ready"]:
                logger.warning(f"[Room] 房间存在但 bot 未就绪，尝试恢复 MPV: {room_id}")
                if not player.start_room_mpv():
                    return JSONResponse(
                        {
                            "status": "error",
                            "message": "room exists but MPV recovery failed",
                            **room_status,
                        },
                        500,
                    )
                room_status = _build_room_status_payload(room_id, player)
            touch_room_activity(room_id)
            elapsed_ms = (time.perf_counter() - init_started_at) * 1000
            logger.info(f"[Room] 房间已存在: {room_id}, elapsed_ms={elapsed_ms:.1f}")
            return {"status": "ok", "existed": True, **room_status}

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
        return {"status": "ok", "existed": False, **_build_room_status_payload(room_id, player)}
    finally:
        with _room_players_lock:
            _creating_rooms.discard(room_id)


@router.delete(
    "/room/{room_id}",
    response_model=RoomDestroyResponse,
    response_model_exclude_none=True,
    responses=_ROOM_DESTROY_ERROR_RESPONSES,
)
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


@router.get("/room/{room_id}/status", response_model=RoomStatusResponse, response_model_exclude_none=True)
async def room_status(room_id: str):
    """查询房间 RoomPlayer 状态。"""
    with _room_players_lock:
        player = ROOM_PLAYERS.get(room_id)

    if not player:
        return {"status": "ok", **_build_room_status_payload(room_id, None)}

    return {"status": "ok", **_build_room_status_payload(room_id, player)}


@router.get("/room/list", response_model=RoomListResponse, response_model_exclude_none=True)
async def list_rooms():
    """列出所有活跃房间及其状态。"""
    with _room_players_lock:
        room_ids = list(ROOM_PLAYERS.keys())

    rooms = []
    for rid in room_ids:
        with _room_players_lock:
            player = ROOM_PLAYERS.get(rid)
        if player:
            rooms.append(_build_room_status_payload(rid, player))
    return {"status": "ok", "rooms": rooms, "count": len(rooms), "max": ROOM_MAX}
