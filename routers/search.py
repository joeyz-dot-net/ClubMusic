# -*- coding: utf-8 -*-
"""
routers/search.py - 搜索路由

路由：
  POST /search_song
  GET  /youtube_search_config
  POST /search_youtube
  POST /get_directory_songs
"""

import os
import logging
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from models import MusicPlayer
from models.api_contracts import (
    ErrorResponse,
    DirectorySongsRequest,
    DirectorySongsResponse,
    SearchSongRequest,
    SearchSongResponse,
    SearchYoutubeRequestForm,
    SearchYoutubeResponse,
    YouTubeSearchConfigResponse,
)
from routers.dependencies import get_player_for_request
from routers.state import StreamSong, error_response

logger = logging.getLogger(__name__)

router = APIRouter()

_SEARCH_ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Invalid search request"},
    500: {"model": ErrorResponse, "description": "Unexpected search error"},
}
_DIRECTORY_ERROR_RESPONSES = {
    400: {"model": ErrorResponse, "description": "Invalid directory request"},
    404: {"model": ErrorResponse, "description": "Directory not found"},
    500: {"model": ErrorResponse, "description": "Unexpected search error"},
}


@router.post(
    "/search_song",
    response_model=SearchSongResponse,
    response_model_exclude_none=True,
    responses=_SEARCH_ERROR_RESPONSES,
)
async def search_song(payload: SearchSongRequest, player: MusicPlayer = Depends(get_player_for_request)):
    """搜索歌曲（本地 + YouTube）"""
    try:
        import time as time_module
        start_time = time_module.time()

        query = payload.query.strip()
        max_results = payload.max_results if payload.max_results is not None else player.youtube_search_max_results

        if not query:
            return JSONResponse(
                {"status": "ERROR", "error": "搜索词不能为空"},
                status_code=400
            )

        is_url = query.startswith("http://") or query.startswith("https://")

        local_results = []
        youtube_results = []

        if is_url:
            yt_start = time_module.time()
            try:
                playlist_result = StreamSong.extract_playlist(query, max_results=player.youtube_url_extra_max)
                if playlist_result.get("status") == "OK":
                    youtube_results = playlist_result.get("entries", [])
                    if not youtube_results:
                        video_result = StreamSong.extract_metadata(query)
                        if video_result.get("status") == "OK":
                            youtube_results = [video_result.get("data", {})]
                else:
                    video_result = StreamSong.extract_metadata(query)
                    if video_result.get("status") == "OK":
                        youtube_results = [video_result.get("data", {})]
                logger.info(f"[搜索性能] YouTube URL 提取耗时: {time_module.time() - yt_start:.2f}秒，结果数: {len(youtube_results)}")
            except Exception as e:
                logger.warning(f"[警告] 提取 YouTube URL 失败: {e}")
        else:
            local_start = time_module.time()
            local_results = player.search_local(query, max_results=player.local_search_max_results)
            logger.info(f"[搜索性能] 本地搜索耗时: {time_module.time() - local_start:.2f}秒，结果数: {len(local_results)}")

            yt_start = time_module.time()
            try:
                yt_search_result = StreamSong.search(query, max_results=max_results)
                if yt_search_result.get("status") == "OK":
                    youtube_results = yt_search_result.get("results", [])
                logger.info(f"[搜索性能] YouTube 搜索耗时: {time_module.time() - yt_start:.2f}秒，结果数: {len(youtube_results)}")
            except Exception as e:
                logger.warning(f"[警告] YouTube搜索失败: {e}")

        total_time = time_module.time() - start_time
        logger.info(f"[搜索性能] ✅ 总搜索耗时: {total_time:.2f}秒")

        return {
            "status": "OK",
            "local": local_results,
            "youtube": youtube_results,
            "local_max_results": player.local_search_max_results,
            "youtube_max_results": player.youtube_search_max_results
        }
    except Exception as e:
        return error_response("[/search_song] 搜索异常", exc=e, _logger=logger)


@router.get("/youtube_search_config", response_model=YouTubeSearchConfigResponse, response_model_exclude_none=True)
async def get_youtube_search_config(player: MusicPlayer = Depends(get_player_for_request)):
    """获取YouTube搜索配置"""
    return {
        "local_max_results": player.local_search_max_results,
        "page_size": min(20, player.youtube_search_max_results),
        "max_results": player.youtube_search_max_results
    }


@router.post(
    "/search_youtube",
    response_model=SearchYoutubeResponse,
    response_model_exclude_none=True,
    responses=_SEARCH_ERROR_RESPONSES,
)
async def search_youtube(payload: SearchYoutubeRequestForm = Depends(SearchYoutubeRequestForm.as_form)):
    """搜索 YouTube 视频"""
    try:
        query = payload.query.strip()

        if not query:
            return JSONResponse(
                {"status": "ERROR", "error": "搜索词不能为空"},
                status_code=400
            )

        try:
            results = StreamSong.search(query, max_results=10)
            return {"status": "OK", "results": results}
        except Exception as e:
            return error_response("[/search_youtube] YouTube搜索失败", exc=e, _logger=logger)
    except Exception as e:
        return error_response("[/search_youtube] 搜索异常", exc=e, _logger=logger)


@router.post(
    "/get_directory_songs",
    response_model=DirectorySongsResponse,
    response_model_exclude_none=True,
    responses=_DIRECTORY_ERROR_RESPONSES,
)
async def get_directory_songs(payload: DirectorySongsRequest, player: MusicPlayer = Depends(get_player_for_request)):
    """获取目录下的所有歌曲"""
    try:
        directory = payload.directory.strip()

        if not directory:
            return JSONResponse(
                {"status": "ERROR", "error": "目录路径不能为空"},
                status_code=400
            )

        # 防止目录遍历攻击
        abs_root = os.path.abspath(player.music_dir)
        abs_path = os.path.abspath(os.path.join(abs_root, directory))

        if not abs_path.startswith(abs_root):
            return JSONResponse(
                {"status": "ERROR", "error": "无效的目录路径"},
                status_code=400
            )

        if not os.path.isdir(abs_path):
            return JSONResponse(
                {"status": "ERROR", "error": "目录不存在"},
                status_code=404
            )

        tracks = []
        for dp, _, files in os.walk(abs_path):
            for f in files:
                ext = os.path.splitext(f)[1].lower()
                if ext in player.allowed_extensions:
                    full_path = os.path.join(dp, f)
                    rel_path = os.path.relpath(full_path, abs_root).replace("\\", "/")
                    tracks.append({
                        "url": rel_path,
                        "title": os.path.splitext(f)[0],
                        "type": "local",
                        "duration": 0
                    })

        tracks.sort(key=lambda x: x["title"].lower())
        logger.info(f"获取目录歌曲: {directory} → {len(tracks)} 首歌曲")

        return {
            "status": "OK",
            "directory": directory,
            "songs": tracks,
            "count": len(tracks)
        }
    except Exception as e:
        return error_response("[/get_directory_songs] 获取目录歌曲失败", exc=e, _logger=logger)
