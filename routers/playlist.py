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
    POST /playlists/{id}/clear
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

from fastapi import APIRouter, Request, Depends
from fastapi.responses import JSONResponse, HTMLResponse

from models import MusicPlayer, Playlists, PlayHistory
from models.playlists import sanitize_playlist_name
from routers.dependencies import get_player_for_request, get_playlists, get_playback_history, get_player_lock
from routers.state import (
    DEFAULT_PLAYLIST_ID,
    get_current_playlist_id,
    get_runtime_playlist,
    is_runtime_playlist_id,
    resolve_playlist_for_request,
    _broadcast_state, _get_resource_path,
    Song, LocalSong, StreamSong,
    error_response,
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
async def get_playlist_songs(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
    """获取当前歌单的所有歌曲"""
    current_pid = get_current_playlist_id(player)
    playlist = get_runtime_playlist(player)
    songs = playlist.songs if playlist else []
    return {
        "status": "OK",
        "songs": songs,
        "playlist_id": current_pid,
        "playlist_name": playlist.name if playlist else "--"
    }


@router.get("/tree")
async def get_file_tree(player: MusicPlayer = Depends(get_player_for_request)):
    """获取本地文件树结构"""
    return {
        "status": "OK",
        "tree": player.local_file_tree
    }


@router.get("/playlists")
async def list_playlists(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
    """获取所有歌单。当 pipe 指向 RoomPlayer 时，同时返回该房间的播放列表。"""
    runtime_playlist = get_runtime_playlist(player)
    room_pid = getattr(player, '_room_playlist_id', None)

    result_playlists = [
        {
            "id": pid,
            "name": p.name,
            "count": len(p.songs),
            "songs": p.songs,
            "is_room": False,
            "current_playing_index": p.current_playing_index,
        }
        for pid, p in playlists._playlists.items()
        if not playlists.is_runtime_playlist(pid)
    ]

    if runtime_playlist:
        result_playlists.insert(0, {
            "id": runtime_playlist.id,
            "name": runtime_playlist.name,
            "count": len(runtime_playlist.songs),
            "songs": runtime_playlist.songs,
            "is_room": bool(room_pid),
            "current_playing_index": getattr(player, 'current_index', -1),
        })

    return {"status": "OK", "playlists": result_playlists}


@router.post("/playlists")
async def create_playlist_restful(request: Request, playlists: Playlists = Depends(get_playlists)):
    """创建新歌单 (RESTful API)"""
    try:
        data = await request.json()
        name = sanitize_playlist_name(data.get("name", "新歌单"), fallback="")

        if not name:
            return error_response("歌单名称不能为空", 400)

        playlist = playlists.create_playlist(name)
        return {
            "id": playlist.id,
            "name": playlist.name,
            "songs": []
        }
    except Exception as e:
        return error_response("[POST /playlists] 创建歌单异常", exc=e, _logger=logger)


@router.post("/playlist_create")
async def create_playlist(request: Request, playlists: Playlists = Depends(get_playlists)):
    """创建新歌单"""
    try:
        data = await request.json()
        name = sanitize_playlist_name(data.get("name", "新歌单"), fallback="")

        if not name:
            return error_response("歌单名称不能为空", 400)

        playlist = playlists.create_playlist(name)
        return {
            "status": "OK",
            "playlist_id": playlist.id,
            "name": playlist.name
        }
    except Exception as e:
        return error_response("[/playlist_create] 创建歌单异常", exc=e, _logger=logger)


@router.post("/playlist_add")
async def add_to_playlist(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
    """添加歌曲到歌单（支持指定插入位置）"""
    try:
        data = await request.json()
        playlist_id = data.get("playlist_id", get_current_playlist_id(player))
        song_data = data.get("song")
        insert_index = data.get("insert_index")

        if not song_data:
            return JSONResponse(
                {"status": "ERROR", "error": "歌曲数据不能为空"},
                status_code=400
            )

        is_runtime_playlist = is_runtime_playlist_id(player, playlist_id)
        playlist = get_runtime_playlist(player) if is_runtime_playlist else playlists.get_playlist(playlist_id)
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
            current_index = player.current_index if hasattr(player, 'current_index') else -1
            logger.info(f"[添加歌曲] 计算插入位置 - player.current_index: {current_index}, 歌单长度: {len(playlist.songs)}")

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
        if is_runtime_playlist:
            playlist.current_playing_index = getattr(player, 'current_index', -1)
        else:
            playlists.save()

        logger.info(f"[添加歌曲] ✓ 已插入 - 歌单: {playlist_id}, 位置: {insert_index}, 歌曲: {song_data.get('title', 'N/A')}")
        return {
            "status": "OK",
            "message": f"已添加到下一曲（位置 {insert_index}）"
        }
    except Exception as e:
        return error_response("[/playlist_add] 添加歌曲失败", exc=e, _logger=logger)


@router.post("/playlists/{playlist_id}/add_next")
async def add_song_to_playlist_next(
    playlist_id: str,
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
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

        is_runtime_playlist = is_runtime_playlist_id(player, playlist_id)
        playlist = get_runtime_playlist(player) if is_runtime_playlist else playlists.get_playlist(playlist_id)
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

        current_index = player.current_index if is_runtime_playlist else (playlist.current_playing_index if hasattr(playlist, 'current_playing_index') else -1)

        if current_index >= 0 and current_index < len(playlist.songs):
            insert_index = current_index + 1
        else:
            insert_index = 1 if playlist.songs else 0

        song_dict = song_obj.to_dict()
        playlist.songs.insert(insert_index, song_dict)
        playlist.updated_at = time.time()
        if is_runtime_playlist:
            playlist.current_playing_index = getattr(player, 'current_index', -1)
        else:
            playlists.save()

        return {"status": "OK", "message": "已添加到下一曲"}
    except Exception as e:
        return error_response("[/playlists/{id}/add_next] 添加歌曲失败", exc=e, _logger=logger)


@router.post("/playlists/{playlist_id}/add_top")
async def add_song_to_playlist_top(
    playlist_id: str,
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
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

        is_runtime_playlist = is_runtime_playlist_id(player, playlist_id)
        playlist = get_runtime_playlist(player) if is_runtime_playlist else playlists.get_playlist(playlist_id)
        if not playlist:
            return JSONResponse(
                {"status": "ERROR", "error": f"歌单 {playlist_id} 不存在"},
                status_code=404
            )

        success = playlist.add_song(song_data)

        if success and len(playlist.songs) > 1:
            playlist.songs.insert(0, playlist.songs.pop())

        playlist.updated_at = time.time()
        if is_runtime_playlist:
            playlist.current_playing_index = getattr(player, 'current_index', -1)
        else:
            playlists.save()

        return {"status": "OK", "message": "已添加到歌单顶部"}
    except Exception as e:
        return error_response("[/playlists/{id}/add_top] 添加歌曲到顶部失败", exc=e, _logger=logger)


@router.get("/playlist")
async def get_current_playlist(
    request: Request,
    playlist_id: str = None,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
    """获取指定歌单内容（用户隔离：每个浏览器独立选择歌单）"""
    try:
        songs = []
        playlist, target_playlist_id, _ = resolve_playlist_for_request(player, playlists, playlist_id)

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
            current_index = player.current_index if hasattr(player, 'current_index') else -1
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
        return error_response("[/playlist] 获取歌单异常", exc=e, _logger=logger)


@router.delete("/playlists/{playlist_id}")
async def delete_playlist(playlist_id: str, playlists: Playlists = Depends(get_playlists)):
    """删除歌单"""
    try:
        if playlist_id == "default":
            return JSONResponse(
                {"status": "ERROR", "error": "默认歌单不可删除"},
                status_code=400
            )

        if playlists.is_room_playlist(playlist_id):
            return JSONResponse(
                {"status": "ERROR", "error": "房间播放列表不可删除"},
                status_code=400
            )

        if playlists.delete_playlist(playlist_id):
            return {"status": "OK", "message": "删除成功"}
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "歌单不存在"},
                status_code=404
            )
    except Exception as e:
        return error_response("[DELETE /playlists/{id}] 删除歌单异常", exc=e, _logger=logger)


@router.post("/playlists/{playlist_id}/clear")
async def clear_playlist(
    playlist_id: str,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    player_lock=Depends(get_player_lock),
):
    """清空指定歌单内容，保留歌单本身"""
    try:
        if playlist_id == DEFAULT_PLAYLIST_ID:
            return JSONResponse(
                {"status": "ERROR", "error": "默认歌单请使用清空队列接口"},
                status_code=400
            )

        if playlists.is_room_playlist(playlist_id):
            return JSONResponse(
                {"status": "ERROR", "error": "房间播放列表不可清空"},
                status_code=400
            )

        playlist = playlists.get_playlist(playlist_id)
        if not playlist:
            return JSONResponse(
                {"status": "ERROR", "error": "歌单不存在"},
                status_code=404
            )

        with player_lock:
            playlist.songs = []
            playlist.updated_at = time.time()
            playlists.save()

            if playlist_id == get_current_playlist_id(player):
                player.current_index = -1
                player.current_meta = None

        await _broadcast_state(player, playlist_updated=True)
        return {"status": "OK", "message": "清空成功"}
    except Exception as e:
        return error_response("[POST /playlists/{id}/clear] 清空歌单异常", exc=e, _logger=logger)


@router.post("/playlists/{playlist_id}/remove")
async def remove_song_from_playlist(
    playlist_id: str,
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    player_lock=Depends(get_player_lock),
):
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

        playlist = playlists.get_playlist(playlist_id)
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

        with player_lock:
            playlist.songs.pop(index)
            playlist.updated_at = time.time()
            playlists.save()

            if playlist_id == get_current_playlist_id(player):
                if player.current_index >= len(playlist.songs):
                    player.current_index = max(-1, len(playlist.songs) - 1)
                elif index < player.current_index:
                    player.current_index -= 1

        await _broadcast_state(player, playlist_updated=True)
        return JSONResponse({"status": "OK", "message": "删除成功"})

    except Exception as e:
        return error_response("[/playlists/{id}/remove] 移除歌曲异常", exc=e, _logger=logger)


@router.put("/playlists/{playlist_id}")
async def update_playlist(playlist_id: str, data: dict, playlists: Playlists = Depends(get_playlists)):
    """更新歌单信息（如名称）"""
    try:
        if playlist_id == "default":
            return JSONResponse(
                {"status": "ERROR", "error": "默认歌单不可修改"},
                status_code=400
            )

        if playlists.is_room_playlist(playlist_id):
            return JSONResponse(
                {"status": "ERROR", "error": "房间播放列表不可修改名称"},
                status_code=400
            )

        new_name = sanitize_playlist_name(data.get('name', ''), fallback='')
        if not new_name:
            return JSONResponse(
                {"status": "ERROR", "error": "歌单名称不能为空"},
                status_code=400
            )

        if playlists.rename_playlist(playlist_id, new_name):
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
        return error_response("[PUT /playlists/{id}] 更新歌单异常", exc=e, _logger=logger)


@router.post("/playlists/{playlist_id}/switch")
async def switch_playlist(
    playlist_id: str,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
    """验证歌单是否存在（用户隔离：不修改后端全局状态）"""
    try:
        playlist = get_runtime_playlist(player) if is_runtime_playlist_id(player, playlist_id) else playlists.get_playlist(playlist_id)
        if not playlist:
            return error_response("歌单不存在", 404)

        return {
            "status": "OK",
            "playlist": {
                "id": playlist.id,
                "name": playlist.name,
                "count": len(playlist.songs)
            }
        }
    except Exception as e:
        return error_response("[/playlists/{id}/switch] 切换歌单异常", exc=e, _logger=logger)


@router.post("/playlist_play")
async def playlist_play(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    playback_history: PlayHistory = Depends(get_playback_history),
    player_lock=Depends(get_player_lock),
):
    """播放队列中指定索引的歌曲"""
    try:
        form = await request.form()
        index = int(form.get("index", 0))

        current_pid = get_current_playlist_id(player)
        playlist = get_runtime_playlist(player)
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

            with player_lock:
                success = player.play(
                    song,
                    mpv_command_func=player.mpv_command,
                    mpv_pipe_exists_func=player.mpv_pipe_exists,
                    ensure_mpv_func=player.ensure_mpv,
                    add_to_history_func=playback_history.add_to_history,
                    save_to_history=True,
                    mpv_cmd=player.mpv_cmd,
                )
                if not success:
                    return JSONResponse(
                        {"status": "ERROR", "error": "播放失败"},
                        status_code=500,
                    )

                player.current_index = index

            await _broadcast_state(player)
            return JSONResponse({
                "status": "OK",
                "message": "播放成功",
                "current": player.current_meta,
                "current_index": player.current_index,
            })
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "索引超出范围"},
                status_code=400
            )
    except Exception as e:
        return error_response("[/playlist_play] 播放异常", exc=e, _logger=logger)


@router.post("/playlist_reorder")
async def playlist_reorder(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
    """重新排序播放队列"""
    try:
        data = await request.json()
        from_index = data.get("from_index")
        to_index = data.get("to_index")
        playlist_id = data.get("playlist_id", get_current_playlist_id(player))

        if from_index is not None and to_index is not None:
            is_runtime_playlist = is_runtime_playlist_id(player, playlist_id)
            playlist = get_runtime_playlist(player) if is_runtime_playlist else playlists.get_playlist(playlist_id)
            if playlist and 0 <= from_index < len(playlist.songs) and 0 <= to_index < len(playlist.songs):
                song = playlist.songs.pop(from_index)
                playlist.songs.insert(to_index, song)
                playlist.updated_at = time.time()
                if is_runtime_playlist:
                    playlist.current_playing_index = getattr(player, 'current_index', -1)
                else:
                    playlists.save()
            return JSONResponse({"status": "OK", "message": "重新排序成功"})
        else:
            return JSONResponse(
                {"status": "ERROR", "error": "缺少参数"},
                status_code=400
            )
    except Exception as e:
        return error_response("[/playlist_reorder] 排序异常", exc=e, _logger=logger)


@router.post("/playlist_remove")
async def playlist_remove(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    player_lock=Depends(get_player_lock),
):
    """从队列移除歌曲"""
    try:
        form = await request.form()
        index = int(form.get("index", -1))

        current_pid = get_current_playlist_id(player)
        logger.debug(f"playlist_remove - index: {index}, current_playlist_id: {current_pid}")

        if index < 0:
            return JSONResponse(
                {"status": "ERROR", "error": "无效的索引"},
                status_code=400
            )

        playlist = get_runtime_playlist(player)
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

        with player_lock:
            playlist.songs.pop(index)
            playlist.updated_at = time.time()
            playlist.current_playing_index = getattr(player, 'current_index', -1)

            if player.current_index >= len(playlist.songs):
                player.current_index = max(-1, len(playlist.songs) - 1)
            elif index < player.current_index:
                player.current_index -= 1

        await _broadcast_state(player, playlist_updated=True)
        return JSONResponse({"status": "OK", "message": "删除成功"})

    except Exception as e:
        return error_response("[/playlist_remove] 移除歌曲异常", exc=e, _logger=logger)


@router.post("/playlist_clear")
async def playlist_clear(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    player_lock=Depends(get_player_lock),
):
    """清空播放队列，保留正在播放的歌曲"""
    try:
        with player_lock:
            current_pid = get_current_playlist_id(player)
            playlist = get_runtime_playlist(player)
            if playlist:
                current_idx = player.current_index
                if 0 <= current_idx < len(playlist.songs):
                    # 有正在播放的歌曲：只保留该首，移至索引 0
                    current_song = playlist.songs[current_idx]
                    playlist.songs = [current_song]
                    player.current_index = 0
                    logger.info("[清空队列] 已保留正在播放的歌曲，重置 player.current_index = 0")
                else:
                    # 没有正在播放的歌曲（current_index == -1）：全部清空
                    playlist.songs = []
                    player.current_index = -1
                    logger.info("[清空队列] 队列已清空，重置 player.current_index = -1")
                playlist.updated_at = time.time()
                playlist.current_playing_index = getattr(player, 'current_index', -1)

        await _broadcast_state(player, playlist_updated=True)
        return JSONResponse({"status": "OK", "message": "清空成功"})
    except Exception as e:
        return error_response("[/playlist_clear] 清空队列异常", exc=e, _logger=logger)
