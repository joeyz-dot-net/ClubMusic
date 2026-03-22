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
from urllib.parse import quote

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from models import MusicPlayer, Playlists, PlayHistory
from routers.dependencies import get_player_for_request, get_playlists, get_playback_history, get_player_lock
from routers.state import (
    DEFAULT_PLAYLIST_ID, CURRENT_PLAYLIST_ID,
    get_current_playlist_id,
    _broadcast_state,
    mpv_get, mpv_command,
    LocalSong, StreamSong,
    error_response,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== 辅助函数 ====================

def _extract_song_info(song_data) -> tuple:
    """从歌曲数据中提取 (url, title, type, duration)"""
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
    return url, title, song_type, duration


def _create_song_object(url, title, song_type, duration):
    """根据类型创建 LocalSong 或 StreamSong"""
    if song_type == "youtube" or url.startswith("http"):
        return StreamSong(stream_url=url, title=title or url, duration=duration)
    else:
        return LocalSong(file_path=url, title=title)


def _room_output_not_ready_response(player: MusicPlayer, endpoint: str):
    """RoomPlayer 的外部 PCM 接收端未就绪时返回明确错误。"""
    if not hasattr(player, '_room_id'):
        return None

    if player.is_room_output_ready():
        return None

    pcm_pipe = getattr(player, '_pcm_pipe_name', '')
    logger.warning(f"[{endpoint}] 房间音频输出未就绪，拒绝播放请求: room_id={player._room_id}, pcm_pipe={pcm_pipe}")
    return JSONResponse(
        {
            "status": "ERROR",
            "error": "房间音频输出未就绪，请先连接 ClubVoice",
            "room_id": player._room_id,
            "pcm_pipe": pcm_pipe,
        },
        status_code=409,
    )


# ==================== 路由 ====================

@router.post("/play")
async def play(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    playback_history: PlayHistory = Depends(get_playback_history),
    player_lock=Depends(get_player_lock),
):
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
        pipe = request.query_params.get('pipe', '')
        logger.info(f"   📌 Pipe: {pipe or '(default)'}")
        _player_type = 'PipePlayer' if player.mpv_cmd is None else ('RoomPlayer' if hasattr(player, '_room_id') else 'Default')
        logger.info(f"   📌 Player: {_player_type}")
        logger.info(f"   📌 管道路径: {player.pipe_name}")
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

        room_output_error = _room_output_not_ready_response(player, "/play")
        if room_output_error:
            return room_output_error

        with player_lock:
            success = player.play(
                song,
                mpv_command_func=player.mpv_command,
                mpv_pipe_exists_func=player.mpv_pipe_exists,
                ensure_mpv_func=player.ensure_mpv,
                add_to_history_func=playback_history.add_to_history,
                save_to_history=True,
                mpv_cmd=player.mpv_cmd
            )
            if not success:
                logger.error(f"[/play] ❌ 播放失败: {title or url}")
                return JSONResponse(
                    {"status": "ERROR", "error": "播放失败", "current": player.current_meta},
                    status_code=500,
                )

            player.reset_pitch_shift()

            logger.info(f"▶️ [播放状态改变] 正在播放: {title} (类型: {song_type})")

            try:
                current_pid = get_current_playlist_id(player)
                playlist = playlists.get_playlist(current_pid)
                if playlist:
                    for idx, song_item in enumerate(playlist.songs):
                        song_item_url = song_item.get("url") if isinstance(song_item, dict) else str(song_item)
                        if song_item_url == url:
                            player.current_index = idx
                            logger.info(f"[播放] ✓ 已更新 current_index = {idx}, 歌曲: {title}")
                            break
            except Exception as e:
                logger.warning(f"[播放] 更新 current_index 失败: {e}")

        await _broadcast_state(player)
        return {
            "status": "OK",
            "message": "播放成功",
            "current": player.current_meta,
            "current_index": player.current_index,
        }
    except Exception as e:
        return error_response("[/play] 播放异常", exc=e, _logger=logger)


@router.get("/debug/pipe-check")
async def debug_pipe_check(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
):
    """诊断端点：检查管道状态"""
    pipe = request.query_params.get('pipe', '')
    return {
        "pipe_param": pipe,
        "pipe_name": player.pipe_name,
        "is_pipe_player": player.mpv_cmd is None,
        "pipe_exists": player.mpv_pipe_exists(),
    }


@router.post("/play_song")
async def play_song(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    playback_history: PlayHistory = Depends(get_playback_history),
    player_lock=Depends(get_player_lock),
):
    """播放指定歌曲（别名）"""
    return await play(request, player, playlists, playback_history, player_lock)


@router.post("/next")
async def next_track(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    playback_history: PlayHistory = Depends(get_playback_history),
    player_lock=Depends(get_player_lock),
):
    """播放下一首（根据 loop_mode / shuffle_mode 决定行为）"""
    try:
        response_payload = None
        response_status_code = 200
        should_broadcast_playlist_update = False

        room_output_error = _room_output_not_ready_response(player, "/next")
        if room_output_error:
            return room_output_error

        with player_lock:
            current_pid = get_current_playlist_id(player)
            playlist = playlists.get_playlist(current_pid)
            songs = playlist.songs if playlist else []

            if not songs:
                logger.info("[/next] 当前队列为空，无法切换")
                return {"status": "EMPTY", "message": "队列为空"}

            current_playing_url = (
                player.current_meta.get("url")
                or player.current_meta.get("rel")
                or player.current_meta.get("raw_url")
            )
            removed_index = -1
            if current_playing_url:
                for idx, song_data in enumerate(songs):
                    song_url = song_data.get("url") if isinstance(song_data, dict) else str(song_data)
                    if song_url == current_playing_url:
                        removed_index = idx
                        break

            # 根据 loop_mode 处理当前歌曲
            if player.loop_mode == 2:
                # 全部循环：移到队尾
                if removed_index >= 0:
                    moved_song = songs.pop(removed_index)
                    songs.append(moved_song)
                    song_title = moved_song.get("title") if isinstance(moved_song, dict) else str(moved_song)
                    logger.info(f"[/next] 🔁 全部循环: 已将 {song_title} 移到队尾")
                else:
                    moved_song = songs.pop(0)
                    songs.append(moved_song)
                    song_title = moved_song.get("title") if isinstance(moved_song, dict) else str(moved_song)
                    logger.info(f"[/next] 🔁 全部循环: 已将 {song_title} 移到队尾")
            else:
                # 不循环 / 单曲循环：删除当前曲（单曲循环下手动下一首 = 跳过）
                if removed_index >= 0:
                    removed_song = songs.pop(removed_index)
                    song_title = removed_song.get("title") if isinstance(removed_song, dict) else str(removed_song)
                    logger.info(f"[/next] 已删除当前曲 (索引{removed_index}): {song_title}")
                elif songs:
                    removed_song = songs.pop(0)
                    song_title = removed_song.get("title") if isinstance(removed_song, dict) else str(removed_song)
                    logger.info(f"[/next] 已删除第一首: {song_title}")

            playlist.updated_at = time.time()
            playlists.save()
            should_broadcast_playlist_update = True

            if not songs:
                logger.info("[/next] 队列已空，停止播放")
                player.current_meta = {}
                player.current_index = -1
                response_payload = {
                    "status": "EMPTY",
                    "message": "队列已空",
                    "current": player.current_meta,
                    "current_index": player.current_index,
                }
            else:
                # 随机模式：从队列随机选一首放到队首
                if player.shuffle_mode and len(songs) > 1:
                    import random
                    pick = random.randint(0, len(songs) - 1)
                    songs.insert(0, songs.pop(pick))
                    logger.info(f"[/next] 🔀 随机模式: 随机选中第{pick}首")

                # 播放队首，跳过失败歌曲（最多5首）
                MAX_SKIP = 5
                skipped_songs = []
                success = False

                for attempt in range(MAX_SKIP):
                    if not songs:
                        break

                    url, title, song_type, duration = _extract_song_info(songs[0])

                    if not url:
                        skipped = songs.pop(0)
                        songs.append(skipped)
                        skipped_songs.append({"url": url, "title": title})
                        logger.warning(f"[/next] 跳过数据不完整的歌曲 ({attempt+1}/{MAX_SKIP}): {title}")
                        continue

                    song = _create_song_object(url, title, song_type, duration)
                    logger.info(f"[/next] 尝试播放: {title}")

                    success = player.play(
                        song,
                        mpv_command_func=player.mpv_command,
                        mpv_pipe_exists_func=player.mpv_pipe_exists,
                        ensure_mpv_func=player.ensure_mpv,
                        add_to_history_func=playback_history.add_to_history,
                        save_to_history=True
                    )

                    if success:
                        player.current_index = 0
                        logger.info(f"[/next] ✓ 已切换到下一首: {title}")
                        break
                    else:
                        skipped = songs.pop(0)
                        songs.append(skipped)
                        skipped_songs.append({"url": url, "title": title})
                        logger.warning(f"[/next] 跳过失败歌曲 ({attempt+1}/{MAX_SKIP}): {title}")

                playlist.updated_at = time.time()
                playlists.save()

                if not success:
                    player.current_meta = {}
                    player.current_index = -1
                    logger.error(f"[/next] 连续 {len(skipped_songs)} 首播放失败")
                    response_payload = {
                        "status": "ERROR",
                        "error": "连续播放失败",
                        "skipped_songs": skipped_songs,
                        "current": player.current_meta,
                        "current_index": player.current_index,
                    }
                    response_status_code = 500
                else:
                    response_payload = {
                        "status": "OK",
                        "current": player.current_meta,
                        "current_index": player.current_index,
                        "skipped_songs": skipped_songs,
                    }

        if should_broadcast_playlist_update:
            await _broadcast_state(player, playlist_updated=True)

        if response_status_code != 200:
            return JSONResponse(response_payload, status_code=response_status_code)

        return response_payload
    except Exception as e:
        return error_response("[/next] 切换下一首异常", exc=e, _logger=logger)


@router.post("/prev")
async def prev_track(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
    playback_history: PlayHistory = Depends(get_playback_history),
    player_lock=Depends(get_player_lock),
):
    """播放上一首"""
    try:
        room_output_error = _room_output_not_ready_response(player, "/prev")
        if room_output_error:
            return room_output_error

        with player_lock:
            current_pid = get_current_playlist_id(player)
            playlist = playlists.get_playlist(current_pid)
            songs = playlist.songs if playlist else []

            if not songs:
                logger.error("[ERROR] /prev: 当前歌单为空")
                return JSONResponse(
                    {"status": "ERROR", "error": "当前歌单为空"},
                    status_code=400
                )

            current_idx = player.current_index if player.current_index >= 0 else 0
            prev_idx = current_idx - 1 if current_idx > 0 else len(songs) - 1

            if prev_idx < 0 or current_idx == 0:
                prev_idx = len(songs) - 1

            logger.info(f"[上一首] 从索引 {current_idx} 跳到 {prev_idx}，总歌曲数：{len(songs)}")

            # 跳过循环：从 prev_idx 向前扫描，最多尝试 MAX_SKIP 首
            MAX_SKIP = 5
            skipped_songs = []
            success = False
            tried_idx = prev_idx
            start_idx = prev_idx

            for attempt in range(MAX_SKIP):
                url, title, song_type, duration = _extract_song_info(songs[tried_idx])

                if not url:
                    skipped_songs.append({"url": url, "title": title})
                    logger.warning(f"[上一首] 跳过数据不完整的歌曲 ({attempt+1}/{MAX_SKIP}): {title}")
                    tried_idx = (tried_idx - 1) % len(songs)
                    if tried_idx == start_idx:
                        break
                    continue

                song = _create_song_object(url, title, song_type, duration)
                logger.info(f"[上一首] 尝试播放: {title}")

                success = player.play(
                    song,
                    mpv_command_func=player.mpv_command,
                    mpv_pipe_exists_func=player.mpv_pipe_exists,
                    ensure_mpv_func=player.ensure_mpv,
                    add_to_history_func=playback_history.add_to_history,
                    save_to_history=True
                )

                if success:
                    player.current_index = tried_idx
                    logger.info(f"[上一首] ✓ 已切换到上一首: {title}")
                    break
                else:
                    skipped_songs.append({"url": url, "title": title})
                    logger.warning(f"[上一首] 跳过失败歌曲 ({attempt+1}/{MAX_SKIP}): {title}")
                    tried_idx = (tried_idx - 1) % len(songs)
                    if tried_idx == start_idx:
                        break

            if not success:
                logger.error(f"[上一首] 连续 {len(skipped_songs)} 首播放失败")
                return JSONResponse(
                    {"status": "ERROR", "error": "连续播放失败", "skipped_songs": skipped_songs},
                    status_code=500
                )

        await _broadcast_state(player)
        return {
            "status": "OK",
            "current": player.current_meta,
            "current_index": player.current_index,
            "skipped_songs": skipped_songs,
        }
    except Exception as e:
        return error_response("[/prev] 切换上一首异常", exc=e, _logger=logger)


@router.get("/status")
async def get_status(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
    """获取播放器状态"""
    try:
        current_pid = get_current_playlist_id(player)
        playlist = playlists.get_playlist(current_pid)

        mpv_state = {"paused": True, "time_pos": 0, "duration": 0, "volume": 50}
        try:
            mpv_state = {
                "paused": player.mpv_get("pause"),
                "time_pos": player.mpv_get("time-pos"),
                "duration": player.mpv_get("duration"),
                "volume": player.mpv_get("volume")
            }
        except Exception as e:
            logger.debug(f"获取 MPV 状态失败 (MPV 可能未运行): {e}")

        current_meta = dict(player.current_meta) if player.current_meta else {}
        if current_meta.get("type") == "local":
            url = current_meta.get("url", "")
            if url:
                current_meta["thumbnail_url"] = f"/cover/{quote(url, safe='/')}"

        return {
            "status": "OK",
            "current_meta": current_meta,
            "current_playlist_id": current_pid,
            "current_playlist_name": playlist.name if playlist else "--",
            "current_index": getattr(player, "current_index", -1),
            "playlist_updated_at": getattr(playlist, "updated_at", 0) if playlist else 0,
            "loop_mode": player.loop_mode,
            "shuffle_mode": getattr(player, "shuffle_mode", False),
            "pitch_shift": player.pitch_shift,
            "mpv_state": mpv_state,
            "server_time": time.time()
        }
    except Exception as e:
        logger.error(f"获取播放器状态失败: {e}")
        return JSONResponse(
            {
                "status": "ERROR",
                "error": "获取播放器状态失败",
                "current_meta": {},
                "current_playlist_id": get_current_playlist_id(player) if player else DEFAULT_PLAYLIST_ID,
                "current_playlist_name": "--",
                "current_index": getattr(player, "current_index", -1) if player else -1,
                "playlist_updated_at": 0,
                "loop_mode": 0,
                "shuffle_mode": getattr(player, "shuffle_mode", False) if player else False,
                "pitch_shift": 0,
                "mpv_state": {"paused": True, "time_pos": 0, "duration": 0, "volume": 50}
            },
            status_code=200
        )


@router.post("/pause")
async def pause(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    player_lock=Depends(get_player_lock),
):
    """暂停/继续播放"""
    try:
        with player_lock:
            paused = player.mpv_get("pause")
            player.mpv_command(["set_property", "pause", not paused])

        new_paused = not paused
        if player.current_meta and player.current_meta.get("url"):
            title = player.current_meta.get("title", "N/A")
            status_text = "⏸️ 暂停" if new_paused else "▶️ 播放中"
            logger.info(f"[播放状态改变] {status_text} | 歌曲: {title}")

        await _broadcast_state(player)
        return {"status": "OK", "paused": not paused}
    except Exception as e:
        return error_response("[/pause] 暂停/继续异常", exc=e, _logger=logger)


@router.post("/toggle_pause")
async def toggle_pause(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    player_lock=Depends(get_player_lock),
):
    """暂停/继续播放（别名）"""
    return await pause(request, player, player_lock)


@router.post("/seek")
async def seek(request: Request, player: MusicPlayer = Depends(get_player_for_request)):
    """跳转到指定位置"""
    try:
        form = await request.form()
        percent = float(form.get("percent", 0))

        duration = player.mpv_get("duration")
        if duration and duration > 0:
            position = (percent / 100) * duration
            player.mpv_command(["seek", position, "absolute"])
            return {"status": "OK", "position": position}
        else:
            player.mpv_command(["seek", percent, "absolute-percent"])
            return {"status": "OK", "percent": percent}
    except Exception as e:
        return error_response("[/seek] 跳转异常", exc=e, _logger=logger)


@router.post("/loop")
async def set_loop_mode(request: Request, player: MusicPlayer = Depends(get_player_for_request)):
    """设置循环模式"""
    try:
        player.toggle_loop_mode()

        loop_modes = {0: "❌ 不循环", 1: "🔂 单曲循环", 2: "🔁 全部循环"}
        mode_text = loop_modes.get(player.loop_mode, "未知")
        logger.info(f"[播放状态改变] 循环模式: {mode_text}")

        return {"status": "OK", "loop_mode": player.loop_mode}
    except Exception as e:
        return error_response("[/loop] 设置循环模式异常", exc=e, _logger=logger)


@router.post("/shuffle")
async def set_shuffle_mode(request: Request, player: MusicPlayer = Depends(get_player_for_request)):
    """设置随机播放模式"""
    try:
        player.toggle_shuffle_mode()

        mode_text = "🔀 随机播放" if player.shuffle_mode else "➡️ 顺序播放"
        logger.info(f"[播放状态改变] 随机模式: {mode_text}")

        return {"status": "OK", "shuffle_mode": player.shuffle_mode}
    except Exception as e:
        return error_response("[/shuffle] 设置随机模式异常", exc=e, _logger=logger)


@router.post("/pitch")
async def set_pitch_shift(request: Request, player: MusicPlayer = Depends(get_player_for_request)):
    """设置音调偏移（KTV升降调，-6 到 +6 个半音）"""
    try:
        data = await request.json()
        semitones = max(-6, min(6, int(data.get("semitones", 0))))
        player.set_pitch_shift(semitones)
        direction = "升" if semitones > 0 else ("降" if semitones < 0 else "原")
        logger.info(f"[播放状态改变] {direction}调: {semitones:+d} 半音")
        return {"status": "OK", "pitch_shift": player.pitch_shift}
    except (ValueError, TypeError) as e:
        return error_response(f"无效的半音值: {e}", 400)
    except Exception as e:
        return error_response("[/pitch] 设置音调异常", exc=e, _logger=logger)


@router.post("/youtube_extract_playlist")
async def youtube_extract_playlist(request: Request, player: MusicPlayer = Depends(get_player_for_request)):
    """提取YouTube播放列表"""
    try:
        form = await request.form()
        url = form.get("url", "").strip()

        if not url:
            return JSONResponse(
                {"status": "ERROR", "error": "URL不能为空"},
                status_code=400
            )

        videos = StreamSong.extract_playlist(url, max_results=player.youtube_url_extra_max)
        return {"status": "OK", "videos": videos}
    except Exception as e:
        return error_response("[/youtube_extract_playlist] 提取播放列表异常", exc=e, _logger=logger)


@router.post("/play_youtube_playlist")
async def play_youtube_playlist(
    request: Request,
    player: MusicPlayer = Depends(get_player_for_request),
    playlists: Playlists = Depends(get_playlists),
):
    """播放YouTube播放列表"""
    try:
        data = await request.json()
        videos = data.get("videos", [])

        if not videos:
            return JSONResponse(
                {"status": "ERROR", "error": "播放列表为空"},
                status_code=400
            )

        current_pid = get_current_playlist_id(player)
        playlist = playlists.get_playlist(current_pid)
        if not playlist:
            playlist = playlists.get_playlist(DEFAULT_PLAYLIST_ID)

        for video in videos:
            playlist.songs.append({
                "url": video.get("url"),
                "title": video.get("title", ""),
                "type": "youtube",
                "duration": video.get("duration", 0),
                "thumbnail_url": video.get("thumbnail_url", ""),
            })

        playlist.updated_at = time.time()
        playlists.save()

        return {"status": "OK", "added": len(videos)}
    except Exception as e:
        return error_response("[/play_youtube_playlist] 播放列表异常", exc=e, _logger=logger)
