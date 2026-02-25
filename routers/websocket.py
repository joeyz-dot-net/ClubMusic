# -*- coding: utf-8 -*-
"""
routers/websocket.py - WebSocket 实时状态推送端点
"""

import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from routers.dependencies import get_ws_manager
from routers.state import _build_state_message

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, manager=Depends(get_ws_manager)):
    """WebSocket 连接端点 - 接收客户端连接并推送播放状态"""
    await manager.connect(websocket)
    try:
        # 新客户端连接后立即推送一次当前状态
        await websocket.send_json(_build_state_message())
        while True:
            # 接收心跳消息（客户端每 20 秒发送 "ping"，忽略内容）
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.debug(f"[WS] 连接异常: {e}")
        manager.disconnect(websocket)
