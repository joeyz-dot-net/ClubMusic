# -*- coding: utf-8 -*-
"""
routers/history.py - 播放历史相关路由

路由：
  GET  /playback_history
  GET  /playback_history_merged
  POST /song_add_to_history
  POST /playback_history_delete
"""

import logging
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from models.api_contracts import (
    ErrorResponse,
    HistoryAddRequest,
    HistoryDeleteRequest,
    PlaybackHistoryMergedResponse,
    PlaybackHistoryResponse,
    StatusMessageResponse,
)
from models.player import MusicPlayer
from routers.dependencies import get_player_for_request
from routers.state import error_response

logger = logging.getLogger(__name__)

router = APIRouter()

_HISTORY_GET_ERROR_RESPONSES = {
    500: {"model": ErrorResponse, "description": "Unexpected server error"},
}
_HISTORY_ADD_ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Missing history URL"},
    500: {"model": ErrorResponse, "description": "Unexpected server error"},
}
_HISTORY_DELETE_ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Missing history URL"},
    404: {"model": ErrorResponse, "description": "History entry not found"},
    500: {"model": ErrorResponse, "description": "Unexpected server error"},
}

_history_add_request_schema = HistoryAddRequest.model_json_schema()
_history_delete_request_schema = HistoryDeleteRequest.model_json_schema()
_history_add_openapi_extra = {
    "requestBody": {
        "required": True,
        "content": {
            "application/json": {"schema": _history_add_request_schema},
            "multipart/form-data": {"schema": _history_add_request_schema},
        },
    }
}
_history_delete_openapi_extra = {
    "requestBody": {
        "required": True,
        "content": {
            "application/json": {"schema": _history_delete_request_schema},
            "multipart/form-data": {"schema": _history_delete_request_schema},
        },
    }
}


@router.get(
    "/playback_history",
    response_model=PlaybackHistoryResponse,
    response_model_exclude_none=True,
    responses=_HISTORY_GET_ERROR_RESPONSES,
)
async def get_playback_history(player: MusicPlayer = Depends(get_player_for_request)):
    """获取播放历史"""
    try:
        history = player.playback_history.get_all()
        return {
            "status": "OK",
            "history": history
        }
    except Exception as e:
        return error_response("[/playback_history] 获取播放历史异常", exc=e, _logger=logger)


@router.get(
    "/playback_history_merged",
    response_model=PlaybackHistoryMergedResponse,
    response_model_exclude_none=True,
    responses=_HISTORY_GET_ERROR_RESPONSES,
)
async def get_playback_history_merged(player: MusicPlayer = Depends(get_player_for_request)):
    """获取已合并的播放历史 - 相同URL只显示一次，最后播放时间降序排列"""
    try:
        raw_history = player.playback_history.get_all()

        # 按 URL 合并，只保留最新的记录
        merged_dict = {}
        for item in raw_history:
            url = item.get('url', '')
            if url:
                if url not in merged_dict:
                    merged_dict[url] = item
                else:
                    existing_ts = merged_dict[url].get('ts', 0)
                    new_ts = item.get('ts', 0)
                    if new_ts > existing_ts:
                        merged_dict[url] = item

        # 转换为列表并按时间降序排列（最新的在前）
        merged_history = list(merged_dict.values())
        merged_history.sort(key=lambda x: x.get('ts', 0), reverse=True)

        return {
            "status": "OK",
            "history": merged_history,
            "count": len(merged_history)
        }
    except Exception as e:
        return error_response("[/playback_history_merged] 获取合并历史异常", exc=e, _logger=logger)


@router.post(
    "/song_add_to_history",
    response_model=StatusMessageResponse,
    response_model_exclude_none=True,
    responses=_HISTORY_ADD_ERROR_RESPONSES,
    openapi_extra=_history_add_openapi_extra,
)
async def song_add_to_history(
    payload: HistoryAddRequest = Depends(HistoryAddRequest.from_request),
    player: MusicPlayer = Depends(get_player_for_request),
):
    """新增一条播放历史记录"""
    try:
        url = (payload.url or "").strip()
        title = (payload.title or url).strip()
        song_type = (payload.type or "local").strip().lower()
        thumbnail_url = (payload.thumbnail_url or "").strip() or None

        if not url:
            return JSONResponse(
                {"status": "ERROR", "error": "url不能为空"},
                status_code=400
            )

        is_local = song_type != "youtube"
        player.playback_history.add_to_history(
            url,
            title or url,
            is_local=is_local,
            thumbnail_url=thumbnail_url
        )

        return {"status": "OK", "message": "已添加到播放历史"}
    except Exception as e:
        return error_response("[/song_add_to_history] 添加播放历史异常", exc=e, _logger=logger)


@router.post(
    "/playback_history_delete",
    response_model=StatusMessageResponse,
    response_model_exclude_none=True,
    responses=_HISTORY_DELETE_ERROR_RESPONSES,
    openapi_extra=_history_delete_openapi_extra,
)
async def delete_playback_history(
    payload: HistoryDeleteRequest = Depends(HistoryDeleteRequest.from_request),
    player: MusicPlayer = Depends(get_player_for_request),
):
    """删除单条播放历史记录"""
    try:
        url = (payload.url or "").strip()

        if not url:
            return JSONResponse(
                {"status": "ERROR", "error": "url不能为空"},
                status_code=400
            )

        success = player.playback_history.remove_by_url(url)

        if success:
            return {"status": "OK", "message": "已删除播放历史记录"}
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "未找到该播放历史记录"},
                status_code=404
            )
    except Exception as e:
        return error_response("[/playback_history_delete] 删除播放历史异常", exc=e, _logger=logger)
