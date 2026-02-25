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
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from routers.state import PLAYER, PLAYBACK_HISTORY, error_response

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/playback_history")
async def get_playback_history():
    """获取播放历史"""
    try:
        history = PLAYER.playback_history.get_all()
        return {
            "status": "OK",
            "history": history
        }
    except Exception as e:
        return error_response("[/playback_history] 获取播放历史异常", exc=e, _logger=logger)


@router.get("/playback_history_merged")
async def get_playback_history_merged():
    """获取已合并的播放历史 - 相同URL只显示一次，最后播放时间降序排列"""
    try:
        raw_history = PLAYER.playback_history.get_all()

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


@router.post("/song_add_to_history")
async def song_add_to_history(request: Request):
    """新增一条播放历史记录"""
    try:
        payload = {}
        content_type = (request.headers.get("content-type") or "").lower()
        if "application/json" in content_type:
            payload = await request.json()
        else:
            form = await request.form()
            payload = {k: v for k, v in form.items()}

        url = (payload.get("url") or "").strip()
        title = (payload.get("title") or url).strip()
        song_type = (payload.get("type") or "local").strip().lower()
        thumbnail_url = (payload.get("thumbnail_url") or "").strip() or None

        if not url:
            return JSONResponse(
                {"status": "ERROR", "error": "url不能为空"},
                status_code=400
            )

        is_local = song_type != "youtube"
        PLAYER.playback_history.add_to_history(
            url,
            title or url,
            is_local=is_local,
            thumbnail_url=thumbnail_url
        )

        return {"status": "OK", "message": "已添加到播放历史"}
    except Exception as e:
        return error_response("[/song_add_to_history] 添加播放历史异常", exc=e, _logger=logger)


@router.post("/playback_history_delete")
async def delete_playback_history(request: Request):
    """删除单条播放历史记录"""
    try:
        payload = {}
        content_type = (request.headers.get("content-type") or "").lower()
        if "application/json" in content_type:
            payload = await request.json()
        else:
            form = await request.form()
            payload = {k: v for k, v in form.items()}

        url = (payload.get("url") or "").strip()

        if not url:
            return JSONResponse(
                {"status": "ERROR", "error": "url不能为空"},
                status_code=400
            )

        success = PLAYER.playback_history.remove_by_url(url)

        if success:
            return {"status": "OK", "message": "已删除播放历史记录"}
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "未找到该播放历史记录"},
                status_code=404
            )
    except Exception as e:
        return error_response("[/playback_history_delete] 删除播放历史异常", exc=e, _logger=logger)
