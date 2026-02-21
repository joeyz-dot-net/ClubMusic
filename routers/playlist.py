# -*- coding: utf-8 -*-
"""
routers/playlist.py - 歌单管理和主页路由

路由：
  GET  /                        主页
  GET  /playlist_songs
  GET  /tree
  GET  /playlists
  POST /playlists
  POST /playlist_create
  POST /playlist_add
  POST /playlists/{id}/add_next
  POST /playlists/{id}/add_top
  GET  /playlist
  DELETE /playlists/{id}
  POST /playlists/{id}/remove
  PUT  /playlists/{id}
  POST /playlists/{id}/switch
  POST /playlist_play
  POST /playlist_reorder
  POST /playlist_remove
  POST /playlist_clear
"""

import os
import re
import time
import logging
import traceback

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, HTMLResponse

from routers.state import (
    PLAYER, PLAYLISTS_MANAGER, PLAYBACK_HISTORY,
    DEFAULT_PLAYLIST_ID, CURRENT_PLAYLIST_ID,
    _player_lock, _broadcast_state, _get_resource_path,
    Song, LocalSong, StreamSong,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def index():
    """返回主页面"""
    try:
        index_path = _get_resource_path("templates/index.html")
        with open(index_path, "r", encoding="utf-8") as f:
            return HTMLResponse(f.read())
    except Exception as e:
        return HTMLResponse(f"<h1>错误</h1><p>{str(e)}</p>", status_code=500)


@router.get("/playlist_songs")
async def get_playlist_songs():
    """获取当前歌单的所有歌曲"""
    playlist = PLAYLISTS_MANAGER.get_playlist(CURRENT_PLAYLIST_ID)
    songs = playlist.songs if playlist else []
    return {
        "status": "OK",
        "songs": songs,
        "playlist_id": CURRENT_PLAYLIST_ID,
        "playlist_name": playlist.name if playlist else "--"
    }


@router.get("/tree")
async def get_file_tree():
    """获取本地文件树结构"""
    return {
        "status": "OK",
        "tree": PLAYER.local_file_tree
    }


@router.get("/playlists")
async def get_playlists():
    """获取所有歌单"""
    return {
        "status": "OK",
        "playlists": [
            {
                "id": pid,
                "name": p.name,
                "count": len(p.songs),
                "songs": p.songs
            }
            for pid, p in PLAYLISTS_MANAGER._playlists.items()
        ]
    }


@router.post("/playlists")
async def create_playlist_restful(request: Request):
    """创建新歌单 (RESTful API)"""
    try:
        data = await request.json()
        name = data.get("name", "新歌单").strip()

        if not name:
            return JSONResponse({"error": "歌单名称不能为空"}, status_code=400)

        playlist = PLAYLISTS_MANAGER.create_playlist(name)
        return {
            "id": playlist.id,
            "name": playlist.name,
            "songs": []
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/playlist_create")
async def create_playlist(request: Request):
    """创建新歌单"""
    try:
        data = await request.json()
        name = data.get("name", "新歌单").strip()

        playlist = PLAYLISTS_MANAGER.create_playlist(name)
        return {
            "status": "OK",
            "playlist_id": playlist.id,
            "name": playlist.name
        }
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/playlist_add")
async def add_to_playlist(request: Request):
    """添加歌曲到歌单（支持指定插入位置）"""
    try:
        data = await request.json()
        playlist_id = data.get("playlist_id", CURRENT_PLAYLIST_ID)
        song_data = data.get("song")
        insert_index = data.get("insert_index")

        if not song_data:
            return JSONResponse(
                {"status": "ERROR", "error": "歌曲数据不能为空"},
                status_code=400
            )

        playlist = PLAYLISTS_MANAGER.get_playlist(playlist_id)
        if not playlist:
            return JSONResponse(
                {"status": "ERROR", "error": "歌单不存在"},
                status_code=404
            )

        # 检查歌曲是否已存在（防止重复）
        song_url = song_data.get("url", "")
        for existing_song in playlist.songs:
            existing_url = existing_song.get("url", "")
            if existing_url and existing_url == song_url:
                return JSONResponse(
                    {"status": "ERROR", "error": "该歌曲已存在于当前播放序列", "duplicate": True},
                    status_code=409
                )

        if insert_index is None:
            current_index = PLAYER.current_index if hasattr(PLAYER, 'current_index') else -1
            logger.info(f"[添加歌曲] 计算插入位置 - PLAYER.current_index: {current_index}, 歌单长度: {len(playlist.songs)}")

            if current_index >= 0 and current_index < len(playlist.songs):
                insert_index = current_index + 1
                logger.info(f"[添加歌曲] 有当前播放的歌曲，插入到下一个位置: {insert_index}")
            else:
                insert_index = 1 if playlist.songs else 0
                logger.info(f"[添加歌曲] 无当前播放歌曲或索引无效，使用默认位置: {insert_index}")

        song_type = song_data.get("type", "local")
        thumbnail_url = song_data.get("thumbnail_url")

        if song_type == "youtube" and not thumbnail_url:
            url = song_data.get("url", "")
            if "youtube.com" in url or "youtu.be" in url:
                video_id_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
                if video_id_match:
                    video_id = video_id_match.group(1)
                    thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

        song_obj = Song(
            url=song_data.get("url"),
            title=song_data.get("title"),
            song_type=song_type,
            duration=song_data.get("duration", 0),
            thumbnail_url=thumbnail_url
        )

        song_dict = song_obj.to_dict()
        insert_index = max(0, min(insert_index, len(playlist.songs)))
        playlist.songs.insert(insert_index, song_dict)
        playlist.updated_at = time.time()
        PLAYLISTS_MANAGER.save()

        logger.info(f"[添加歌曲] ✓ 已插入 - 歌单: {playlist_id}, 位置: {insert_index}, 歌曲: {song_data.get('title', 'N/A')}")
        return {
            "status": "OK",
            "message": f"已添加到下一曲（位置 {insert_index}）"
        }
    except Exception as e:
        logger.error(f"[ERROR] 添加歌曲失败: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/playlists/{playlist_id}/add_next")
async def add_song_to_playlist_next(playlist_id: str, request: Request):
    """添加歌曲到下一曲位置"""
    try:
        form_data = await request.form()
        url = form_data.get('url', '')
        title = form_data.get('title', '')
        song_type = form_data.get('type', 'local')
        thumbnail_url = form_data.get('thumbnail_url', '')

        if not url or not title:
            return JSONResponse(
                {"status": "ERROR", "error": "URL 和标题不能为空"},
                status_code=400
            )

        playlist = PLAYLISTS_MANAGER.get_playlist(playlist_id)
        if not playlist:
            return JSONResponse(
                {"status": "ERROR", "error": f"歌单 {playlist_id} 不存在"},
                status_code=404
            )

        for existing_song in playlist.songs:
            existing_url = existing_song.get("url", "")
            if existing_url and existing_url == url:
                return JSONResponse(
                    {"status": "ERROR", "error": "该歌曲已存在于当前播放序列", "duplicate": True},
                    status_code=409
                )

        if song_type == "youtube" and not thumbnail_url:
            video_id_match = re.search(r'(?:youtube\.com/watch\?v=|youtu\.be/)([a-zA-Z0-9_-]{11})', url)
            if video_id_match:
                video_id = video_id_match.group(1)
                thumbnail_url = f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

        from models.song import Song as SongModel
        song_obj = SongModel(
            url=url,
            title=title,
            song_type=song_type,
            duration=0,
            thumbnail_url=thumbnail_url if thumbnail_url else None
        )

        current_index = playlist.current_playing_index if hasattr(playlist, 'current_playing_index') else -1

        if current_index >= 0 and current_index < len(playlist.songs):
            insert_index = current_index + 1
        else:
            insert_index = 1 if playlist.songs else 0

        song_dict = song_obj.to_dict()
        playlist.songs.insert(insert_index, song_dict)
        playlist.updated_at = time.time()
        PLAYLISTS_MANAGER.save()

        return {"status": "OK", "message": "已添加到下一曲"}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/playlists/{playlist_id}/add_top")
async def add_song_to_playlist_top(playlist_id: str, request: Request):
    """添加歌曲到歌单顶部"""
    try:
        form_data = await request.form()
        url = form_data.get('url', '')
        title = form_data.get('title', '')
        song_type = form_data.get('type', 'local')
        thumbnail_url = form_data.get('thumbnail_url', '')

        if not url or not title:
            return JSONResponse(
                {"status": "ERROR", "error": "URL 和标题不能为空"},
                status_code=400
            )

        song_data = {"url": url, "title": title, "type": song_type, "duration": 0}
        if thumbnail_url:
            song_data["thumbnail_url"] = thumbnail_url

        playlist = PLAYLISTS_MANAGER.get_playlist(playlist_id)
        if not playlist:
            return JSONResponse(
                {"status": "ERROR", "error": f"歌单 {playlist_id} 不存在"},
                status_code=404
            )

        success = playlist.add_song(song_data)

        if success and len(playlist.songs) > 1:
            playlist.songs.insert(0, playlist.songs.pop())

        playlist.updated_at = time.time()
        PLAYLISTS_MANAGER.save()

        return {"status": "OK", "message": "已添加到歌单顶部"}
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.get("/playlist")
async def get_current_playlist(playlist_id: str = None):
    """获取指定歌单内容（用户隔离：每个浏览器独立选择歌单）"""
    try:
        songs = []
        target_playlist_id = playlist_id or DEFAULT_PLAYLIST_ID

        playlist = PLAYLISTS_MANAGER.get_playlist(target_playlist_id)
        if not playlist:
            playlist = PLAYLISTS_MANAGER.get_playlist(DEFAULT_PLAYLIST_ID)
            target_playlist_id = DEFAULT_PLAYLIST_ID

        if playlist and hasattr(playlist, "songs"):
            for s in playlist.songs:
                if isinstance(s, dict):
                    songs.append({
                        "url": s.get("url"),
                        "title": s.get("title") or s.get("name") or s.get("url"),
                        "type": s.get("type", "local"),
                        "duration": s.get("duration", 0),
                        "thumbnail_url": s.get("thumbnail_url", ""),
                    })
                elif isinstance(s, str):
                    songs.append({
                        "url": s,
                        "title": os.path.basename(s),
                        "type": "local",
                    })
        else:
            songs = []

        current_index = -1
        try:
            current_index = PLAYER.current_index if hasattr(PLAYER, 'current_index') else -1
        except Exception:
            pass

        playlist_name = playlist.name if playlist else "--"

        return {
            "status": "OK",
            "playlist": songs,
            "playlist_id": target_playlist_id,
            "playlist_name": playlist_name,
            "current_index": current_index
        }
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str):
    """删除歌单"""
    try:
        if playlist_id == "default":
            return JSONResponse(
                {"status": "ERROR", "error": "默认歌单不可删除"},
                status_code=400
            )

        if PLAYLISTS_MANAGER.delete_playlist(playlist_id):
            return {"status": "OK", "message": "删除成功"}
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "歌单不存在"},
                status_code=404
            )
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/playlists/{playlist_id}/remove")
async def remove_song_from_playlist(playlist_id: str, request: Request):
    """从指定歌单中移除歌曲"""
    try:
        form = await request.form()
        index = int(form.get("index", -1))

        logger.debug(f"remove_song_from_playlist - playlist_id: {playlist_id}, index: {index}")

        if index < 0:
            return JSONResponse(
                {"status": "ERROR", "error": "无效的索引"},
                status_code=400
            )

        playlist = PLAYLISTS_MANAGER.get_playlist(playlist_id)
        if not playlist:
            return JSONResponse(
                {"status": "ERROR", "error": "找不到歌单"},
                status_code=404
            )

        if index >= len(playlist.songs):
            return JSONResponse(
                {"status": "ERROR", "error": "索引超出范围"},
                status_code=400
            )

        with _player_lock:
            playlist.songs.pop(index)
            playlist.updated_at = time.time()
            PLAYLISTS_MANAGER.save()

            if playlist_id == DEFAULT_PLAYLIST_ID:
                if PLAYER.current_index >= len(playlist.songs):
                    PLAYER.current_index = max(-1, len(playlist.songs) - 1)
                elif index < PLAYER.current_index:
                    PLAYER.current_index -= 1

        await _broadcast_state()
        return JSONResponse({"status": "OK", "message": "删除成功"})

    except Exception as e:
        logger.error(f"[EXCEPTION] remove_song_from_playlist error: {type(e).__name__}: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.put("/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, data: dict):
    """更新歌单信息（如名称）"""
    try:
        if playlist_id == "default":
            return JSONResponse(
                {"status": "ERROR", "error": "默认歌单不可修改"},
                status_code=400
            )

        new_name = data.get('name', '').strip()
        if not new_name:
            return JSONResponse(
                {"status": "ERROR", "error": "歌单名称不能为空"},
                status_code=400
            )

        if PLAYLISTS_MANAGER.rename_playlist(playlist_id, new_name):
            return {
                "status": "OK",
                "message": "修改成功",
                "data": {"name": new_name}
            }
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "歌单不存在"},
                status_code=404
            )
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/playlists/{playlist_id}/switch")
async def switch_playlist(playlist_id: str):
    """验证歌单是否存在（用户隔离：不修改后端全局状态）"""
    try:
        playlist = PLAYLISTS_MANAGER.get_playlist(playlist_id)
        if not playlist:
            return JSONResponse({"error": "歌单不存在"}, status_code=404)

        return {
            "status": "OK",
            "playlist": {
                "id": playlist.id,
                "name": playlist.name,
                "count": len(playlist.songs)
            }
        }
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


@router.post("/playlist_play")
async def playlist_play(request: Request):
    """播放队列中指定索引的歌曲"""
    try:
        form = await request.form()
        index = int(form.get("index", 0))

        playlist = PLAYLISTS_MANAGER.get_playlist(CURRENT_PLAYLIST_ID)
        songs = playlist.songs if playlist else []

        if 0 <= index < len(songs):
            song_data = songs[index]
            if isinstance(song_data, dict):
                url = song_data.get("url")
                title = song_data.get("title") or url
                song_type = song_data.get("type", "local")
            else:
                url = song_data
                title = os.path.basename(url)
                song_type = "local"

            if song_type == "youtube" or (url and str(url).startswith("http")):
                song = StreamSong(stream_url=url, title=title or url)
            else:
                song = LocalSong(file_path=url, title=title)

            PLAYER.play(song, index=index)
            return JSONResponse({"status": "OK", "message": "播放成功"})
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "索引超出范围"},
                status_code=400
            )
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/playlist_reorder")
async def playlist_reorder(request: Request):
    """重新排序播放队列"""
    try:
        data = await request.json()
        from_index = data.get("from_index")
        to_index = data.get("to_index")
        playlist_id = data.get("playlist_id", CURRENT_PLAYLIST_ID)

        if from_index is not None and to_index is not None:
            playlist = PLAYLISTS_MANAGER.get_playlist(playlist_id)
            if playlist and 0 <= from_index < len(playlist.songs) and 0 <= to_index < len(playlist.songs):
                song = playlist.songs.pop(from_index)
                playlist.songs.insert(to_index, song)
                playlist.updated_at = time.time()
                PLAYLISTS_MANAGER.save()
            return JSONResponse({"status": "OK", "message": "重新排序成功"})
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "缺少参数"},
                status_code=400
            )
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/playlist_remove")
async def playlist_remove(request: Request):
    """从队列移除歌曲"""
    try:
        form = await request.form()
        index = int(form.get("index", -1))

        logger.debug(f"playlist_remove - index: {index}, current_playlist_id: {CURRENT_PLAYLIST_ID}")

        if index < 0:
            return JSONResponse(
                {"status": "ERROR", "error": "无效的索引"},
                status_code=400
            )

        playlist = PLAYLISTS_MANAGER.get_playlist(CURRENT_PLAYLIST_ID)
        if not playlist:
            return JSONResponse(
                {"status": "ERROR", "error": "找不到歌单"},
                status_code=404
            )

        if index >= len(playlist.songs):
            return JSONResponse(
                {"status": "ERROR", "error": "索引超出范围"},
                status_code=400
            )

        with _player_lock:
            playlist.songs.pop(index)
            playlist.updated_at = time.time()
            PLAYLISTS_MANAGER.save()

            if PLAYER.current_index >= len(playlist.songs):
                PLAYER.current_index = max(-1, len(playlist.songs) - 1)
            elif index < PLAYER.current_index:
                PLAYER.current_index -= 1

        await _broadcast_state()
        return JSONResponse({"status": "OK", "message": "删除成功"})

    except Exception as e:
        logger.info(f"[EXCEPTION] playlist_remove error: {type(e).__name__}: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/playlist_clear")
async def playlist_clear():
    """清空播放队列"""
    try:
        with _player_lock:
            playlist = PLAYLISTS_MANAGER.get_playlist(CURRENT_PLAYLIST_ID)
            if playlist:
                playlist.songs = []
                playlist.updated_at = time.time()
                PLAYLISTS_MANAGER.save()
                PLAYER.current_index = -1
                logger.info("[清空队列] 队列已清空，重置 PLAYER.current_index = -1")

        await _broadcast_state()
        return JSONResponse({"status": "OK", "message": "清空成功"})
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )
