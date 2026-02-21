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
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from routers.state import PLAYER, StreamSong

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/search_song")
async def search_song(request: Request):
    """搜索歌曲（本地 + YouTube）"""
    try:
        import time as time_module
        start_time = time_module.time()

        data = await request.json()
        query = data.get("query", "").strip()
        max_results = data.get("max_results", PLAYER.youtube_search_max_results)

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
                playlist_result = StreamSong.extract_playlist(query, max_results=PLAYER.youtube_url_extra_max)
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
            local_results = PLAYER.search_local(query, max_results=PLAYER.local_search_max_results)
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
            "youtube": youtube_results
        }
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.get("/youtube_search_config")
async def get_youtube_search_config():
    """获取YouTube搜索配置"""
    return {
        "max_results": PLAYER.youtube_search_max_results
    }


@router.post("/search_youtube")
async def search_youtube(request: Request):
    """搜索 YouTube 视频"""
    try:
        form = await request.form()
        query = form.get("query", "").strip()

        if not query:
            return JSONResponse(
                {"status": "ERROR", "error": "搜索词不能为空"},
                status_code=400
            )

        try:
            results = StreamSong.search(query, max_results=10)
            return {"status": "OK", "results": results}
        except Exception as e:
            logger.error(f"[错误] YouTube 搜索失败: {e}")
            return JSONResponse(
                {"status": "ERROR", "error": f"搜索失败: {str(e)}"},
                status_code=500
            )
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/get_directory_songs")
async def get_directory_songs(request: Request):
    """获取目录下的所有歌曲"""
    try:
        data = await request.json()
        directory = data.get("directory", "").strip()

        if not directory:
            return JSONResponse(
                {"status": "ERROR", "error": "目录路径不能为空"},
                status_code=400
            )

        # 防止目录遍历攻击
        abs_root = os.path.abspath(PLAYER.music_dir)
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
                if ext in PLAYER.allowed_extensions:
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
        logger.error(f"获取目录歌曲失败: {e}")
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )
