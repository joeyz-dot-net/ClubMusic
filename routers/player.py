# -*- coding: utf-8 -*-
"""
routers/player.py - 播放器控制路由

路由：
  POST /play
  POST /play_song
  POST /next
  POST /prev
  GET  /status
  POST /pause
  POST /toggle_pause
  POST /seek
  POST /loop
  POST /pitch
  POST /youtube_extract_playlist
  POST /play_youtube_playlist
"""

import os
import time
import logging
import traceback
from urllib.parse import quote

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from routers.state import (
    PLAYER, PLAYLISTS_MANAGER, PLAYBACK_HISTORY,
    DEFAULT_PLAYLIST_ID, CURRENT_PLAYLIST_ID,
    _player_lock, _broadcast_state,
    mpv_get, mpv_command,
    LocalSong, StreamSong,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== 路由 ====================

@router.post("/play")
async def play(request: Request):
    """播放指定歌曲 - 服务器MPV播放 + 浏览器推流"""
    try:
        form = await request.form()
        url = form.get("url", "").strip()
        title = form.get("title", "").strip()
        song_type = form.get("type", "local").strip()
        stream_format = form.get("stream_format", "mp3").strip() or "mp3"
        duration = float(form.get("duration", "0") or "0")

        is_network_song = song_type == "youtube" or url.startswith("http")
        logger.info("=" * 60)
        logger.info(f"🎵 [/play] 接收到播放请求")
        logger.info(f"   📌 URL: {url}")
        logger.info(f"   📌 标题: {title}")
        logger.info(f"   📌 类型: {song_type}")
        logger.info(f"   📌 时长: {duration}秒")
        logger.info(f"   📌 是否网络歌曲: {'✅ 是' if is_network_song else '❌ 否'}")
        logger.info("=" * 60)

        if not url:
            logger.error("[/play] ❌ URL为空")
            return JSONResponse(
                {"status": "ERROR", "error": "URL不能为空"},
                status_code=400
            )

        if is_network_song:
            logger.info(f"[/play] 🌐 创建 StreamSong 对象...")
            song = StreamSong(stream_url=url, title=title or url, duration=duration)
            logger.info(f"[/play] ✓ StreamSong 已创建: video_id={song.video_id}, duration={song.duration}")
        else:
            song = LocalSong(file_path=url, title=title)

        with _player_lock:
            PLAYER.play(
                song,
                mpv_command_func=PLAYER.mpv_command,
                mpv_pipe_exists_func=PLAYER.mpv_pipe_exists,
                ensure_mpv_func=PLAYER.ensure_mpv,
                add_to_history_func=PLAYBACK_HISTORY.add_to_history,
                save_to_history=True,
                mpv_cmd=PLAYER.mpv_cmd
            )
            PLAYER.reset_pitch_shift()

            logger.info(f"▶️ [播放状态改变] 正在播放: {title} (类型: {song_type})")

            try:
                playlist = PLAYLISTS_MANAGER.get_playlist(CURRENT_PLAYLIST_ID)
                if playlist:
                    for idx, song_item in enumerate(playlist.songs):
                        song_item_url = song_item.get("url") if isinstance(song_item, dict) else str(song_item)
                        if song_item_url == url:
                            PLAYER.current_index = idx
                            logger.info(f"[播放] ✓ 已更新 current_index = {idx}, 歌曲: {title}")
                            break
            except Exception as e:
                logger.warning(f"[播放] 更新 current_index 失败: {e}")

        await _broadcast_state()
        return {
            "status": "OK",
            "message": "播放成功",
            "current": PLAYER.current_meta
        }
    except Exception as e:
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/play_song")
async def play_song(request: Request):
    """播放指定歌曲（别名）"""
    return await play(request)


@router.post("/next")
async def next_track():
    """播放下一首（删除当前曲并播放队首）"""
    try:
        with _player_lock:
            playlist = PLAYLISTS_MANAGER.get_playlist(DEFAULT_PLAYLIST_ID)
            songs = playlist.songs if playlist else []

            if not songs:
                logger.info("[/next] 当前队列为空，无法切换")
                return {"status": "EMPTY", "message": "队列为空"}

            current_playing_url = (
                PLAYER.current_meta.get("url")
                or PLAYER.current_meta.get("rel")
                or PLAYER.current_meta.get("raw_url")
            )
            removed_index = -1
            if current_playing_url:
                for idx, song_data in enumerate(songs):
                    song_url = song_data.get("url") if isinstance(song_data, dict) else str(song_data)
                    if song_url == current_playing_url:
                        removed_index = idx
                        break

            if removed_index >= 0:
                removed_song = songs.pop(removed_index)
                playlist.updated_at = time.time()
                song_title = removed_song.get("title") if isinstance(removed_song, dict) else str(removed_song)
                logger.info(f"[/next] 已删除当前曲 (索引{removed_index}): {song_title}")
            else:
                logger.warning(f"[/next] 未找到当前曲 ({current_playing_url})，删除列表第一首")
                removed_song = songs.pop(0)
                playlist.updated_at = time.time()
                song_title = removed_song.get("title") if isinstance(removed_song, dict) else str(removed_song)
                logger.info(f"[/next] 已删除第一首: {song_title}")

            PLAYLISTS_MANAGER.save()

            if not songs:
                logger.info("[/next] 删除后队列已空，停止播放")
                PLAYER.current_meta = {}
                PLAYER.current_index = -1
                return {"status": "EMPTY", "message": "队列已空"}

            next_song_data = songs[0]
            if isinstance(next_song_data, dict):
                url = next_song_data.get("url", "")
                title = next_song_data.get("title", url)
                song_type = next_song_data.get("type", "local")
                duration = next_song_data.get("duration", 0)
            else:
                url = str(next_song_data)
                title = os.path.basename(url)
                song_type = "local"
                duration = 0

            if not url:
                logger.error(f"[/next] 队首歌曲数据不完整: {next_song_data}")
                return JSONResponse(
                    {"status": "ERROR", "error": "歌曲信息不完整"},
                    status_code=400
                )

            if song_type == "youtube" or url.startswith("http"):
                song = StreamSong(stream_url=url, title=title or url, duration=duration)
                logger.info(f"[/next] 播放YouTube: {title}")
            else:
                song = LocalSong(file_path=url, title=title)
                logger.info(f"[/next] 播放本地文件: {title}")

            success = PLAYER.play(
                song,
                mpv_command_func=PLAYER.mpv_command,
                mpv_pipe_exists_func=PLAYER.mpv_pipe_exists,
                ensure_mpv_func=PLAYER.ensure_mpv,
                add_to_history_func=PLAYBACK_HISTORY.add_to_history,
                save_to_history=True
            )

            if not success:
                logger.error(f"[/next] 播放失败: {title}")
                return JSONResponse(
                    {"status": "ERROR", "error": "播放失败"},
                    status_code=500
                )

            PLAYER.current_index = 0
            logger.info(f"[/next] ✓ 已切换到下一首: {title}")

        await _broadcast_state()
        return {
            "status": "OK",
            "current": PLAYER.current_meta,
            "current_index": PLAYER.current_index,
        }
    except Exception as e:
        logger.error(f"[ERROR] /next 异常: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/prev")
async def prev_track():
    """播放上一首"""
    try:
        with _player_lock:
            playlist = PLAYLISTS_MANAGER.get_playlist(CURRENT_PLAYLIST_ID)
            songs = playlist.songs if playlist else []

            if not songs:
                logger.error("[ERROR] /prev: 当前歌单为空")
                return JSONResponse(
                    {"status": "ERROR", "error": "当前歌单为空"},
                    status_code=400
                )

            current_idx = PLAYER.current_index if PLAYER.current_index >= 0 else 0
            prev_idx = current_idx - 1 if current_idx > 0 else len(songs) - 1

            if prev_idx < 0 or current_idx == 0:
                prev_idx = len(songs) - 1

            logger.info(f"[上一首] 从索引 {current_idx} 跳到 {prev_idx}，总歌曲数：{len(songs)}")

            song_data = songs[prev_idx]

            if isinstance(song_data, dict):
                url = song_data.get("url", "")
                title = song_data.get("title", url)
                song_type = song_data.get("type", "local")
                duration = song_data.get("duration", 0)
            else:
                url = str(song_data)
                title = os.path.basename(url)
                song_type = "local"
                duration = 0

            if not url:
                logger.error(f"[ERROR] /prev: 歌曲数据不完整: {song_data}")
                return JSONResponse(
                    {"status": "ERROR", "error": "歌曲信息不完整"},
                    status_code=400
                )

            if song_type == "youtube" or url.startswith("http"):
                song = StreamSong(stream_url=url, title=title or url, duration=duration)
                logger.info(f"[上一首] 播放YouTube: {title}")
            else:
                song = LocalSong(file_path=url, title=title)
                logger.info(f"[上一首] 播放本地文件: {title}")

            success = PLAYER.play(
                song,
                mpv_command_func=PLAYER.mpv_command,
                mpv_pipe_exists_func=PLAYER.mpv_pipe_exists,
                ensure_mpv_func=PLAYER.ensure_mpv,
                add_to_history_func=PLAYBACK_HISTORY.add_to_history,
                save_to_history=True
            )

            if not success:
                logger.error(f"[ERROR] /prev: 播放失败")
                return JSONResponse(
                    {"status": "ERROR", "error": "播放失败"},
                    status_code=500
                )

            PLAYER.current_index = prev_idx
            logger.info(f"[上一首] ✓ 已切换到上一首: {title}")

        await _broadcast_state()
        return {
            "status": "OK",
            "current": PLAYER.current_meta,
            "current_index": PLAYER.current_index,
        }
    except Exception as e:
        logger.error(f"[ERROR] /prev 异常: {str(e)}")
        traceback.print_exc()
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.get("/status")
async def get_status():
    """获取播放器状态"""
    try:
        from routers.media import _get_cover_from_directory, _extract_embedded_cover_bytes

        playlist = PLAYLISTS_MANAGER.get_playlist(CURRENT_PLAYLIST_ID)

        mpv_state = {"paused": True, "time_pos": 0, "duration": 0, "volume": 50}
        try:
            mpv_state = {
                "paused": mpv_get("pause"),
                "time_pos": mpv_get("time-pos"),
                "duration": mpv_get("duration"),
                "volume": mpv_get("volume")
            }
        except Exception as e:
            logger.debug(f"获取 MPV 状态失败 (MPV 可能未运行): {e}")

        current_meta = dict(PLAYER.current_meta) if PLAYER.current_meta else {}
        if current_meta.get("type") == "local" and not current_meta.get("thumbnail_url"):
            url = current_meta.get("url", "")
            if url:
                if os.path.isabs(url):
                    abs_path = url
                else:
                    abs_path = os.path.join(PLAYER.music_dir, url)

                has_cover = False
                if os.path.isfile(abs_path):
                    if _get_cover_from_directory(abs_path):
                        has_cover = True
                    else:
                        cover_bytes = _extract_embedded_cover_bytes(abs_path)
                        if cover_bytes:
                            has_cover = True

                if has_cover:
                    current_meta["thumbnail_url"] = f"/cover/{quote(url, safe='')}"

        return {
            "status": "OK",
            "current_meta": current_meta,
            "current_playlist_id": CURRENT_PLAYLIST_ID,
            "current_playlist_name": playlist.name if playlist else "--",
            "loop_mode": PLAYER.loop_mode,
            "pitch_shift": PLAYER.pitch_shift,
            "mpv_state": mpv_state
        }
    except Exception as e:
        logger.error(f"获取播放器状态失败: {e}")
        return JSONResponse(
            {
                "status": "ERROR",
                "error": "获取播放器状态失败",
                "current_meta": {},
                "current_playlist_id": DEFAULT_PLAYLIST_ID,
                "current_playlist_name": "--",
                "loop_mode": 0,
                "pitch_shift": 0,
                "mpv_state": {"paused": True, "time_pos": 0, "duration": 0, "volume": 50}
            },
            status_code=200
        )


@router.post("/pause")
async def pause():
    """暂停/继续播放"""
    try:
        with _player_lock:
            paused = mpv_get("pause")
            mpv_command(["set_property", "pause", not paused])

        new_paused = not paused
        if PLAYER.current_meta and PLAYER.current_meta.get("url"):
            title = PLAYER.current_meta.get("title", "N/A")
            status_text = "⏸️ 暂停" if new_paused else "▶️ 播放中"
            logger.info(f"[播放状态改变] {status_text} | 歌曲: {title}")

        await _broadcast_state()
        return {"status": "OK", "paused": not paused}
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/toggle_pause")
async def toggle_pause():
    """暂停/继续播放（别名）"""
    return await pause()


@router.post("/seek")
async def seek(request: Request):
    """跳转到指定位置"""
    try:
        form = await request.form()
        percent = float(form.get("percent", 0))

        duration = mpv_get("duration")
        if duration and duration > 0:
            position = (percent / 100) * duration
            mpv_command(["seek", position, "absolute"])
            return {"status": "OK", "position": position}
        else:
            mpv_command(["seek", percent, "absolute-percent"])
            return {"status": "OK", "percent": percent}
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/loop")
async def set_loop_mode():
    """设置循环模式"""
    try:
        PLAYER.toggle_loop_mode()

        loop_modes = {0: "❌ 不循环", 1: "🔂 单曲循环", 2: "🔁 全部循环"}
        mode_text = loop_modes.get(PLAYER.loop_mode, "未知")
        logger.info(f"[播放状态改变] 循环模式: {mode_text}")

        return {"status": "OK", "loop_mode": PLAYER.loop_mode}
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/pitch")
async def set_pitch_shift(request: Request):
    """设置音调偏移（KTV升降调，-6 到 +6 个半音）"""
    try:
        data = await request.json()
        semitones = max(-6, min(6, int(data.get("semitones", 0))))
        PLAYER.set_pitch_shift(semitones)
        direction = "升" if semitones > 0 else ("降" if semitones < 0 else "原")
        logger.info(f"[播放状态改变] {direction}调: {semitones:+d} 半音")
        return {"status": "OK", "pitch_shift": PLAYER.pitch_shift}
    except (ValueError, TypeError) as e:
        return JSONResponse(
            {"status": "ERROR", "error": f"无效的半音值: {e}"},
            status_code=400
        )
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/youtube_extract_playlist")
async def youtube_extract_playlist(request: Request):
    """提取YouTube播放列表"""
    try:
        form = await request.form()
        url = form.get("url", "").strip()

        if not url:
            return JSONResponse(
                {"status": "ERROR", "error": "URL不能为空"},
                status_code=400
            )

        videos = StreamSong.extract_playlist(url, max_results=PLAYER.youtube_url_extra_max)
        return {"status": "OK", "videos": videos}
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )


@router.post("/play_youtube_playlist")
async def play_youtube_playlist(request: Request):
    """播放YouTube播放列表"""
    try:
        data = await request.json()
        videos = data.get("videos", [])

        if not videos:
            return JSONResponse(
                {"status": "ERROR", "error": "播放列表为空"},
                status_code=400
            )

        playlist = PLAYLISTS_MANAGER.get_playlist(CURRENT_PLAYLIST_ID)
        if not playlist:
            playlist = PLAYLISTS_MANAGER.get_playlist(DEFAULT_PLAYLIST_ID)

        for video in videos:
            playlist.songs.append({
                "url": video.get("url"),
                "title": video.get("title", ""),
                "type": "youtube",
                "duration": video.get("duration", 0),
                "thumbnail_url": video.get("thumbnail_url", ""),
            })

        playlist.updated_at = time.time()
        PLAYLISTS_MANAGER.save()

        return {"status": "OK", "added": len(videos)}
    except Exception as e:
        return JSONResponse(
            {"status": "ERROR", "error": str(e)},
            status_code=500
        )
