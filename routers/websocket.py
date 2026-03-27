# -*- coding: utf-8 -*-
"""
routers/websocket.py - WebSocket 实时状态推送端点
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from routers.dependencies import get_ws_manager
from routers.state import _build_state_message, get_player_for_room_id, PLAYER, _creating_rooms

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, manager=Depends(get_ws_manager)):
    """WebSocket 连接端点 - 接收客户端连接并推送播放状态

    支持 ?room_id=xxx 查询参数，将连接分配到对应房间的广播组。
    无 room_id 参数的连接属于默认播放器（dev/prod）。
    """
    room_id = websocket.query_params.get('room_id', None) or None
    if room_id:
        player = get_player_for_room_id(room_id)
        if player is None:
            if room_id in _creating_rooms:
                logger.warning(f"[WS] 房间创建中，拒绝将 room={room_id} 连接回退到默认播放器")
                await websocket.close(code=1013, reason="room is being created")
                return

            logger.warning(f"[WS] 房间不存在，拒绝将 room={room_id} 连接回退到默认播放器")
            await websocket.close(code=1008, reason="room not found")
            return

    await manager.connect(websocket, room_id=room_id)
    try:
        # 用对应的 player 构建初始状态消息
        if room_id:
            player = get_player_for_room_id(room_id)
        else:
            player = PLAYER
        await websocket.send_json(_build_state_message(player, playlist_updated=False))
        while True:
            # 接收心跳消息（客户端每 20 秒发送 "ping"，忽略内容）
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"[WS] 连接异常: {e}")
        manager.disconnect(websocket)
