# -*- coding: utf-8 -*-
"""
ClubMusic - 纯FastAPI实现的网页音乐播放器
"""

import os
import sys
import logging
import threading
import asyncio
from pathlib import Path
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

# 确保 stdout 使用 UTF-8 编码（Windows 兼容性）
if sys.stdout.encoding != "utf-8":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from starlette.middleware.cors import CORSMiddleware

# ============================================
# 导入路由模块（同时触发 state.py 中的单例初始化）
# ============================================

import routers.state as state
from routers.state import (
    PLAYER, PLAYLISTS_MANAGER, PLAYBACK_HISTORY,
    DEFAULT_PLAYLIST_ID,
    StreamSong, LocalSong,
    _get_resource_path,
)

from routers import player as player_router
from routers import playlist as playlist_router
from routers import search as search_router
from routers import history as history_router
from routers import media as media_router
from routers import settings as settings_router
from routers import websocket as websocket_router


# ============================================
# 初始化 settings.ini（如不存在则创建默认配置）
# ============================================

def _init_default_settings_ini():
    """确保 settings.ini 包含所有需要的默认节，只补充缺失部分，不覆盖已有内容。"""
    import configparser

    config_file = Path("settings.ini")
    config = configparser.ConfigParser()

    if config_file.exists():
        config.read(config_file, encoding="utf-8")

    changed = False

    # 补充 [ui] 节
    if not config.has_section('ui'):
        config.add_section('ui')
        config.set('ui', 'youtube_controls', 'true')
        config.set('ui', 'expand_button', 'true')
        changed = True

    # 补充 [cache] 节或其中缺失的键
    if not config.has_section('cache'):
        config.add_section('cache')
        config.set('cache', 'url_cache_enabled', 'true')
        changed = True
    elif not config.has_option('cache', 'url_cache_enabled'):
        config.set('cache', 'url_cache_enabled', 'true')
        changed = True

    # 补充 [backup] 节或其中缺失的键
    if not config.has_section('backup'):
        config.add_section('backup')
        changed = True
    backup_defaults = {
        'enabled':        'true',
        'backup_dir':     'backups',
        'interval_hours': '6',
        'keep_days':      '7',
    }
    for key, val in backup_defaults.items():
        if not config.has_option('backup', key):
            config.set('backup', key, val)
            changed = True

    if changed:
        try:
            with open(config_file, 'w', encoding='utf-8') as f:
                config.write(f)
            logger.info("[配置] settings.ini 已补充默认配置节")
        except Exception as e:
            logger.warning(f"[配置] 更新 settings.ini 失败（无害）: {e}")


# ============================================
# 自动填充队列并自动播放（后台空闲1分钟后无歌曲自动填充）
# ============================================

def auto_fill_and_play_if_idle():
    """
    后台守护线程：如果1分钟内没有歌曲播放且队列为空，自动随机选择10首歌填充并播放

    改进：
    - 随机池同时包含：所有非默认歌单、默认歌单（作为回退）和本地文件树
    - 支持从歌单中包含网络歌曲(YouTube/http)及其不同字段名 (url, stream_url, id)
    - 归一化歌曲条目为 dict: {url, title, type, duration?, thumbnail_url?}
    - 去重基于 url
    - 空闲阈值严格使用 60 秒（需求）
    """
    import time
    import random
    import re

    def build_youtube_url_from_id(video_id: str):
        if not video_id:
            return ""
        if video_id.startswith("http"):
            return video_id
        return f"https://www.youtube.com/watch?v={video_id}"

    def normalize_song_item(item):
        """把不同来源的歌曲条目标准化为 dict（更鲁棒地包含网络歌曲）"""
        try:
            if not item:
                return None

            url = None
            title = ""
            typ = "local"
            duration = 0
            thumbnail = None

            if isinstance(item, dict):
                url = item.get("url") or item.get("stream_url") or item.get("rel") or item.get("path") or ""
                title = item.get("title") or item.get("name") or item.get("media_title") or ""
                duration = item.get("duration", 0)
                thumbnail = item.get("thumbnail_url") or item.get("thumb") or None
                typ = item.get("type") or item.get("song_type") or typ

            else:
                url = getattr(item, "url", None) or getattr(item, "stream_url", None) or getattr(item, "rel", None)
                title = getattr(item, "title", None) or getattr(item, "name", None) or title
                duration = getattr(item, "duration", duration)
                thumbnail = getattr(item, "thumbnail_url", None) or getattr(item, "get_thumbnail_url", None)
                typ = getattr(item, "type", None) or getattr(item, "stream_type", None) or typ

            if not url:
                vid = None
                if isinstance(item, dict):
                    vid = item.get("id") or item.get("video_id")
                else:
                    vid = getattr(item, "video_id", None) or getattr(item, "id", None)
                if vid:
                    url = build_youtube_url_from_id(vid)

            if not url:
                return None

            url = str(url).strip()

            if not typ or typ == "local":
                if url.startswith("http://") or url.startswith("https://"):
                    if "youtube.com" in url.lower() or "youtu.be" in url.lower():
                        typ = "youtube"
                    else:
                        typ = "stream"
                else:
                    typ = "local"

            return {
                "url": url,
                "title": title or os.path.splitext(os.path.basename(url))[0],
                "type": typ,
                "duration": duration or 0,
                "thumbnail_url": thumbnail
            }
        except Exception as e:
            logger.debug(f"[自动填充.normalize] 归一化条目失败: {e}")
            return None

    def get_all_available_songs():
        """收集所有歌单（包含非default与default）和本地文件树，确保包含网络歌曲"""
        all_songs = []

        try:
            pls = PLAYLISTS_MANAGER.get_all()
            logger.debug(f"[自动填充] 收集歌单数量: {len(pls)}")
            for pl in pls:
                try:
                    if not getattr(pl, "songs", None):
                        continue
                    for s in pl.songs:
                        norm = normalize_song_item(s)
                        if norm and norm.get("url"):
                            all_songs.append(norm)
                except Exception as e:
                    logger.debug(f"[自动填充] 处理歌单 {getattr(pl,'id', '??')} 的歌曲失败: {e}")
        except Exception as e:
            logger.warning(f"[自动填充] 收集歌单歌曲失败: {e}")

        # 从播放历史中补充网络歌曲（YouTube / stream / http）
        try:
            history_items = []
            try:
                history_items = PLAYBACK_HISTORY.get_all() if hasattr(PLAYBACK_HISTORY, 'get_all') else []
            except Exception as he:
                logger.debug(f"[自动填充] 读取播放历史失败: {he}")

            for h in history_items:
                try:
                    if not h:
                        continue
                    url = h.get('url') if isinstance(h, dict) else None
                    typ = (h.get('type') if isinstance(h, dict) else None) or ''
                    if not url:
                        continue
                    url = str(url).strip()
                    if typ in ('youtube', 'stream') or url.startswith('http'):
                        song_entry = {
                            'url': url,
                            'title': h.get('title') if isinstance(h, dict) else os.path.basename(url),
                            'type': typ or ('youtube' if 'youtube' in url.lower() or 'youtu.be' in url.lower() else 'stream'),
                            'duration': h.get('duration', 0) if isinstance(h, dict) else 0,
                            'thumbnail_url': h.get('thumbnail_url') if isinstance(h, dict) else None
                        }
                        all_songs.append(song_entry)
                except Exception as e:
                    logger.debug(f"[自动填充] 处理播放历史项失败: {e}")
        except Exception:
            pass

        # 本地文件树补充（不覆盖已有同url条目）
        def collect_local(node):
            items = []
            if not node:
                return items
            files = node.get("files") or []
            for f in files:
                rel = f.get("rel") or f.get("path") or None
                name = f.get("name") or None
                if rel:
                    items.append({
                        "url": rel,
                        "title": os.path.splitext(name or rel)[0],
                        "type": "local",
                        "duration": 0,
                        "thumbnail_url": None
                    })
            for d in (node.get("dirs") or []):
                items.extend(collect_local(d))
            return items

        try:
            tree = getattr(PLAYER, "local_file_tree", None)
            if tree:
                all_songs.extend(collect_local(tree))
        except Exception as e:
            logger.debug(f"[自动填充] 收集本地文件失败: {e}")

        # 去重并保持首个出现顺序；确保网络歌曲保留
        seen = set()
        unique = []
        for s in all_songs:
            url = s.get("url")
            if not url:
                continue
            url_norm = url.strip()
            if url_norm in seen:
                continue
            seen.add(url_norm)
            s["url"] = url_norm
            unique.append(s)

        logger.debug(f"[自动填充] 候选总数: {len(unique)} (本地+网络+歌单聚合) -> youtube/stream count: {sum(1 for x in unique if x['type'] in ('youtube','stream'))}")
        return unique

    def fill_and_play():
        playlist = PLAYLISTS_MANAGER.get_playlist(DEFAULT_PLAYLIST_ID)
        if not playlist:
            return
        if playlist.songs:
            return

        candidates = get_all_available_songs()
        if not candidates:
            logger.info("[自动填充] 无可用候选歌曲，跳过填充")
            return

        playable = [c for c in candidates if c.get("url")]
        if not playable:
            logger.info("[自动填充] 无有效 URL，跳过")
            return

        random.shuffle(playable)
        selected = playable[:10]

        import time as _time
        for song in selected:
            song_dict = {
                "url": song.get("url"),
                "title": song.get("title") or os.path.basename(song.get("url") or ""),
                "type": song.get("type", "local"),
                "duration": song.get("duration", 0),
                "thumbnail_url": song.get("thumbnail_url") or None,
                "ts": int(_time.time())
            }
            playlist.songs.append(song_dict)

        playlist.updated_at = _time.time()
        PLAYLISTS_MANAGER.save()
        logger.info(f"[自动填充] 已添加 {len(selected)} 首歌曲到默认歌单 (包含网络歌曲: {sum(1 for x in selected if x['type'] in ('youtube','stream'))})")

        try:
            first = playlist.songs[0]
            if first:
                url = first.get("url")
                title = first.get("title", url)
                typ = first.get("type", "local")
                duration = first.get("duration", 0)
                if typ == "youtube" or (isinstance(url, str) and url.startswith("http")):
                    s = StreamSong(stream_url=url, title=title, duration=duration)
                else:
                    s = LocalSong(file_path=url, title=title)
                PLAYER.play(
                    s,
                    mpv_command_func=PLAYER.mpv_command,
                    mpv_pipe_exists_func=PLAYER.mpv_pipe_exists,
                    ensure_mpv_func=PLAYER.ensure_mpv,
                    add_to_history_func=PLAYBACK_HISTORY.add_to_history,
                    save_to_history=True,
                    mpv_cmd=PLAYER.mpv_cmd
                )
                logger.info("[自动填充] 自动播放已启动（第一首）")
        except Exception as e:
            logger.error(f"[自动填充] 自动播放第一首失败: {e}")

    def monitor():
        import time as _time
        logger.info("[自动填充] 后台自动填充线程已启动")
        last_play_ts = _time.time()
        IDLE_SECONDS = 60
        while True:
            try:
                playlist = PLAYLISTS_MANAGER.get_playlist(DEFAULT_PLAYLIST_ID)
                is_playing = bool(PLAYER.current_meta and PLAYER.current_meta.get("url"))
                if is_playing:
                    last_play_ts = _time.time()
                elif (not playlist or not playlist.songs) and (_time.time() - last_play_ts > IDLE_SECONDS):
                    logger.info("[自动填充] 检测到空闲超过1分钟且队列为空，自动填充并播放")
                    fill_and_play()
                    last_play_ts = _time.time()
                _time.sleep(10)
            except Exception as e:
                logger.error(f"[自动填充] 线程异常: {e}")
                import time as _t
                _t.sleep(10)

    t = threading.Thread(target=monitor, daemon=True, name="AutoFillIdleThread")
    t.start()


# ============================================
# 定义应用生命周期处理
# ============================================

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理（启动和关闭事件）"""
    state._main_loop = asyncio.get_event_loop()
    logger.info("应用启动完成")

    _init_default_settings_ini()
    auto_fill_and_play_if_idle()

    from models.backup import backup_manager as _backup_manager
    _backup_manager.start()

    yield  # 应用运行期间

    # 关闭事件
    logger.info("应用正在关闭...")

    try:
        if PLAYER and PLAYER.mpv_process:
            logger.info("正在关闭 MPV 进程...")
            PLAYER.mpv_process.terminate()
            try:
                PLAYER.mpv_process.wait(timeout=3)
                logger.info("✅ MPV 进程已正常关闭")
            except Exception:
                logger.warning("MPV 进程未响应，强制终止...")
                PLAYER.mpv_process.kill()
                logger.info("✅ MPV 进程已强制终止")
    except Exception as e:
        logger.error(f"关闭 MPV 进程失败: {e}")
        try:
            import subprocess
            subprocess.run(["taskkill", "/IM", "mpv.exe", "/F"], capture_output=True, timeout=2)
            logger.info("✅ 使用 taskkill 强制终止 MPV 进程")
        except Exception:
            pass

    logger.info("应用已关闭")


# ============================================
# 创建 FastAPI 应用
# ============================================

app = FastAPI(
    title="ClubMusic",
    description="ClubMusic - 网页音乐播放器",
    version="2.0.0",
    lifespan=lifespan
)

# 添加 CORS 中间件（允许跨域请求）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# 添加安全头中间件（允许YouTube iframe嵌入）
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    """添加安全头以支持YouTube iframe在Cloudflare tunnel中正常工作"""
    response = await call_next(request)

    csp_policy = (
        "default-src 'self' https:; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://static.cloudflareinsights.com; "
        "style-src 'self' 'unsafe-inline' https:; "
        "img-src 'self' data: https: http:; "
        "font-src 'self' data: https:; "
        "connect-src 'self' https: wss: ws:; "
        "media-src 'self' https: http: blob:; "
        "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; "
        "worker-src 'self' blob:; "
        "child-src 'self' https://www.youtube.com https://www.youtube-nocookie.com blob:;"
    )
    response.headers["Content-Security-Policy"] = csp_policy

    return response


# ============================================
# 挂载路由
# ============================================

app.include_router(playlist_router.router)
app.include_router(player_router.router)
app.include_router(search_router.router)
app.include_router(history_router.router)
app.include_router(media_router.router)
app.include_router(settings_router.router)
app.include_router(websocket_router.router)


# ============================================
# 挂载静态文件
# ============================================

try:
    static_dir = _get_resource_path("static")
    if os.path.isdir(static_dir):
        logger.debug(f"静态文件目录: {static_dir}")
        app.mount("/static", StaticFiles(directory=static_dir, check_dir=True), name="static")
        logger.info("静态文件已挂载到 /static")
    else:
        logger.error(f"静态文件目录不存在: {static_dir}")
except Exception as e:
    logger.warning(f"无法挂载static文件夹: {e}")
    import traceback
    traceback.print_exc()


# ============================================
# 错误处理
# ============================================

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """全局异常处理器"""
    return JSONResponse(
        {
            "status": "ERROR",
            "error": str(exc)
        },
        status_code=500
    )


if __name__ == "__main__":
    import uvicorn

    # 过滤 /status 和 /volume 的访问日志，防止刷屏
    class EndpointFilter(logging.Filter):
        def filter(self, record):
            message = record.getMessage()
            if '"/status"' in message or '"/volume"' in message:
                return False
            return True

    logging.getLogger("uvicorn.access").addFilter(EndpointFilter())

    uvicorn.run(app, host="0.0.0.0", port=80, access_log=False)
